/**
 * Processa uma mensagem recebida (inbound) de um lead da Prospeccao e aciona o SDR.
 * Usado tanto pela rota /api/prospeccao/webhook quanto pelo handler do webinar
 * (que intercepta a instancia dedicada Izabella e delega pra ca).
 *
 * Idempotente e tolerante: nunca lanca; retorna se tratou ou nao.
 */

import { createClient } from "@supabase/supabase-js";
import { gerarRespostaSDR, type TurnoConversa } from "./sdr";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export function parseEvolutionInbound(body: any): { telefone: string; texto: string; msgId: string } | null {
    const data = body?.data || body || {};
    const key = data.key || {};
    if (key.fromMe === true) return null;
    const jid: string = (key.remoteJid || "").endsWith("@lid") && key.senderPn ? key.senderPn : key.remoteJid || "";
    if (!jid || jid.includes("@g.us") || jid.includes("status@broadcast")) return null;
    const telefone = jid.split("@")[0].replace(/\D/g, "");
    if (!telefone) return null;
    const m = data.message || {};
    const texto = m.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || "";
    if (!texto.trim()) return null;
    return { telefone, texto: texto.trim(), msgId: key.id || "" };
}

async function enviar(numero: string, texto: string) {
    const url = process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL;
    const token = process.env.EVOLUTION_API_TOKEN || process.env.EVOLUTION_API_KEY;
    const inst = process.env.EVOLUTION_INSTANCE || "Izabella";
    if (!url || !token) return;
    await fetch(`${url}/message/sendText/${inst}`, {
        method: "POST",
        headers: { apikey: token, "Content-Type": "application/json" },
        body: JSON.stringify({ number: numero, text: texto, delay: 1200 }),
    }).catch(() => {});
}

export async function handleProspeccaoInbound(body: any): Promise<{ tratado: boolean; motivo?: string }> {
    try {
        const parsed = parseEvolutionInbound(body);
        if (!parsed) return { tratado: false, motivo: "sem mensagem util" };

        const supabase = svc();
        const tel = parsed.telefone;
        const tel12 = tel.length === 13 && tel[4] === "9" ? tel.slice(0, 4) + tel.slice(5) : null;
        const tel13 = tel.length === 12 ? tel.slice(0, 4) + "9" + tel.slice(4) : null;
        const alvos = Array.from(new Set([tel, tel12, tel13].filter(Boolean))) as string[];

        const { data: leads } = await supabase
            .from("prospeccao_leads")
            .select("id, tenant_id, empresa, socio, nicho, cidade, dossie, telefone, sdr_ativo")
            .in("telefone", alvos)
            .limit(1);
        const lead = leads && leads[0];
        if (!lead) return { tratado: false, motivo: "nao e lead da prospeccao" };
        if (lead.sdr_ativo === false) return { tratado: true, motivo: "sdr desligado" };

        // Idempotencia: se ja registramos essa msg do lead, nao responde de novo
        if (parsed.msgId) {
            const { data: dup } = await supabase
                .from("prospeccao_conversas")
                .select("id")
                .eq("tenant_id", lead.tenant_id)
                .eq("telefone", lead.telefone)
                .eq("origem", "lead")
                .eq("mensagem", parsed.texto)
                .gte("created_at", new Date(Date.now() - 60000).toISOString())
                .limit(1);
            if (dup && dup.length) return { tratado: true, motivo: "duplicada" };
        }

        const nowIso = new Date().toISOString();
        await supabase.from("prospeccao_conversas").insert({ tenant_id: lead.tenant_id, lead_id: lead.id, telefone: lead.telefone, origem: "lead", mensagem: parsed.texto });
        await supabase.from("prospeccao_leads").update({ ultima_resposta: nowIso, status: "RESPONDEU", updated_at: nowIso }).eq("id", lead.id);

        const { data: hist } = await supabase
            .from("prospeccao_conversas")
            .select("origem, mensagem, created_at")
            .eq("tenant_id", lead.tenant_id)
            .eq("telefone", lead.telefone)
            .order("created_at", { ascending: true })
            .limit(30);
        const historico: TurnoConversa[] = (hist || []).map((h) => ({ origem: h.origem === "sdr" ? "sdr" : "lead", mensagem: h.mensagem }));

        const { resposta, precisa_humano } = await gerarRespostaSDR(
            { empresa: lead.empresa, socio: lead.socio, nicho: lead.nicho, cidade: lead.cidade, dossie: lead.dossie as any },
            historico,
            parsed.texto
        );

        await enviar(lead.telefone, resposta);
        await supabase.from("prospeccao_conversas").insert({ tenant_id: lead.tenant_id, lead_id: lead.id, telefone: lead.telefone, origem: "sdr", mensagem: resposta });

        if (precisa_humano && process.env.YURI_WHATSAPP) {
            await enviar(process.env.YURI_WHATSAPP, `Prospeccao: o lead ${lead.empresa} (${lead.telefone}) precisa de voce. Ultima msg: "${parsed.texto}"`);
        }
        return { tratado: true, motivo: "respondido" };
    } catch (e: any) {
        console.error("[prospeccao inbound] erro:", e?.message || e);
        return { tratado: false, motivo: "erro" };
    }
}
