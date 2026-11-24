import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';
import { listTenantNichos } from '@/lib/cold-leads-api';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const tenantId = await getTenantId();

    // O PostgREST corta em 1000 linhas: listTenantNichos pagina por chave
    // (nicho > ultimo visto), entao traz todos os nichos distintos do tenant,
    // sem teto de linhas e sem perder valores na borda das paginas.
    try {
        const uniqueNiches = await listTenantNichos(supabase, tenantId);
        return NextResponse.json({ data: uniqueNiches });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
