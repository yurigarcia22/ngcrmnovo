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

// Verifica no Evolution se a instancia esta conectada (state 'open'). Cache por run.
async function isInstanceConnected(url: string, token: string, instance: string, cache: Record<string, boolean>): Promise<boolean> {
    if (instance in cache) return cache[instance];
    try {
        const r = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instance)}`, {
            headers: { apikey: token }, signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) { cache[instance] = false; return false; }
        const d = await r.json().catch(() => ({}));
        const ok = d?.instance?.state === "open";
        cache[instance] = ok;
        return ok;
    } catch {
        cache[instance] = false;
        return false;
    }
}

// Erro de conexao (numero caiu) vs erro do numero (sem whatsapp). Conexao NAO queima o contato.
function isConnectionError(status: number, body: string): boolean {
    if (status >= 500) return true;
    return /connection closed|connection lost|not connected|disconnected|no session|timed out/i.test(body || "");
}

function renderMessage(template: string, name?: string | null): string {
    const nome = (name || "").trim();
    // Substitui {nome} (tolera espacos: { nome }) pelo nome COMPLETO. Preserva as
    // quebras de linha do texto (NAO usar \s, que comeria \n) — so limpa espacos
    // repetidos e espaco antes de pontuacao (caso o nome venha vazio).
    return template
        .replace(/\{\s*nome\s*\}/gi, nome)
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([!?.,:;])/g, "$1")
        .trim();
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
    const connCache: Record<string, boolean> = {};

    // Pausa a campanha e marca o motivo (sem queimar contatos).
    async function pauseDisconnected(campaignId: string) {
        await supabase.from("dispatch_campaigns")
            .update({ status: "paused", pause_reason: "numero_desconectado", updated_at: new Date().toISOString() })
            .eq("id", campaignId);
    }

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

        // NUMERO DESCONECTOU? -> pausa a campanha e NAO queima contato.
        const connected = await isInstanceConnected(evolutionUrl, evolutionToken, c.instance_name, connCache);
        if (!connected) {
            await pauseDisconnected(c.id);
            results.push({ campaign: c.id, paused: "numero desconectado" });
            continue;
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
                const body = (await resp.text().catch(() => "")) || "";
                if (isConnectionError(resp.status, body)) {
                    // numero caiu no meio do envio -> pausa, deixa o contato PENDENTE (nao queima)
                    await pauseDisconnected(c.id);
                    results.push({ campaign: c.id, paused: "numero desconectado (falha de envio)" });
                } else {
                    // erro do numero (ex: sem WhatsApp) -> marca falha e segue
                    await supabase.from("dispatch_recipients").update({ status: "failed", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` }).eq("id", rec.id);
                    results.push({ campaign: c.id, failed: rec.phone, status: resp.status });
                }
            }
        } catch (e: any) {
            // timeout/rede = problema de conexao -> pausa sem queimar o contato
            await pauseDisconnected(c.id);
            results.push({ campaign: c.id, paused: "erro de conexao", detail: e.message });
        }
    }

    return NextResponse.json({ processed: results.length, results });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
