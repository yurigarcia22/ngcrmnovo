"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/utils/supabase/server";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

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
 * Move um cold_lead para outra stage. Atualiza apenas stage_id —
 * o trigger SQL cuida de status text + criar deal automatico em is_won.
 */
export async function moveColdLeadToStage(leadId: string, stageId: number) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const { error } = await supabase
            .from("cold_leads")
            .update({ stage_id: stageId })
            .eq("id", leadId)
            .eq("tenant_id", tenantId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Acao rapida: move o cold_lead para uma etapa do funil e registra a interacao.
 * - move stage_id (o card muda de coluna no kanban)
 * - incrementa a cadencia (tentativas) a cada acao
 * - grava ultimo_resultado = nome da etapa e ultima_interacao
 * - sincroniza o status text pelas flags da etapa (is_lost -> perdido, is_won ->
 *   convertido) para os contadores do dashboard continuarem corretos
 * - registra nota "Interacao Registrada: {etapa}" (metricas do dashboard)
 */
export async function registerColdLeadStage(leadId: string, stageId: number | string) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const stageIdNum = Number(stageId);

        const { data: lead, error: leadErr } = await admin
            .from("cold_leads")
            .select("id, status, tentativas")
            .eq("id", leadId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (leadErr || !lead) return { success: false, error: "Lead nao encontrado." };

        const { data: stage, error: stageErr } = await admin
            .from("stages")
            .select("id, name, is_won, is_lost")
            .eq("id", stageIdNum)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (stageErr || !stage) return { success: false, error: "Etapa nao encontrada." };

        // Sincroniza status com a etapa (so terminais sobrescrevem; reativa lead terminal
        // que voltou para uma etapa ativa).
        const TERMINAIS = new Set(["perdido", "convertido", "sem_interesse", "numero_inexistente"]);
        let newStatus = lead.status as string;
        if (stage.is_lost) newStatus = "perdido";
        else if (stage.is_won) newStatus = "convertido";
        else if (TERMINAIS.has(lead.status as string)) newStatus = "ligacao_feita";

        const updates: any = {
            stage_id: stageIdNum,
            status: newStatus,
            tentativas: (lead.tentativas || 0) + 1,
            ultimo_resultado: stage.name,
            ultima_interacao: new Date().toISOString(),
        };

        const { data: updated, error: updErr } = await admin
            .from("cold_leads")
            .update(updates)
            .eq("id", leadId)
            .eq("tenant_id", tenantId)
            .select()
            .single();
        if (updErr) return { success: false, error: updErr.message };

        // Nota de atividade (metrica do dashboard)
        try {
            const ssr = await createSSRClient();
            const { data: { user } } = await ssr.auth.getUser();
            if (user) {
                await admin.from("cold_lead_notes").insert({
                    cold_lead_id: leadId,
                    content: `Interação Registrada: ${stage.name}`,
                    created_by: user.id,
                });
            }
        } catch (e) {
            console.error("registerColdLeadStage log error:", e);
        }

        revalidatePath("/cold-call");
        return { success: true, data: updated };
    } catch (error: any) {
        console.error("registerColdLeadStage Error:", error);
        return { success: false, error: error.message };
    }
}
