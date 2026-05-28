import type { SupabaseClient } from '@supabase/supabase-js';

// Mapa status text -> nomes possiveis da etapa no funil de cold_call, em ordem de
// preferencia. Aceitar varios nomes deixa o funil configuravel: voce pode ter uma
// coluna unica "Ligacao Feita" (sem Tentativa 1/2) que o sistema ainda reconhece.
// Nao ha trigger no banco, entao status e stage_id sao mantidos em sync no /call.
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
    numero_inexistente: ['Descartado'],
    sem_interesse: ['Descartado'],
    perdido: ['Descartado'],
};

const LOST_STATUSES = new Set(['numero_inexistente', 'sem_interesse', 'perdido', 'descartado']);
const WON_STATUSES = new Set(['convertido']);

/**
 * Resolve o id da etapa correspondente a um status, DENTRO de um pipeline especifico.
 * Estados terminais usam as flags is_lost/is_won (robusto a renomeacao); os demais
 * casam por uma lista de nomes possiveis, em ordem de preferencia. Retorna null
 * quando nao existe etapa equivalente (nesse caso o lead nao muda de coluna).
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

    const candidates = STATUS_TO_STAGE_NAMES[status];
    if (!candidates?.length) return null;

    const { data } = await admin
        .from('stages')
        .select('id, name')
        .eq('pipeline_id', pipelineId)
        .in('name', candidates);
    if (!data?.length) return null;

    // Escolhe pela ordem de preferencia dos nomes candidatos.
    for (const name of candidates) {
        const hit = data.find((s: any) => s.name === name);
        if (hit) return hit.id as number;
    }
    return null;
}
