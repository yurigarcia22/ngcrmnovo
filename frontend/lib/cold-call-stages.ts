import type { SupabaseClient } from '@supabase/supabase-js';

// Mapa status text -> nome canonico da etapa no funil de cold_call.
// Usado para manter status e stage_id em sincronia (nao ha trigger no banco).
export const STATUS_TO_STAGE_NAME: Record<string, string> = {
    novo: 'Novo',
    novo_lead: 'Novo',
    tentativa_inicial: 'Tentativa 1',
    ligacao_feita: 'Tentativa 1',
    nao_consegui_contato: 'Tentativa 1',
    em_follow_up: 'Tentativa 2+',
    lead_qualificado: 'Tentativa 2+',
    aguardando_retorno: 'Tentativa 2+',
    contato_realizado: 'Contato feito',
    contato_decisor: 'Falou c/ decisor',
    reuniao_marcada: 'Reunião marcada',
    convertido: 'Convertido',
    descartado: 'Descartado',
    numero_inexistente: 'Descartado',
    sem_interesse: 'Descartado',
    perdido: 'Descartado',
};

const LOST_STATUSES = new Set(['numero_inexistente', 'sem_interesse', 'perdido', 'descartado']);
const WON_STATUSES = new Set(['convertido']);

/**
 * Resolve o id da etapa correspondente a um status, DENTRO de um pipeline especifico.
 * Estados terminais usam as flags is_lost/is_won (robusto a renomeacao); os demais
 * casam pelo nome canonico. Retorna null quando nao existe etapa equivalente.
 */
export async function resolveStageIdInPipeline(
    admin: SupabaseClient,
    pipelineId: number,
    status: string,
): Promise<number | null> {
    if (LOST_STATUSES.has(status)) {
        const { data } = await admin
            .from('stages')
            .select('id')
            .eq('pipeline_id', pipelineId)
            .eq('is_lost', true)
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (data?.id) return data.id as number;
    }

    if (WON_STATUSES.has(status)) {
        const { data } = await admin
            .from('stages')
            .select('id')
            .eq('pipeline_id', pipelineId)
            .eq('is_won', true)
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (data?.id) return data.id as number;
    }

    const stageName = STATUS_TO_STAGE_NAME[status];
    if (!stageName) return null;

    const { data } = await admin
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('name', stageName)
        .maybeSingle();
    return (data?.id as number | undefined) ?? null;
}
