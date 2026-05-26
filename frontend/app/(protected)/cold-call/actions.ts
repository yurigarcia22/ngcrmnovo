"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";

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
            .select("id, name, is_default, stages(id, name, position, color, is_inbox, is_won, is_lost)")
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
