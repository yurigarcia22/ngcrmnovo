"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/utils/supabase/server";
import { getTenantId, getCurrentProfile } from "@/app/actions";
import { revalidatePath } from "next/cache";

/** Texto de busca seguro para o .or() do PostgREST (virgula/parenteses quebravam a lista). */
function sanitizeSearch(raw?: string): string {
    return String(raw || "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Lista os pipelines de cold_call do tenant atual + as stages de cada um.
 * Usado pelo dropdown de funil em /cold-call.
 */
export async function getColdCallPipelinesWithStages() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const { data, error } = await supabase
            .from("pipelines")
            .select("id, name, is_default, stages(*)")
            .eq("tenant_id", tenantId)
            .eq("kind", "cold_call")
            .order("created_at", { ascending: true });

        if (error) throw error;

        // Ordena stages por position
        const sorted = (data ?? []).map((p: any) => ({
            ...p,
            stages: (p.stages ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
        }));

        return { success: true, data: sorted };
    } catch (error: any) {
        console.error("getColdCallPipelinesWithStages Error:", error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Contagem de leads por etapa (para os headers do funil), aplicando os mesmos
 * filtros da lista. Usa count HEAD: nao traz linhas, entao nao sofre com o teto
 * de 1000 do PostgREST e e leve mesmo com milhares de leads.
 */
export async function getColdLeadStageCounts(params: {
    stageIds: (number | string)[];
    search?: string;
    status?: string;
    nicho?: string;
    responsavelId?: string;
}) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        let meId: string | null = null;
        if (params.responsavelId === "meus_leads") {
            const prof = await getCurrentProfile();
            meId = prof?.userId ?? null;
        }

        const applyFilters = (q: any) => {
            q = q.eq("tenant_id", tenantId);
            const term = sanitizeSearch(params.search);
            if (term) {
                const digits = term.replace(/\D/g, "");
                q = q.or(digits.length >= 3
                    ? `nome.ilike.%${term}%,telefone.ilike.%${digits}%`
                    : `nome.ilike.%${term}%`);
            }
            if (params.status && params.status !== "all") q = q.eq("status", params.status);
            if (params.nicho && params.nicho !== "all") q = q.eq("nicho", params.nicho);
            if (params.responsavelId === "meus_leads") {
                if (meId) q = q.eq("responsavel_id", meId);
            } else if (params.responsavelId && params.responsavelId !== "all") {
                q = q.eq("responsavel_id", params.responsavelId);
            }
            return q;
        };

        const entries = await Promise.all(
            (params.stageIds ?? []).map(async (sid) => {
                const { count, error } = await applyFilters(
                    supabase.from("cold_leads").select("id", { count: "exact", head: true }).eq("stage_id", sid),
                );
                if (error) throw error;
                return [String(sid), count ?? 0] as const;
            }),
        );

        const counts: Record<string, number> = {};
        for (const [k, v] of entries) counts[k] = v;
        return { success: true, counts };
    } catch (error: any) {
        console.error("getColdLeadStageCounts Error:", error);
        return { success: false, error: error.message, counts: {} as Record<string, number> };
    }
}

/**
 * Arrastar no kanban.
 * - Para frente (ou para etapa terminal): igual a acao rapida, registra a interacao
 *   (tentativa + nota da metrica) e, em etapa is_won, o banco converte em venda.
 * - Para tras: so move o card, sem contar ligacao (corrige erro de arrasto sem
 *   inflar o dashboard).
 * O status text e derivado da etapa pelo trigger trg_cold_lead_sync.
 */
export async function moveColdLeadToStage(leadId: string, stageId: number) {
    return applyColdLeadStage(leadId, stageId, "drag");
}

/**
 * Acao rapida (botoes de etapa no modal): registra a interacao sempre; so move o lead
 * quando avanca (ou etapa terminal). Etapa anterior a atual so registra, sem regredir.
 */
export async function registerColdLeadStage(leadId: string, stageId: number | string) {
    return applyColdLeadStage(leadId, stageId, "action");
}

async function applyColdLeadStage(leadId: string, stageId: number | string, mode: "drag" | "action") {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        const stageIdNum = Number(stageId);

        const { data: lead, error: leadErr } = await admin
            .from("cold_leads")
            .select("*")
            .eq("id", leadId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (leadErr || !lead) return { success: false, error: "Lead não encontrado." };

        const { data: stage, error: stageErr } = await admin
            .from("stages")
            .select("id, name, is_won, is_lost, position, pipeline_id")
            .eq("id", stageIdNum)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (stageErr || !stage) return { success: false, error: "Etapa não encontrada." };

        let currentPos: number | null = null;
        if (lead.stage_id) {
            if (Number(lead.stage_id) === stageIdNum && mode === "drag") {
                return { success: true, data: lead, moved: false, registered: false, warnings: [] as string[] };
            }
            const { data: curStage } = await admin
                .from("stages").select("position").eq("id", lead.stage_id).maybeSingle();
            currentPos = (curStage?.position ?? null) as number | null;
        }
        const isTerminal = !!stage.is_won || !!stage.is_lost;
        const isForward = isTerminal || currentPos === null || (stage.position ?? 0) > currentPos;
        // Arrasto: sempre move (inclusive pra tras). Acao rapida: so avanca.
        const applyMove = mode === "drag" ? Number(lead.stage_id) !== stageIdNum : isForward;
        // Arrasto pra tras nao conta como ligacao. Acao rapida sempre conta.
        const register = mode === "action" || isForward;

        // Chave que o dashboard reconhece ("Interação Registrada: <chave>").
        const sName = (stage.name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        let resultKey: string;
        if (sName.includes("inexist") || sName.includes("invalid") || sName.includes("sem whatsapp")) resultKey = "numero_inexistente";
        else if (stage.is_lost) resultKey = "descartado";
        else if (sName.includes("convertid")) resultKey = "convertido";
        else if (sName.includes("confirmad") || sName.includes("reuni") || sName.includes("agendad")) resultKey = "reuniao_marcada";
        else if (stage.is_won) resultKey = "convertido";
        else if (sName.includes("decisor")) resultKey = "contato_decisor";
        else if (sName.includes("contato")) resultKey = "contato_realizado";
        else resultKey = "ligacao_feita";

        const updates: any = {};
        if (register) {
            updates.ultimo_resultado = stage.name;
            updates.ultima_interacao = new Date().toISOString();
        }
        if (applyMove) updates.stage_id = stageIdNum;

        let updated: any = lead;
        if (Object.keys(updates).length) {
            const { data: upd, error: updErr } = await admin
                .from("cold_leads")
                .update(updates)
                .eq("id", leadId)
                .eq("tenant_id", tenantId)
                .select()
                .single();
            if (updErr) return { success: false, error: updErr.message };
            updated = upd;
        }

        const warnings: string[] = [];
        if (register) {
            // Incremento atomico (dois vendedores no mesmo lead nao perdem contagem).
            const { data: t } = await admin.rpc("cold_lead_inc_tentativas", { p_lead_id: leadId, p_tenant_id: tenantId });
            if (typeof t === "number") updated.tentativas = t;

            const ssr = await createSSRClient();
            const { data: { user } } = await ssr.auth.getUser();
            if (user) {
                const { error: noteErr } = await admin.from("cold_lead_notes").insert({
                    cold_lead_id: leadId,
                    content: `Interação Registrada: ${resultKey}`,
                    created_by: user.id,
                });
                if (noteErr) warnings.push("A interação não entrou no histórico: " + noteErr.message);
            }
        }

        if (applyMove && stage.is_won) revalidatePath("/leads");
        revalidatePath("/cold-call");
        return {
            success: true,
            data: updated,
            convertedDealId: (updated?.converted_deal_id ?? null) as string | null,
            moved: applyMove,
            registered: register,
            warnings,
        };
    } catch (error: any) {
        console.error("applyColdLeadStage Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Reserva o lead para quem abriu (10 min). Se outro vendedor estiver com ele aberto,
 * devolve o nome dele para avisar na tela. Usa a sessao do usuario (auth.uid()).
 */
export async function claimColdLead(leadId: string): Promise<{ ok: boolean; locked_by?: string; locked_by_name?: string | null; error?: string }> {
    try {
        const ssr = await createSSRClient();
        const { data, error } = await ssr.rpc("claim_cold_lead", { p_lead_id: leadId });
        if (error) return { ok: true, error: error.message }; // falha na reserva nao trava o trabalho
        return data as any;
    } catch (e: any) {
        return { ok: true, error: e?.message };
    }
}

export async function releaseColdLead(leadId: string) {
    try {
        const ssr = await createSSRClient();
        await ssr.rpc("release_cold_lead", { p_lead_id: leadId });
    } catch { /* a reserva expira sozinha em 10 min */ }
}
