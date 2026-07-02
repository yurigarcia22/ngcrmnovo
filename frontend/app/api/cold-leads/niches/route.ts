import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const tenantId = await getTenantId();

    // O PostgREST corta em 1000 linhas: pagina internamente pra nao perder nichos
    // que so aparecem em leads alem dos 1000 primeiros.
    const PAGE = 1000;
    const set = new Set<string>();
    let from = 0;
    for (let i = 0; i < 30; i++) { // teto de seguranca: 30k leads
        const { data, error } = await supabase
            .from('cold_leads')
            .select('nicho')
            .eq('tenant_id', tenantId)
            .not('nicho', 'is', null)
            .order('nicho', { ascending: true })
            .range(from, from + PAGE - 1);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const batch = data ?? [];
        for (const r of batch) {
            const n = (r.nicho ?? '').trim();
            if (n) set.add(n);
        }
        if (batch.length < PAGE) break;
        from += PAGE;
    }

    const uniqueNiches = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return NextResponse.json({ data: uniqueNiches });
}
