import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { DiagnosticoPdf } from "@/lib/prospeccao/DiagnosticoPdf";
import { slugFile, type Diagnostico } from "@/lib/prospeccao/diagnostico";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const { data: lead } = await svc()
        .from("prospeccao_leads")
        .select("empresa, cidade, nicho, diagnostico, diag_generated_at")
        .eq("diag_token", token)
        .maybeSingle();

    if (!lead || !lead.diagnostico) {
        return NextResponse.json({ error: "diagnostico nao encontrado" }, { status: 404 });
    }

    const dataFmt = lead.diag_generated_at
        ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(lead.diag_generated_at))
        : "";
    const subtitulo = [lead.nicho, lead.cidade].filter(Boolean).join(" · ");

    const buffer = await renderToBuffer(
        <DiagnosticoPdf d={lead.diagnostico as Diagnostico} empresa={lead.empresa} subtitulo={subtitulo} data={dataFmt} />
    );

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${slugFile(lead.empresa)}"`,
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    });
}
