import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gerarRespostaSDR, type TurnoConversa } from "@/lib/prospeccao/sdr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// Extrai telefone + texto de um payload MESSAGES_UPSERT do Evolution.
function parseEvolution(body: any): { telefone: string; texto: string } | null {
    const data = body?.data || body || {};
    const key = data.key || {};
    if (key.fromMe === true) return null;
    const jid: string = key.remoteJid || "";
    if (!jid || jid.includes("@g.us") || jid.includes("status@broadcast")) return null;
    const telefone = jid.split("@")[0].replace(/\D/g, "");
    if (!telefone) return null;
    const m = data.message || {};
    const texto = m.conversation || m?.extendedTextMessage?.text || "";
    if (!texto.trim()) return null;
    return { telefone, texto: texto.trim() };
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

export async function POST(req: Request) {
    // Sempre responde 200 rapido pro Evolution nao reenviar; erros sao engolidos.
    try {
        const body = await req.json().catch(() => ({}));
        const parsed = parseEvolution(body);
        if (!parsed) return NextResponse.json({ ok: true, skip: "sem mensagem util" });

        const supabase = svc();
        // Acha o lead da prospeccao por telefone (varias variantes de formatacao)
        const tel = parsed.telefone;
        const tel12 = tel.length === 13 && tel[4] === "9" ? tel.slice(0, 4) + tel.slice(5) : null;
        const alvos = [tel, tel12].filter(Boolean) as string[];
        const { data: leads } = await supabase
            .from("prospeccao_leads")
            .select("id, tenant_id, empresa, socio, nicho, cidade, dossie, telefone, sdr_ativo")
            .in("telefone", alvos)
            .limit(1);
        const lead = leads && leads[0];
        // Nao e lead da prospeccao (ou SDR desligado): ignora, nao interfere em nada.
        if (!lead || lead.sdr_ativo === false) return NextResponse.json({ ok: true, skip: "nao e lead da prospeccao" });

        // Registra a mensagem do lead + marca resposta
        const nowIso = new Date().toISOString();
        await supabase.from("prospeccao_conversas").insert({ tenant_id: lead.tenant_id, lead_id: lead.id, telefone: lead.telefone, origem: "lead", mensagem: parsed.texto });
        await supabase.from("prospeccao_leads").update({ ultima_resposta: nowIso, status: "RESPONDEU", updated_at: nowIso }).eq("id", lead.id);

        // Historico da conversa
        const { data: hist } = await supabase
            .from("prospeccao_conversas")
            .select("origem, mensagem, created_at")
            .eq("tenant_id", lead.tenant_id)
            .eq("telefone", lead.telefone)
            .order("created_at", { ascending: true })
            .limit(30);
        const historico: TurnoConversa[] = (hist || []).map((h) => ({ origem: h.origem === "sdr" ? "sdr" : "lead", mensagem: h.mensagem }));

        // Gera e envia a resposta do SDR
        const { resposta, precisa_humano } = await gerarRespostaSDR(
            { empresa: lead.empresa, socio: lead.socio, nicho: lead.nicho, cidade: lead.cidade, dossie: lead.dossie as any },
            historico,
            parsed.texto
        );

        await enviar(lead.telefone, resposta);
        await supabase.from("prospeccao_conversas").insert({ tenant_id: lead.tenant_id, lead_id: lead.id, telefone: lead.telefone, origem: "sdr", mensagem: resposta });

        if (precisa_humano) {
            const yuri = process.env.YURI_WHATSAPP;
            if (yuri) await enviar(yuri, `Prospeccao: o lead ${lead.empresa} (${lead.telefone}) precisa de voce. Ultima msg dele: "${parsed.texto}"`);
        }

        return NextResponse.json({ ok: true, respondido: true });
    } catch (e: any) {
        return NextResponse.json({ ok: true, erro: String(e?.message || e).slice(0, 200) });
    }
}

// GET simples pra teste de saude do endpoint.
export async function GET() {
    return NextResponse.json({ ok: true, endpoint: "prospeccao/webhook" });
}
