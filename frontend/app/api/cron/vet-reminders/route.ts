import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizeToCanonical } from "@/lib/phone";

// =====================================================================
// CRON — Lembrete automatico de vacina (vertical Clinica Veterinaria).
//
// Varre as vacinas com next_due_at vencendo (ou ja vencidas) que ainda
// nao foram avisadas (reminder_sent=false), e dispara uma mensagem pelo
// WhatsApp da clinica (instancia conectada do tenant) para o tutor.
// Marca reminder_sent=true so quando o envio da certo (nao repete).
//
// Roda 1x/dia via scheduler externo (Easypanel cron / cron-job.org):
//   GET https://<app>/api/cron/vet-reminders
//   Header opcional: Authorization: Bearer <CRON_SECRET>
// =====================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMIND_WINDOW_DAYS = 7; // avisa a partir de 7 dias antes do vencimento
const BATCH = 200;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

function fmtDate(d: string): string {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
}

function buildMessage(opts: {
    tutor: string; pet: string; vaccine: string; dueAt: string; overdue: boolean; clinic: string;
}): string {
    const primeiroNome = (opts.tutor || "").trim().split(/\s+/)[0] || "tudo bem";
    const pet = opts.pet || "seu pet";
    const data = fmtDate(opts.dueAt);
    const assina = opts.clinic ? `\n\n🐾 ${opts.clinic}` : "";
    if (opts.overdue) {
        return `Oi ${primeiroNome}! Tudo bem? 🐾\n\nVi aqui no nosso sistema que a vacina ${opts.vaccine} do ${pet} venceu em ${data}. Que tal regularizar pra deixar ele protegido?\n\nÉ só me chamar por aqui que a gente já agenda. 💉${assina}`;
    }
    return `Oi ${primeiroNome}! Tudo bem? 🐾\n\nPassando pra lembrar que a vacina ${opts.vaccine} do ${pet} vence dia ${data}. Quer já deixar agendado?\n\nManda um oi por aqui que a gente marca. 💉${assina}`;
}

async function run(req: NextRequest) {
    // Auth opcional: se CRON_SECRET estiver setado, exige.
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const auth = req.headers.get("authorization");
        const qs = new URL(req.url).searchParams.get("secret");
        if (auth !== `Bearer ${secret}` && qs !== secret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionToken = process.env.EVOLUTION_API_TOKEN;
    if (!evolutionUrl || !evolutionToken) {
        return NextResponse.json({ error: "Evolution API nao configurada" }, { status: 500 });
    }

    const supabase = svc();

    try {
        // 1. Tenants com o modulo veterinaria LIGADO.
        const { data: enabledRows } = await supabase
            .from("tenant_modules")
            .select("tenant_id")
            .eq("module_key", "veterinaria")
            .eq("enabled", true);

        const tenantIds = (enabledRows ?? []).map((r: any) => r.tenant_id);
        if (tenantIds.length === 0) {
            return NextResponse.json({ processed: 0, reason: "nenhum tenant com modulo veterinaria" });
        }

        // 2. Janela de vencimento (hoje + N dias). Inclui vencidas (sem limite inferior).
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + REMIND_WINDOW_DAYS);
        const horizonStr = horizon.toISOString().slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);

        const { data: vaccines, error } = await supabase
            .from("pet_vaccines")
            .select("id, vaccine_name, next_due_at, tenant_id, pet:pets!inner(name, contact:contacts!inner(name, phone))")
            .in("tenant_id", tenantIds)
            .eq("reminder_sent", false)
            .not("next_due_at", "is", null)
            .lte("next_due_at", horizonStr)
            .limit(BATCH);
        if (error) throw error;

        if (!vaccines || vaccines.length === 0) {
            return NextResponse.json({ processed: 0, reason: "nenhuma vacina vencendo" });
        }

        // 3. Nome da clinica por tenant (para assinar a mensagem).
        const clinicByTenant: Record<string, string> = {};
        const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        for (const t of tenants ?? []) clinicByTenant[t.id] = t.name ?? "";

        // 4. Uma instancia conectada por tenant (cache).
        const instanceByTenant: Record<string, string | null> = {};
        async function getInstance(tenantId: string): Promise<string | null> {
            if (tenantId in instanceByTenant) return instanceByTenant[tenantId];
            const { data: insts } = await supabase
                .from("whatsapp_instances")
                .select("instance_name, status, purpose")
                .eq("tenant_id", tenantId)
                .eq("status", "connected");
            // Prefere instancias de uso CRM (ou sem purpose definido = crm por default).
            const chosen = (insts ?? []).find((i: any) => !i.purpose || i.purpose === "crm" || i.purpose === "both")
                ?? (insts ?? [])[0];
            instanceByTenant[tenantId] = chosen?.instance_name ?? null;
            return instanceByTenant[tenantId];
        }

        // 5. Envia e marca.
        const sentIds: string[] = [];
        const results: any[] = [];

        for (const v of vaccines as any[]) {
            const pet = v.pet;
            const contact = pet?.contact;
            const phoneRaw = contact?.phone;
            if (!phoneRaw) { results.push({ id: v.id, skipped: "sem telefone do tutor" }); continue; }

            const instanceName = await getInstance(v.tenant_id);
            if (!instanceName) { results.push({ id: v.id, skipped: "sem instancia conectada" }); continue; }

            const number = normalizeToCanonical(phoneRaw);
            const overdue = String(v.next_due_at) < todayStr;
            const text = buildMessage({
                tutor: contact?.name ?? "",
                pet: pet?.name ?? "",
                vaccine: v.vaccine_name,
                dueAt: v.next_due_at,
                overdue,
                clinic: clinicByTenant[v.tenant_id] ?? "",
            });

            try {
                const resp = await fetch(`${evolutionUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: evolutionToken },
                    body: JSON.stringify({ number, text, options: { linkPreview: false } }),
                    signal: AbortSignal.timeout(30000),
                });
                if (resp.ok) {
                    sentIds.push(v.id);
                    results.push({ id: v.id, ok: true, overdue });
                } else {
                    const err = await resp.text().catch(() => "");
                    results.push({ id: v.id, ok: false, status: resp.status, error: err.slice(0, 200) });
                }
            } catch (e: any) {
                results.push({ id: v.id, ok: false, error: e.message });
            }
        }

        // 6. Marca como avisadas (so as que enviaram).
        if (sentIds.length > 0) {
            await supabase.from("pet_vaccines").update({ reminder_sent: true }).in("id", sentIds);
        }

        return NextResponse.json({ processed: vaccines.length, sent: sentIds.length, results });
    } catch (e: any) {
        console.error("[vet-reminders] erro:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
