import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';
import { ColdLeadInsert } from '@/types/cold-lead';
import { canonicalizeNichoOrDefault, NICHO_VAZIO } from '@/lib/nicho';
import {
    buildColdLeadSearchOr,
    canonicalPhoneOrNull,
    isColdCallStageOfTenant,
    listTenantNichos,
    parseStageId,
    PG_UNIQUE_VIOLATION,
} from '@/lib/cold-leads-api';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const nicho = searchParams.get('nicho');
    const responsavelId = searchParams.get('responsavelId');
    const stageId = searchParams.get('stageId'); // carrega so os leads de uma etapa
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');

    const tenantId = await getTenantId();
    // Busca escapada (virgula/parenteses quebravam o .or() e davam 500) e tambem
    // pelos digitos do telefone, que agora e gravado so com digitos.
    const searchOr = buildColdLeadSearchOr(search);

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
            .eq('tenant_id', tenantId); // filtro explicito, nao depende so da RLS
        if (searchOr) q = q.or(searchOr);
        if (status) q = q.eq('status', status);
        if (nicho) q = q.eq('nicho', nicho);
        if (stageId) q = q.eq('stage_id', stageId);
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

    // Telefone sempre no canonico (55 + DDD + numero, so digitos): e assim que o
    // banco grava e e por ele que o indice unico (tenant_id, telefone) barra duplicata.
    const telefone = canonicalPhoneOrNull(body.telefone);
    if (!telefone) {
        return NextResponse.json(
            { error: 'Telefone inválido. Informe DDD + número.' },
            { status: 400 }
        );
    }

    // Etapa: so aceita etapa de um funil de cold call do proprio tenant.
    // Sem etapa, o trigger do banco coloca na etapa de entrada do funil padrao.
    let stageId: number | null = null;
    if (body.stageId) {
        stageId = parseStageId(body.stageId);
        try {
            if (!stageId || !(await isColdCallStageOfTenant(supabase, tenantId, stageId))) {
                return NextResponse.json({ error: 'Etapa inválida para o funil de cold call.' }, { status: 400 });
            }
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }
    }

    // Canonicaliza o nicho: une apelidos (vet -> Veterinaria) e casa com um existente
    // (ignora caixa/acento) pra nao duplicar. A lista vem paginada (sem teto de 1000).
    let nichoFinal = NICHO_VAZIO;
    if (body.nicho) {
        let existing: string[] = [];
        try {
            existing = await listTenantNichos(supabase, tenantId);
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }
        nichoFinal = canonicalizeNichoOrDefault(body.nicho, existing);
    }

    // status nao vai: o trigger deriva da etapa.
    const newLead: ColdLeadInsert = {
        tenant_id: tenantId,
        nome: String(body.nome).trim(),
        telefone,
        // nicho NOT NULL no banco — "Não informado" quando nao vier
        nicho: nichoFinal,
        email: body.email || null,
        responsavel_id: body.responsavelId || null,
        stage_id: stageId,
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
        if (error.code === PG_UNIQUE_VIOLATION) {
            return NextResponse.json({ error: 'Já existe um lead com esse telefone.' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
