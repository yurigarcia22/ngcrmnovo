import { NextResponse } from "next/server";
import { handleProspeccaoInbound } from "@/lib/prospeccao/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Grupo CONTEUDOS ELLITE (WhatsApp). Comando "!ativar" aqui forca o disparo dos stories.
const GRUPO_STORIES = "120363430231759134@g.us";
const N8N_STORIES_WEBHOOK = process.env.N8N_STORIES_WEBHOOK || "https://n8n.grupong.online/webhook/stories-ativar";

// Repassa o comando "!ativar" do grupo de stories pro n8n. A prospeccao IGNORA mensagens
// de grupo (parseEvolutionInbound retorna null pra @g.us), entao isso nao interfere nela.
async function repassarAtivarParaN8n(body: any): Promise<void> {
    try {
        const data = body?.data || body || {};
        const key = data.key || {};
        if (key.fromMe === true) return;
        if ((key.remoteJid || "") !== GRUPO_STORIES) return;
        const m = data.message || {};
        const texto = (m.conversation || m?.extendedTextMessage?.text || "").trim();
        if (!texto.toLowerCase().startsWith("!ativar")) return;
        await fetch(N8N_STORIES_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }).catch(() => {});
    } catch {
        // nunca lanca: o repasse dos stories nao pode quebrar o webhook da prospeccao
    }
}

export async function POST(req: Request) {
    // Sempre responde 200 rapido pro Evolution nao reenviar; erros sao engolidos.
    try {
        const body = await req.json().catch(() => ({}));
        await repassarAtivarParaN8n(body);
        const r = await handleProspeccaoInbound(body);
        return NextResponse.json({ ok: true, ...r });
    } catch (e: any) {
        return NextResponse.json({ ok: true, erro: String(e?.message || e).slice(0, 200) });
    }
}

export async function GET() {
    return NextResponse.json({ ok: true, endpoint: "prospeccao/webhook" });
}
