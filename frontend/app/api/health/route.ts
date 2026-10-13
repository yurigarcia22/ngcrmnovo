import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Monitor de queda (UptimeRobot): 200 so se o CRM E o banco responderem.
// Publica de proposito e sem nada sensivel na resposta: so ok/fora e o tempo.
export async function GET() {
    const inicio = Date.now();
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } },
        );
        const { error } = await supabase.from('tenants').select('id').limit(1)
            .abortSignal(AbortSignal.timeout(8000));
        if (error) throw error;
        return NextResponse.json({ ok: true, banco: 'ok', ms: Date.now() - inicio },
            { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ ok: false, banco: 'fora', ms: Date.now() - inicio },
            { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
