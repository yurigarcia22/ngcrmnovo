"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { isModuleEnabled } from "@/lib/modules";
import { normalizeToCanonical, isPlausibleBRPhone } from "@/lib/phone";
import { enriquecerLead, type DossieLead } from "@/lib/prospeccao/enrich";
import { gerarDiagnostico as gerarDiagnosticoIA } from "@/lib/prospeccao/diagnostico";
import { revalidatePath } from "next/cache";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function assertProspeccao(): Promise<string> {
    const tenantId = await getTenantId();
    if (!(await isModuleEnabled(tenantId, "prospeccao"))) throw new Error("Módulo Prospecção desativado.");
    return tenantId;
}

export interface ProspeccaoLead {
    id: string;
    empresa: string;
    cnpj: string | null;
    site: string | null;
    instagram: string | null;
    telefone: string | null;
    cidade: string | null;
    nicho: string | null;
    status: string;
    socio: string | null;
    dossie: DossieLead | null;
    diag_token: string | null;
    erro: string | null;
    enriched_at: string | null;
    created_at: string;
}

export async function listLeads() {
    try {
        const tenantId = await assertProspeccao();
        const { data, error } = await svc()
            .from("prospeccao_leads")
            .select("id, empresa, cnpj, site, instagram, telefone, cidade, nicho, status, socio, dossie, diag_token, erro, enriched_at, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
        if (error) throw error;
        return { success: true, leads: (data ?? []) as ProspeccaoLead[] };
    } catch (e: any) {
        return { success: false, leads: [] as ProspeccaoLead[], error: e.message };
    }
}

export interface NovoLeadInput {
    empresa: string;
    cnpj?: string;
    site?: string;
    instagram?: string;
    telefone?: string;
    cidade?: string;
    nicho?: string;
}

export async function addLead(input: NovoLeadInput) {
    try {
        const tenantId = await assertProspeccao();
        if (!input.empresa?.trim()) throw new Error("Informe o nome da empresa.");

        let telefone: string | null = null;
        if (input.telefone && isPlausibleBRPhone(input.telefone)) telefone = normalizeToCanonical(input.telefone);

        const { data, error } = await svc()
            .from("prospeccao_leads")
            .insert({
                tenant_id: tenantId,
                empresa: input.empresa.trim(),
                cnpj: input.cnpj?.trim() || null,
                site: input.site?.trim() || null,
                instagram: input.instagram?.trim() || null,
                telefone,
                cidade: input.cidade?.trim() || null,
                nicho: input.nicho?.trim() || null,
                status: "novo",
            })
            .select("id")
            .single();
        if (error) throw error;

        revalidatePath("/prospeccao");
        return { success: true, id: data.id };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Importa varias linhas: "empresa;cnpj;site;cidade;nicho;telefone" (; ou tab).
// So "empresa" e obrigatoria; o resto pode ficar vazio.
export async function importLeads(raw: string) {
    try {
        const tenantId = await assertProspeccao();
        const lines = (raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const rows: any[] = [];
        let ignoradas = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i === 0 && /empresa|cnpj|site|nicho|cidade/i.test(line) && /[;\t]/.test(line)) continue; // cabecalho
            const p = line.split(/[;\t]/).map((c) => c.trim());
            const empresa = p[0];
            if (!empresa) { ignoradas++; continue; }
            const telefoneRaw = p[5] || "";
            const telefone = telefoneRaw && isPlausibleBRPhone(telefoneRaw) ? normalizeToCanonical(telefoneRaw) : null;
            rows.push({
                tenant_id: tenantId,
                empresa,
                cnpj: p[1] || null,
                site: p[2] || null,
                cidade: p[3] || null,
                nicho: p[4] || null,
                telefone,
                status: "novo",
            });
        }
        if (rows.length === 0) throw new Error("Nenhuma linha válida. Formato: empresa;cnpj;site;cidade;nicho;telefone");

        for (let i = 0; i < rows.length; i += 500) {
            const { error } = await svc().from("prospeccao_leads").insert(rows.slice(i, i + 500));
            if (error) throw error;
        }

        revalidatePath("/prospeccao");
        return { success: true, total: rows.length, ignoradas };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Import estruturado (wizard de planilha): recebe linhas ja mapeadas e insere em lotes.
export async function importLeadRows(rows: NovoLeadInput[]) {
    try {
        const tenantId = await assertProspeccao();
        const input = Array.isArray(rows) ? rows.slice(0, 2000) : [];
        const clean = input
            .map((r) => {
                const telefoneRaw = (r.telefone || "").trim();
                return {
                    tenant_id: tenantId,
                    empresa: (r.empresa || "").trim(),
                    cnpj: r.cnpj?.trim() || null,
                    site: r.site?.trim() || null,
                    instagram: r.instagram?.trim() || null,
                    telefone: telefoneRaw && isPlausibleBRPhone(telefoneRaw) ? normalizeToCanonical(telefoneRaw) : null,
                    cidade: r.cidade?.trim() || null,
                    nicho: r.nicho?.trim() || null,
                    status: "novo",
                };
            })
            .filter((r) => r.empresa);
        if (clean.length === 0) throw new Error("Nenhuma linha válida (empresa é obrigatória).");

        const supabase = svc();
        for (let i = 0; i < clean.length; i += 500) {
            const { error } = await supabase.from("prospeccao_leads").insert(clean.slice(i, i + 500));
            if (error) throw error;
        }

        revalidatePath("/prospeccao");
        return { success: true, total: clean.length };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Roda a pesquisa (enriquecimento + dossie) de UM lead.
export async function enrichLead(id: string) {
    try {
        const tenantId = await assertProspeccao();
        const supabase = svc();

        const { data: lead, error: e1 } = await supabase
            .from("prospeccao_leads")
            .select("id, empresa, cnpj, site, instagram, cidade, nicho")
            .eq("tenant_id", tenantId)
            .eq("id", id)
            .single();
        if (e1 || !lead) throw new Error("Lead não encontrado.");

        await supabase.from("prospeccao_leads").update({ status: "pesquisando", erro: null }).eq("tenant_id", tenantId).eq("id", id);

        try {
            const res = await enriquecerLead({
                empresa: lead.empresa,
                cnpj: lead.cnpj,
                site: lead.site,
                instagram: lead.instagram,
                cidade: lead.cidade,
                nicho: lead.nicho,
            });
            const { error: e2 } = await supabase
                .from("prospeccao_leads")
                .update({
                    status: "pronto",
                    socio: res.socio || null,
                    dossie: res.dossie,
                    raw_enrichment: res.raw,
                    erro: null,
                    enriched_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("tenant_id", tenantId)
                .eq("id", id);
            if (e2) throw e2;
            revalidatePath("/prospeccao");
            return { success: true };
        } catch (inner: any) {
            await supabase
                .from("prospeccao_leads")
                .update({ status: "erro", erro: String(inner.message || inner).slice(0, 500), updated_at: new Date().toISOString() })
                .eq("tenant_id", tenantId)
                .eq("id", id);
            revalidatePath("/prospeccao");
            return { success: false, error: inner.message || "Falha ao pesquisar." };
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Edita a mensagem_1 do dossie (revisao humana antes de aprovar).
export async function updateMensagem(id: string, mensagem: string) {
    try {
        const tenantId = await assertProspeccao();
        const supabase = svc();
        const { data: lead, error: e1 } = await supabase
            .from("prospeccao_leads")
            .select("dossie")
            .eq("tenant_id", tenantId)
            .eq("id", id)
            .single();
        if (e1 || !lead) throw new Error("Lead não encontrado.");
        const dossie = (lead.dossie || {}) as DossieLead;
        dossie.mensagem_1 = mensagem;
        const { error: e2 } = await supabase
            .from("prospeccao_leads")
            .update({ dossie, updated_at: new Date().toISOString() })
            .eq("tenant_id", tenantId)
            .eq("id", id);
        if (e2) throw e2;
        revalidatePath("/prospeccao");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Gera (ou regenera) o diagnostico aprofundado e devolve o token do link publico.
export async function gerarDiagnostico(id: string) {
    try {
        const tenantId = await assertProspeccao();
        const supabase = svc();
        const { data: lead, error: e1 } = await supabase
            .from("prospeccao_leads")
            .select("id, empresa, cnpj, site, instagram, cidade, nicho, diag_token")
            .eq("tenant_id", tenantId)
            .eq("id", id)
            .single();
        if (e1 || !lead) throw new Error("Lead não encontrado.");

        // Biblioteca de cases reais do tenant (prova social por nicho)
        const { data: cases } = await supabase
            .from("prospeccao_cases")
            .select("nicho, cliente, cliente_publico, headline, metrica, valor_antes, valor_depois, prazo, o_que_fizemos")
            .eq("tenant_id", tenantId)
            .eq("ativo", true);

        const { diagnostico, socio } = await gerarDiagnosticoIA({
            empresa: lead.empresa, cnpj: lead.cnpj, site: lead.site,
            instagram: lead.instagram, cidade: lead.cidade, nicho: lead.nicho,
        }, cases || []);

        const token = lead.diag_token || globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 24);
        const patch: Record<string, unknown> = {
            diagnostico,
            diag_token: token,
            diag_generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        if (socio) patch.socio = socio;

        const { error: e2 } = await supabase.from("prospeccao_leads").update(patch).eq("tenant_id", tenantId).eq("id", id);
        if (e2) throw e2;

        revalidatePath("/prospeccao");
        return { success: true, token };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Gera o PDF do diagnostico e envia como DOCUMENTO (arquivo) no WhatsApp do lead.
// Nao manda link: o lead recebe "Diagnostico-Empresa.pdf" direto na conversa.
export async function enviarDiagnosticoWhatsapp(id: string, legenda?: string) {
    try {
        const tenantId = await assertProspeccao();
        const supabase = svc();
        const { data: lead, error } = await supabase
            .from("prospeccao_leads")
            .select("empresa, cidade, nicho, telefone, diagnostico, diag_generated_at, diag_token")
            .eq("tenant_id", tenantId)
            .eq("id", id)
            .single();
        if (error || !lead) throw new Error("Lead não encontrado.");
        if (!lead.telefone) throw new Error("Este lead não tem telefone cadastrado.");

        let diagnostico = lead.diagnostico;
        if (!diagnostico) {
            const g = await gerarDiagnostico(id);
            if (!g.success) throw new Error(g.error || "Falha ao gerar o diagnóstico.");
            const { data: re } = await supabase.from("prospeccao_leads").select("diagnostico, diag_generated_at").eq("tenant_id", tenantId).eq("id", id).single();
            diagnostico = re?.diagnostico;
        }
        if (!diagnostico) throw new Error("Diagnóstico indisponível.");

        // Render do PDF em base64 (mesmo componente da rota /api/prospeccao/diag-pdf)
        const { renderToBuffer } = await import("@react-pdf/renderer");
        const { DiagnosticoPdf } = await import("@/lib/prospeccao/DiagnosticoPdf");
        const { slugFile } = await import("@/lib/prospeccao/diagnostico");
        const dataFmt = lead.diag_generated_at
            ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(lead.diag_generated_at))
            : "";
        const subtitulo = [lead.nicho, lead.cidade].filter(Boolean).join(" · ");
        const React = (await import("react")).default;
        const el = React.createElement(DiagnosticoPdf, { d: diagnostico, empresa: lead.empresa, subtitulo, data: dataFmt });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buffer = await renderToBuffer(el as any);
        const base64 = Buffer.from(buffer).toString("base64");
        const fileName = slugFile(lead.empresa);

        const evoUrl = process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL;
        const evoToken = process.env.EVOLUTION_API_TOKEN || process.env.EVOLUTION_API_KEY;
        const instancia = process.env.EVOLUTION_INSTANCE || "Izabella";
        if (!evoUrl || !evoToken) throw new Error("Evolution não configurada (EVOLUTION_API_URL / EVOLUTION_API_TOKEN).");

        const res = await fetch(`${evoUrl}/message/sendMedia/${instancia}`, {
            method: "POST",
            headers: { apikey: evoToken, "Content-Type": "application/json" },
            body: JSON.stringify({
                number: String(lead.telefone).replace(/\D/g, ""),
                mediatype: "document",
                mimetype: "application/pdf",
                media: base64,
                fileName,
                caption: legenda || `Oi! Preparei um raio-x comercial rapido da ${lead.empresa}. Da uma olhada quando puder.`,
            }),
        });
        const body = await res.text();
        if (!res.ok) throw new Error(`Envio falhou (${res.status}): ${body.slice(0, 200)}`);

        return { success: true, fileName };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function setLeadStatus(id: string, status: "novo" | "aprovado") {
    try {
        const tenantId = await assertProspeccao();
        const { error } = await svc()
            .from("prospeccao_leads")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("tenant_id", tenantId)
            .eq("id", id);
        if (error) throw error;
        revalidatePath("/prospeccao");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteLead(id: string) {
    try {
        const tenantId = await assertProspeccao();
        const { error } = await svc().from("prospeccao_leads").delete().eq("tenant_id", tenantId).eq("id", id);
        if (error) throw error;
        revalidatePath("/prospeccao");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
