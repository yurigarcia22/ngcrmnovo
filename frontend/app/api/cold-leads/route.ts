import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';
import { ColdLeadInsert } from '@/types/cold-lead';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const nicho = searchParams.get('nicho');
    const responsavelId = searchParams.get('responsavelId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
        .from('cold_leads')
        .select('*', { count: 'exact' });

    if (search) {
        query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`);
    }
    if (status) {
        query = query.eq('status', status);
    }
    if (nicho) {
        query = query.eq('nicho', nicho);
    }
    if (responsavelId) {
        query = query.eq('responsavel_id', responsavelId);
    }

    query = query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const body = await request.json();

    // Basic validation
    if (!body.nome || !body.telefone || !body.nicho) {
        return NextResponse.json(
            { error: 'Campos nome, telefone e nicho são obrigatórios' },
            { status: 400 }
        );
    }

    const tenantId = await getTenantId();

    const newLead: ColdLeadInsert = {
        tenant_id: tenantId,
        nome: body.nome,
        telefone: body.telefone,
        nicho: body.nicho,
        responsavel_id: body.responsavelId || null,
        google_meu_negocio_url: body.googleMeuNegocioUrl || null,
        site_url: body.siteUrl || null,
        instagram_url: body.instagramUrl || null,
        notas: body.notas || null,
    };

    const { data, error } = await supabase
        .from('cold_leads')
        .insert(newLead)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
