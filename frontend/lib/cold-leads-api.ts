// Helpers de servidor das rotas /api/cold-leads (lista, criacao, importacao e
// edicao em massa). Concentra o que antes estava repetido (e com bug) em cada rota:
// busca segura no .or() do PostgREST, lista de nichos sem o teto de 1000 linhas,
// validacao de etapa do funil de cold call do tenant e blocos de ids/linhas.

import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanPhoneDigits, isPlausibleBRPhone, normalizeToCanonical } from '@/lib/phone';

// Aceita tanto o client SSR (cookies) quanto o service role.
type Db = SupabaseClient<any, any, any>;

/** Codigo do Postgres para violacao de indice unico (cold_leads: tenant_id + telefone). */
export const PG_UNIQUE_VIOLATION = '23505';

/** Divide uma lista em blocos de `size` itens. */
export function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/**
 * Telefone canonico (55 + DDD + numero, so digitos) ou null se nao for um
 * telefone BR aceitavel. A coluna telefone e NOT NULL e tem indice unico por tenant.
 */
export function canonicalPhoneOrNull(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (!text || !isPlausibleBRPhone(text)) return null;
    const canon = normalizeToCanonical(text);
    // 55 + DDD (sem zero na frente) + 8 ou 9 digitos
    return /^55[1-9]\d\d{8,9}$/.test(canon) ? canon : null;
}

/**
 * Limpa o texto da busca para uso dentro de `.or()` do PostgREST: virgula e
 * parenteses quebram a sintaxe do filtro (dava 500), `%` e `*` viram curinga,
 * aspas e barra invertida mudam o parse do valor.
 */
export function sanitizeSearchTerm(raw: string | null | undefined): string {
    return String(raw ?? '')
        .replace(/[,()%*"\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Monta o filtro `.or()` da busca de cold leads (nome ou telefone). Como o
 * telefone e gravado so com digitos (ex 5511987654321), quando o texto tem
 * digitos busca tambem pelos digitos puros ("(11) 98765-4321" acha o lead).
 * Devolve null quando nao sobra nada para buscar.
 */
export function buildColdLeadSearchOr(raw: string | null | undefined): string | null {
    const term = sanitizeSearchTerm(raw);
    if (!term) return null;
    const parts = [`nome.ilike.%${term}%`, `telefone.ilike.%${term}%`];
    const digits = cleanPhoneDigits(term);
    if (digits && digits !== term) parts.push(`telefone.ilike.%${digits}%`);
    return parts.join(',');
}

/**
 * Todos os nichos distintos do tenant. Paginacao por chave (nicho > ultimo visto),
 * entao cada pagina pula as repeticoes do ultimo valor e nao ha teto de 1000 linhas
 * nem risco de perder/duplicar linhas na borda das paginas.
 */
export async function listTenantNichos(supabase: Db, tenantId: string): Promise<string[]> {
    const PAGE = 1000;
    const set = new Set<string>();
    let last: string | null = null;
    for (let i = 0; i < 1000; i++) { // teto de seguranca
        let q = supabase
            .from('cold_leads')
            .select('nicho')
            .eq('tenant_id', tenantId)
            .not('nicho', 'is', null);
        if (last !== null) q = q.gt('nicho', last);
        const { data, error } = await q.order('nicho', { ascending: true }).limit(PAGE);
        if (error) throw new Error(`Falha ao listar nichos: ${error.message}`);
        const rows = (data ?? []) as { nicho: string | null }[];
        for (const r of rows) {
            const n = (r.nicho ?? '').trim();
            if (n) set.add(n);
        }
        if (rows.length < PAGE) break;
        last = rows[rows.length - 1].nicho ?? '';
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Converte o stage_id recebido (string/numero) para numero inteiro positivo, ou null. */
export function parseStageId(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/** true se a etapa pertence a um funil de cold call (pipelines.kind = 'cold_call') do tenant. */
export async function isColdCallStageOfTenant(supabase: Db, tenantId: string, stageId: number): Promise<boolean> {
    const { data: stage, error: stageError } = await supabase
        .from('stages')
        .select('id, pipeline_id')
        .eq('id', stageId)
        .maybeSingle();
    if (stageError) throw new Error(`Falha ao validar etapa: ${stageError.message}`);
    if (!stage?.pipeline_id) return false;

    const { data: pipeline, error: pipeError } = await supabase
        .from('pipelines')
        .select('id')
        .eq('id', stage.pipeline_id)
        .eq('tenant_id', tenantId)
        .eq('kind', 'cold_call')
        .maybeSingle();
    if (pipeError) throw new Error(`Falha ao validar funil da etapa: ${pipeError.message}`);
    return !!pipeline;
}

/** true se o usuario (profiles.id) e membro do tenant. */
export async function isMemberOfTenant(supabase: Db, tenantId: string, profileId: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) return false;
    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
    if (error) throw new Error(`Falha ao validar responsável: ${error.message}`);
    return !!data;
}
