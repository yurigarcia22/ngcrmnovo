import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vigia das conexoes WhatsApp: confere o estado REAL de cada numero na
// Evolution (a cada 5 min via pg_cron), sincroniza o status no banco e
// NOTIFICA os admins do tenant quando um numero cai ou volta. Sem isso,
// uma queda silenciosa (reinicio da Evolution, socket derrubado sem evento
// CONNECTION_UPDATE) so era percebida quando alguem sentia falta de mensagem.
export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const evoToken = process.env.EVOLUTION_API_TOKEN || '';

    const summary: Record<string, string> = {};
    let notified = 0;

    try {
        if (!evoUrl || !evoToken) throw new Error('EVOLUTION_API_URL/TOKEN ausentes');

        const { data: instances } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, tenant_id, custom_name, phone_number, status');

        for (const inst of instances ?? []) {
            const name = inst.instance_name;
            let liveStatus: string | null = null;
            try {
                const r = await fetch(`${evoUrl}/instance/connectionState/${encodeURIComponent(name)}`, {
                    headers: { apikey: evoToken },
                    signal: AbortSignal.timeout(15_000),
                });
                if (r.ok) {
                    const j = await r.json();
                    const state = j?.instance?.state ?? j?.state;
                    liveStatus = state === 'open' ? 'connected'
                        : state === 'close' ? 'disconnected'
                        : state === 'connecting' ? 'connecting'
                        : null;
                } else if (r.status === 404) {
                    // Instancia sumiu da Evolution (recriada/apagada): trata como caida.
                    liveStatus = 'disconnected';
                }
            } catch {
                // Evolution inacessivel: NAO muda status (evita falso alarme em
                // instabilidade de rede do proprio watchdog).
                summary[name] = 'evolution inacessivel (sem mudanca)';
                continue;
            }

            if (!liveStatus) { summary[name] = 'estado desconhecido'; continue; }
            summary[name] = liveStatus;
            if (liveStatus === inst.status) continue; // sem transicao

            await supabase.from('whatsapp_instances')
                .update({ status: liveStatus })
                .eq('instance_name', name);

            // Notifica admins do tenant nas TRANSICOES importantes.
            const dropped = liveStatus === 'disconnected' && inst.status === 'connected';
            const recovered = liveStatus === 'connected' && inst.status !== 'connected';
            if (!dropped && !recovered) continue;

            const label = inst.custom_name || (inst.phone_number ? `+${inst.phone_number}` : name);
            const { data: admins } = await supabase
                .from('profiles')
                .select('id')
                .eq('tenant_id', inst.tenant_id)
                .eq('role', 'admin')
                .eq('is_active', true);

            const nowIso = new Date().toISOString();
            for (const adm of admins ?? []) {
                await supabase.from('notifications').insert({
                    user_id: adm.id,
                    kind: dropped ? 'whatsapp_down' : 'whatsapp_up',
                    title: dropped
                        ? `📵 WhatsApp desconectou: ${label}`
                        : `✅ WhatsApp reconectado: ${label}`,
                    message: dropped
                        ? 'Mensagens deste número deixaram de chegar. Reconecte em Configurações › Conexões.'
                        : 'O número voltou a receber mensagens normalmente.',
                    scheduled_for: nowIso,
                    sent_at: nowIso,
                    tenant_id: inst.tenant_id,
                });
                notified++;
            }
        }

        return NextResponse.json({ success: true, notified, summary });
    } catch (e: any) {
        console.error('whatsapp-watchdog error:', e);
        return NextResponse.json({ success: false, error: e.message, summary }, { status: 500 });
    }
}
