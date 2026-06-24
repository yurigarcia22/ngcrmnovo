import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// CRON do disparo de prospeccao. Roda a cada ~1 min. Para cada campanha 'running':
// respeita horario comercial (opcional), cap diario e o intervalo configurado,
// e envia 1 mensagem por tick pelo numero conectado (Evolution). 1/tick mantem
// o ritmo seguro e previsivel (rode o cron a cada minuto).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function hourInSaoPaulo(): number {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date());
    return Number(s);
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function renderMessage(template: string, name?: string | null): string {
    const first = (name || "").trim().split(/\s+/)[0] || "";
    return template.replace(/\{nome\}/gi, first).replace(/\s{2,}/g, " ").trim();
}

async function run(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const auth = req.headers.get("authorization");
        const qs = new URL(req.url).searchParams.get("secret");
        if (auth !== `Bearer ${secret}` && qs !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const evolutionUrl = (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
    const evolutionToken = process.env.EVOLUTION_API_TOKEN;
    if (!evolutionUrl || !evolutionToken) return NextResponse.json({ error: "Evolution nao configurada" }, { status: 500 });

    const supabase = svc();
    const hour = hourInSaoPaulo();
    const now = Date.now();
    const todayStart = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) + "T00:00:00";

    const { data: campaigns } = await supabase
        .from("dispatch_campaigns")
        .select("*")
        .eq("status", "running");

    if (!campaigns || campaigns.length === 0) return NextResponse.json({ processed: 0, reason: "nenhuma campanha rodando" });

    const results: any[] = [];

    for (const c of campaigns) {
        // Horario comercial (8h-20h America/Sao_Paulo)
        if (c.business_hours_only && (hour < 8 || hour >= 20)) {
            results.push({ campaign: c.id, skipped: "fora do horario" });
            continue;
        }

        // Cap diario
        const { count: sentToday } = await supabase
            .from("dispatch_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .eq("status", "sent")
            .gte("sent_at", todayStart);
        if ((sentToday ?? 0) >= c.daily_cap) {
            results.push({ campaign: c.id, skipped: `cap diario atingido (${c.daily_cap})` });
            continue;
        }

        // Intervalo desde o ultimo envio
        if (c.last_sent_at) {
            const elapsed = (now - new Date(c.last_sent_at).getTime()) / 1000;
            const target = c.interval_min_sec + Math.random() * Math.max(0, c.interval_max_sec - c.interval_min_sec);
            if (elapsed < target) {
                results.push({ campaign: c.id, skipped: "aguardando intervalo" });
                continue;
            }
        }

        // Proximo destinatario pendente
        const { data: rec } = await supabase
            .from("dispatch_recipients")
            .select("id, name, phone")
            .eq("campaign_id", c.id)
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (!rec) {
            await supabase.from("dispatch_campaigns").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", c.id);
            results.push({ campaign: c.id, done: true });
            continue;
        }

        const text = renderMessage(pick(c.messages as string[]), rec.name);
        try {
            const resp = await fetch(`${evolutionUrl}/message/sendText/${encodeURIComponent(c.instance_name)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evolutionToken },
                body: JSON.stringify({ number: rec.phone, text, options: { linkPreview: false } }),
                signal: AbortSignal.timeout(30000),
            });
            if (resp.ok) {
                await supabase.from("dispatch_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", rec.id);
                await supabase.from("dispatch_campaigns").update({ last_sent_at: new Date().toISOString() }).eq("id", c.id);
                results.push({ campaign: c.id, sent: rec.phone });
            } else {
                const err = (await resp.text().catch(() => "")).slice(0, 200);
                await supabase.from("dispatch_recipients").update({ status: "failed", error: `HTTP ${resp.status}: ${err}` }).eq("id", rec.id);
                results.push({ campaign: c.id, failed: rec.phone, status: resp.status });
            }
        } catch (e: any) {
            await supabase.from("dispatch_recipients").update({ status: "failed", error: e.message }).eq("id", rec.id);
            results.push({ campaign: c.id, failed: rec.phone, error: e.message });
        }
    }

    return NextResponse.json({ processed: results.length, results });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
