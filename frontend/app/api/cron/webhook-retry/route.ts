import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WEBHOOK_FN_URL = 'https://twsnyobgvwvuqjgemrca.supabase.co/functions/v1/webhook-evolution';
const MAX_ATTEMPTS = 5;
const BATCH = 20;

// Reprocessa eventos do webhook que falharam (status 'error') ou que travaram
// no meio ('received' ha mais de 5 min — a funcao morreu processando). Como a
// edge function e idempotente (checa evolution_message_id), reprocessar e seguro.
export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const results = { retried: 0, ok: 0, failed: 0, cleaned: 0 };

    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data: events } = await supabase
            .from('webhook_events')
            .select('id, payload, attempts, status, created_at')
            .or(`status.eq.error,and(status.eq.received,created_at.lt.${fiveMinAgo})`)
            .lt('attempts', MAX_ATTEMPTS)
            .order('id', { ascending: true })
            .limit(BATCH);

        for (const ev of events ?? []) {
            // Incrementa ANTES de tentar: se o replay travar, nao entra em loop infinito.
            await supabase.from('webhook_events')
                .update({ attempts: (ev.attempts ?? 0) + 1 })
                .eq('id', ev.id);

            results.retried++;
            try {
                const r = await fetch(WEBHOOK_FN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-replay-event-id': String(ev.id),
                    },
                    body: JSON.stringify(ev.payload),
                    signal: AbortSignal.timeout(45_000),
                });
                if (r.ok) results.ok++;
                else results.failed++;
            } catch {
                results.failed++;
            }
        }

        // Higiene: processados/ignorados > 14 dias; orfaos/erros esgotados > 30 dias.
        const d14 = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
        const d30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
        const { count: c1 } = await supabase.from('webhook_events')
            .delete({ count: 'exact' })
            .in('status', ['processed', 'ignored'])
            .lt('created_at', d14);
        const { count: c2 } = await supabase.from('webhook_events')
            .delete({ count: 'exact' })
            .in('status', ['orphan', 'error'])
            .lt('created_at', d30);
        results.cleaned = (c1 ?? 0) + (c2 ?? 0);

        return NextResponse.json({ success: true, ...results });
    } catch (e: any) {
        console.error('webhook-retry error:', e);
        return NextResponse.json({ success: false, error: e.message, ...results }, { status: 500 });
    }
}
