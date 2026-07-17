import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const WEBHOOK_FN_URL = 'https://twsnyobgvwvuqjgemrca.supabase.co/functions/v1/webhook-evolution';
const WINDOW_HOURS = 24;      // janela de comparacao
const MAX_INJECT_PER_INSTANCE = 30; // seguranca por rodada
const PAGES_PER_INSTANCE = 3; // ~100 msgs/pagina

// Rede de seguranca contra webhook perdido: compara o historico que a PROPRIA
// Evolution guarda com o banco do CRM e reinjeta (via edge function, que e
// idempotente) as mensagens recebidas que nunca chegaram. Cobre: Evolution nao
// entregou o webhook, edge function fora do ar, deploy no meio, etc.
export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const evoToken = process.env.EVOLUTION_API_TOKEN || '';

    const summary: Record<string, any> = {};

    try {
        if (!evoUrl || !evoToken) throw new Error('EVOLUTION_API_URL/TOKEN ausentes');

        const { data: instances } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, tenant_id');

        const cutoff = Math.floor(Date.now() / 1000) - WINDOW_HOURS * 3600;

        for (const inst of instances ?? []) {
            const name = inst.instance_name;
            const stats = { scanned: 0, missing: 0, injected: 0, errors: 0 };
            summary[name] = stats;

            try {
                // 1. Coleta as mensagens recentes guardadas pela Evolution (mais novas primeiro)
                const records: any[] = [];
                for (let page = 1; page <= PAGES_PER_INSTANCE; page++) {
                    const r = await fetch(`${evoUrl}/chat/findMessages/${encodeURIComponent(name)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', apikey: evoToken },
                        body: JSON.stringify({ where: {}, page, offset: 100 }),
                        signal: AbortSignal.timeout(30_000),
                    });
                    if (!r.ok) break;
                    const j = await r.json();
                    const recs = j?.messages?.records ?? j?.records ?? (Array.isArray(j) ? j : []);
                    if (!recs.length) break;
                    records.push(...recs);
                    // Ja passou da janela? Para de paginar.
                    const oldest = recs[recs.length - 1];
                    if (Number(oldest?.messageTimestamp ?? 0) < cutoff) break;
                }

                // 2. Filtra: so INBOUND, na janela, 1:1 (sem grupo/broadcast/newsletter)
                const candidates = records.filter((m) => {
                    const key = m?.key;
                    if (!key?.id || key.fromMe) return false;
                    if (Number(m?.messageTimestamp ?? 0) < cutoff) return false;
                    const jid = String(key.remoteJid ?? '');
                    if (jid.includes('@g.us') || jid.includes('broadcast') || jid.includes('@newsletter')) return false;
                    return true;
                });
                stats.scanned = candidates.length;
                if (candidates.length === 0) continue;

                const ids = Array.from(new Set(candidates.map((m) => m.key.id)));

                // 3. O que ja existe no CRM (mensagem salva OU evento ja tratado)?
                const [{ data: existingMsgs }, { data: seenEvents }] = await Promise.all([
                    supabase.from('messages').select('evolution_message_id')
                        .eq('tenant_id', inst.tenant_id).in('evolution_message_id', ids),
                    supabase.from('webhook_events').select('evolution_message_id')
                        .in('evolution_message_id', ids),
                ]);
                const known = new Set<string>([
                    ...(existingMsgs ?? []).map((m: any) => m.evolution_message_id),
                    ...(seenEvents ?? []).map((e: any) => e.evolution_message_id),
                ]);

                const missing = candidates.filter((m) => !known.has(m.key.id));
                stats.missing = missing.length;

                // 4. Reinjeta na edge function (idempotente) como messages.upsert
                for (const m of missing.slice(0, MAX_INJECT_PER_INSTANCE)) {
                    try {
                        const r = await fetch(WEBHOOK_FN_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                instance: name,
                                type: 'messages.upsert',
                                data: {
                                    key: m.key,
                                    pushName: m.pushName ?? null,
                                    message: m.message ?? {},
                                    messageType: m.messageType ?? 'conversation',
                                    messageTimestamp: m.messageTimestamp,
                                },
                            }),
                            signal: AbortSignal.timeout(45_000),
                        });
                        if (r.ok) stats.injected++;
                        else stats.errors++;
                    } catch { stats.errors++; }
                }
            } catch (e: any) {
                stats.errors++;
                console.error(`reconcile ${name} erro:`, e?.message);
            }
        }

        return NextResponse.json({ success: true, windowHours: WINDOW_HOURS, summary });
    } catch (e: any) {
        console.error('whatsapp-reconcile error:', e);
        return NextResponse.json({ success: false, error: e.message, summary }, { status: 500 });
    }
}
