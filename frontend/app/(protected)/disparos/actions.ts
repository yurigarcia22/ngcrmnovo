"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { isModuleEnabled } from "@/lib/modules";
import { normalizeToCanonical, isPlausibleBRPhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function assertDisparos(): Promise<string> {
    const tenantId = await getTenantId();
    if (!(await isModuleEnabled(tenantId, "disparos"))) throw new Error("Módulo Disparos desativado.");
    return tenantId;
}

export interface ParsedRecipient { name: string; phone: string; }

// Parser: aceita "nome;telefone", "nome,telefone", "telefone" — uma linha por contato.
// CSV com cabecalho (nome/telefone ou name/phone) tambem funciona.
// Helper INTERNO (nao exportado): em arquivo "use server" toda export deve ser async.
function parseRecipientList(raw: string): { ok: ParsedRecipient[]; invalid: number; duplicates: number } {
    const lines = (raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const ok: ParsedRecipient[] = [];
    const seen = new Set<string>();
    let invalid = 0, duplicates = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // pula cabecalho csv
        if (i === 0 && /nome|name|telefone|phone|whatsapp/i.test(line) && /[;,]/.test(line)) continue;
        const parts = line.split(/[;,\t]/).map((p) => p.trim());
        let name = "", phoneRaw = "";
        if (parts.length >= 2) {
            // detecta qual coluna e o telefone (a que tem mais digitos)
            const a = parts[0], b = parts[1];
            const aDigits = a.replace(/\D/g, "").length, bDigits = b.replace(/\D/g, "").length;
            if (bDigits >= aDigits) { name = a; phoneRaw = b; } else { name = b; phoneRaw = a; }
        } else {
            phoneRaw = parts[0];
        }
        if (!isPlausibleBRPhone(phoneRaw)) { invalid++; continue; }
        const phone = normalizeToCanonical(phoneRaw);
        if (seen.has(phone)) { duplicates++; continue; }
        seen.add(phone);
        ok.push({ name: name || "", phone });
    }
    return { ok, invalid, duplicates };
}

// Instancias conectadas (numeros) que podem disparar.
export async function getDispatchInstances() {
    try {
        const tenantId = await assertDisparos();
        const { data } = await svc()
            .from("whatsapp_instances")
            .select("instance_name, custom_name, phone_number, status")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
        return { success: true, instances: data ?? [] };
    } catch (e: any) {
        return { success: false, instances: [], error: e.message };
    }
}

export interface CampaignInput {
    name: string;
    instanceName: string;
    messages: string[];
    intervalMinSec: number;
    intervalMaxSec: number;
    dailyCap: number;
    businessHoursOnly: boolean;
    recipientsRaw: string;
}

export async function createCampaign(input: CampaignInput) {
    try {
        const tenantId = await assertDisparos();
        const messages = (input.messages ?? []).map((m) => m.trim()).filter(Boolean);
        if (!input.name?.trim()) throw new Error("Dê um nome à campanha.");
        if (!input.instanceName) throw new Error("Escolha o número que vai disparar.");
        if (messages.length === 0) throw new Error("Escreva ao menos uma mensagem.");

        const parsed = parseRecipientList(input.recipientsRaw);
        if (parsed.ok.length === 0) throw new Error("Nenhum contato válido na lista.");

        const min = Math.max(5, Math.min(input.intervalMinSec || 40, input.intervalMaxSec || 120));
        const max = Math.max(min, input.intervalMaxSec || 120);

        const supabase = svc();
        const { data: camp, error } = await supabase
            .from("dispatch_campaigns")
            .insert({
                tenant_id: tenantId,
                name: input.name.trim(),
                instance_name: input.instanceName,
                messages,
                interval_min_sec: min,
                interval_max_sec: max,
                daily_cap: Math.max(1, input.dailyCap || 200),
                business_hours_only: input.businessHoursOnly !== false,
                status: "draft",
            })
            .select("id")
            .single();
        if (error) throw error;

        // Insere destinatarios (em lotes)
        const rows = parsed.ok.map((r) => ({ campaign_id: camp.id, tenant_id: tenantId, name: r.name || null, phone: r.phone }));
        for (let i = 0; i < rows.length; i += 500) {
            const { error: rErr } = await supabase.from("dispatch_recipients").insert(rows.slice(i, i + 500));
            if (rErr) throw rErr;
        }

        revalidatePath("/disparos");
        return { success: true, campaignId: camp.id, total: parsed.ok.length, invalid: parsed.invalid, duplicates: parsed.duplicates };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Monta a "view" das campanhas: contagens + se o numero esta conectado.
async function loadCampaignsView(supabase: ReturnType<typeof svc>, tenantId: string) {
    const { data: camps } = await supabase
        .from("dispatch_campaigns")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

    const { data: insts } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("tenant_id", tenantId);
    const statusByName: Record<string, string> = {};
    for (const i of insts ?? []) statusByName[i.instance_name] = i.status;

    const result = [];
    for (const c of camps ?? []) {
        const { data: counts } = await supabase
            .from("dispatch_recipients")
            .select("status")
            .eq("campaign_id", c.id);
        const total = (counts ?? []).length;
        const sent = (counts ?? []).filter((x) => x.status === "sent").length;
        const failed = (counts ?? []).filter((x) => x.status === "failed").length;
        result.push({
            ...c,
            total, sent, failed, pending: total - sent - failed,
            instanceConnected: statusByName[c.instance_name] === "connected",
        });
    }
    return result;
}

export async function listCampaigns() {
    try {
        const tenantId = await assertDisparos();
        return { success: true, campaigns: await loadCampaignsView(svc(), tenantId) };
    } catch (e: any) {
        return { success: false, campaigns: [], error: e.message };
    }
}

// Versao leve para polling em tempo real (mesma forma).
export async function getDispatchLive() {
    try {
        const tenantId = await assertDisparos();
        return { success: true, campaigns: await loadCampaignsView(svc(), tenantId) };
    } catch (e: any) {
        return { success: false, campaigns: [], error: e.message };
    }
}

export async function setCampaignStatus(id: string, status: "running" | "paused" | "draft") {
    try {
        const tenantId = await assertDisparos();
        const { error } = await svc()
            .from("dispatch_campaigns")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", id).eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/disparos");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteCampaign(id: string) {
    try {
        const tenantId = await assertDisparos();
        const { error } = await svc().from("dispatch_campaigns").delete().eq("id", id).eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/disparos");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
