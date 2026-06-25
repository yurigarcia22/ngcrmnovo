import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';
import { ColdLeadInsert } from '@/types/cold-lead';
import { canonicalizeNicho } from '@/lib/nicho';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const nicho = searchParams.get('nicho');
    const responsavelId = searchParams.get('responsavelId');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');

    const tenantId = await getTenantId();

    let query = supabase
        .from('cold_leads')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId);

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
        if (responsavelId === 'meus_leads') {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                query = query.eq('responsavel_id', user.id);
            }
        } else if (responsavelId !== 'all') {
            query = query.eq('responsavel_id', responsavelId);
        }
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

    // Validacao: nome e telefone obrigatorios. Nicho passou a ser opcional
    // (no fluxo de captacao de webinar nao faz sentido exigir nicho).
    if (!body.nome || !body.telefone) {
        return NextResponse.json(
            { error: 'Campos nome e telefone são obrigatórios' },
            { status: 400 }
        );
    }

    const tenantId = await getTenantId();

    // Canonicaliza o nicho: casa com um existente (ignora caixa/acento) pra nao duplicar.
    let nichoFinal = '';
    if (body.nicho) {
        const { data: nichoRows } = await supabase
            .from('cold_leads').select('nicho').eq('tenant_id', tenantId).not('nicho', 'is', null);
        const existing = Array.from(new Set((nichoRows ?? []).map((r: any) => r.nicho).filter(Boolean)));
        nichoFinal = canonicalizeNicho(body.nicho, existing) || String(body.nicho).trim();
    }

    const newLead: ColdLeadInsert = {
        tenant_id: tenantId,
        nome: body.nome,
        telefone: body.telefone,
        // nicho NOT NULL no banco — default vazio quando nao informado
        nicho: nichoFinal,
        email: body.email || null,
        responsavel_id: body.responsavelId || null,
        stage_id: body.stageId ? Number(body.stageId) : null,
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
