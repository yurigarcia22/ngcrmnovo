import { NextResponse } from "next/server";
import { handleProspeccaoInbound } from "@/lib/prospeccao/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
    // Sempre responde 200 rapido pro Evolution nao reenviar; erros sao engolidos.
    try {
        const body = await req.json().catch(() => ({}));
        const r = await handleProspeccaoInbound(body);
        return NextResponse.json({ ok: true, ...r });
    } catch (e: any) {
        return NextResponse.json({ ok: true, erro: String(e?.message || e).slice(0, 200) });
    }
}

export async function GET() {
    return NextResponse.json({ ok: true, endpoint: "prospeccao/webhook" });
}
