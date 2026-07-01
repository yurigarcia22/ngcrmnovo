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

    // "Meus leads" resolve o usuario atual uma vez (fora do loop de paginacao).
    let meId: string | null = null;
    if (responsavelId === 'meus_leads') {
        const { data: { user } } = await supabase.auth.getUser();
        meId = user?.id ?? null;
    }

    // Monta a query com todos os filtros (sem range). Reconstruida por pagina.
    const buildQuery = () => {
        let q = supabase
            .from('cold_leads')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenantId);
        if (search) q = q.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`);
        if (status) q = q.eq('status', status);
        if (nicho) q = q.eq('nicho', nicho);
        if (responsavelId === 'meus_leads') {
            if (meId) q = q.eq('responsavel_id', meId);
        } else if (responsavelId && responsavelId !== 'all') {
            q = q.eq('responsavel_id', responsavelId);
        }
        // id como desempate: sem ele, leads com mesmo created_at trocam de ordem
        // entre paginas e causam duplicatas/omissoes nas bordas.
        return q.order('created_at', { ascending: false }).order('id', { ascending: false });
    };

    // O PostgREST do Supabase corta cada resposta em 1000 linhas (db-max-rows).
    // Pra "Todos Responsaveis" trazer todos os leads (o funil pode ter 2000+),
    // paginamos internamente em blocos de 1000 ate atingir `limit` ou esgotar.
    const PAGE = 1000;
    const hardEnd = offset + Math.max(1, limit); // exclusivo
    const all: any[] = [];
    let total = 0;
    let from = offset;

    while (from < hardEnd) {
        const to = Math.min(from + PAGE, hardEnd) - 1;
        const { data, error, count } = await buildQuery().range(from, to);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (typeof count === 'number') total = count;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < (to - from + 1)) break; // ultima pagina
        from += PAGE;
    }

    return NextResponse.json({ data: all, total });
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
