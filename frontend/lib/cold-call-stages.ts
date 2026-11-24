import type { SupabaseClient } from '@supabase/supabase-js';

// Mapa status text -> nomes possiveis da etapa no funil de cold_call, em ordem de
// preferencia. Aceitar varios nomes deixa o funil configuravel: voce pode ter uma
// coluna unica "Ligacao Feita" (sem Tentativa 1/2) que o sistema ainda reconhece.
// A comparacao ignora caixa e acento. O caminho inverso (etapa -> status) e feito
// no banco pelo trigger trg_cold_lead_sync (funcao cold_status_for_stage).
export const STATUS_TO_STAGE_NAMES: Record<string, string[]> = {
    novo: ['Novo'],
    novo_lead: ['Novo'],
    tentativa_inicial: ['Ligação Feita', 'Tentativa 1'],
    ligacao_feita: ['Ligação Feita', 'Tentativa 1'],
    nao_consegui_contato: ['Ligação Feita', 'Tentativa 1'],
    em_follow_up: ['Tentativa 2+', 'Ligação Feita', 'Tentativa 1'],
    lead_qualificado: ['Tentativa 2+', 'Ligação Feita', 'Tentativa 1'],
    aguardando_retorno: ['Tentativa 2+', 'Ligação Feita', 'Tentativa 1'],
    contato_realizado: ['Contato feito'],
    contato_decisor: ['Falou c/ decisor'],
    reuniao_marcada: ['Reunião marcada', 'Confirmado'],
    convertido: ['Convertido'],
    descartado: ['Descartado'],
    numero_inexistente: ['Número inexistente', 'Numero inexistente', 'Número inválido', 'Sem WhatsApp'],
    sem_interesse: ['Sem interesse', 'Descartado'],
    perdido: ['Descartado', 'Perdido'],
};

const LOST_STATUSES = new Set(['numero_inexistente', 'sem_interesse', 'perdido', 'descartado']);
const WON_STATUSES = new Set(['convertido', 'reuniao_marcada']);

function key(s: string): string {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Resolve o id da etapa correspondente a um status, DENTRO de um pipeline especifico.
 * Primeiro casa pelo nome (ignorando caixa/acento, em ordem de preferencia), para
 * "numero inexistente" cair na coluna propria e nao na primeira etapa de perda.
 * Sem nome equivalente, estados terminais usam as flags is_lost/is_won (robusto a
 * renomeacao). Retorna null quando nao existe etapa equivalente.
 */
export async function resolveStageIdInPipeline(
    admin: SupabaseClient,
    pipelineId: number,
    status: string,
): Promise<number | null> {
    const { data: stages } = await admin
        .from('stages')
        .select('id, name, position, is_won, is_lost')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true });
    if (!stages?.length) return null;

    for (const name of STATUS_TO_STAGE_NAMES[status] ?? []) {
        const hit = stages.find((s: any) => key(s.name) === key(name));
        if (hit) return hit.id as number;
    }
    if (LOST_STATUSES.has(status)) {
        const hit = stages.find((s: any) => s.is_lost);
        if (hit) return hit.id as number;
    }
    if (WON_STATUSES.has(status)) {
        const hit = stages.find((s: any) => s.is_won);
        if (hit) return hit.id as number;
    }
    return null;
}

/** Pipeline de cold call do lead (pela etapa atual) ou o padrao do tenant. */
export async function resolveLeadPipelineId(
    admin: SupabaseClient,
    tenantId: string,
    stageId: number | string | null | undefined,
): Promise<number | null> {
    if (stageId) {
        const { data } = await admin.from('stages').select('pipeline_id').eq('id', stageId).eq('tenant_id', tenantId).maybeSingle();
        if (data?.pipeline_id) return data.pipeline_id as number;
    }
    const { data: p } = await admin
        .from('pipelines').select('id')
        .eq('tenant_id', tenantId).eq('kind', 'cold_call')
        .order('is_default', { ascending: false }).order('created_at', { ascending: true })
        .limit(1).maybeSingle();
    return (p?.id as number) ?? null;
}
