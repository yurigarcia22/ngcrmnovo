"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

// --- PIPELINES ---

export async function getPipelines() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("pipelines")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getPipelines Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createPipeline(name: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 1. Cria o pipeline
        const { data: pipeline, error } = await supabase
            .from("pipelines")
            .insert({ name, tenant_id: tenantId })
            .select()
            .single();

        if (error) throw error;

        // 2. Cria 5 stages padrao:
        //    - Lead Entrada (is_inbox=true)  - onde mensagens novas caem
        //    - Qualificacao
        //    - Negociacao
        //    - Fechamento (is_won=true)  - marca como ganho automaticamente
        //    - Perdido (is_lost=true)    - marca como perda automaticamente
        const defaultStages = [
            { pipeline_id: pipeline.id, tenant_id: tenantId, name: "Lead Entrada", position: 0, color: "#6366f1", is_inbox: true,  is_won: false, is_lost: false },
            { pipeline_id: pipeline.id, tenant_id: tenantId, name: "Qualificação", position: 1, color: "#3b82f6", is_inbox: false, is_won: false, is_lost: false },
            { pipeline_id: pipeline.id, tenant_id: tenantId, name: "Negociação",   position: 2, color: "#fbbf24", is_inbox: false, is_won: false, is_lost: false },
            { pipeline_id: pipeline.id, tenant_id: tenantId, name: "Fechamento",   position: 3, color: "#22c55e", is_inbox: false, is_won: true,  is_lost: false },
            { pipeline_id: pipeline.id, tenant_id: tenantId, name: "Perdido",      position: 4, color: "#ef4444", is_inbox: false, is_won: false, is_lost: true  },
        ];

        const { error: stagesError } = await supabase
            .from("stages")
            .insert(defaultStages);

        if (stagesError) {
            console.error("Erro ao criar stages padrao:", stagesError);
            // Nao bloqueia: pipeline ja foi criado, vendedor adiciona manual depois
        }

        revalidatePath("/settings/pipelines");
        return { success: true, data: pipeline };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deletePipeline(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Check for deals in this pipeline (indirectly via stages) ??
        // Actually, assuming stages cascade delete or we block?
        // Let's just try delete. Logic: If DB has FK constraints, it will fail if data exists.

        const { error } = await supabase
            .from("pipelines")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// --- STAGES ---

export async function getStages(pipelineId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("stages")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("pipeline_id", pipelineId)
            .order("position", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createStage(pipelineId: string, name: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Get max position
        const { data: maxPosData } = await supabase
            .from("stages")
            .select("position")
            .eq("pipeline_id", pipelineId)
            .eq("tenant_id", tenantId)
            .order("position", { ascending: false })
            .limit(1)
            .single();

        const nextPos = (maxPosData?.position || 0) + 1;

        const { data, error } = await supabase
            .from("stages")
            .insert({
                name,
                pipeline_id: pipelineId,
                tenant_id: tenantId,
                position: nextPos,
                color: "#3b82f6" // Default blue
            })
            .select()
            .single();

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateStage(stageId: string, updates: any) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("stages")
            .update(updates)
            .eq("id", stageId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteStage(stageId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("stages")
            .delete()
            .eq("id", stageId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Marca/desmarca uma stage como is_inbox, is_won ou is_lost.
 * Garante exclusividade no pipeline: ao marcar X como is_inbox=true,
 * todas as outras stages do mesmo pipeline ficam is_inbox=false.
 */
export async function setStageFlag(
    stageId: string,
    flag: "is_inbox" | "is_won" | "is_lost",
    value: boolean
): Promise<{ success: boolean; error?: string }> {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Descobre pipeline_id da stage
        const { data: stage } = await supabase
            .from("stages")
            .select("id, pipeline_id, tenant_id")
            .eq("id", stageId)
            .eq("tenant_id", tenantId)
            .maybeSingle();

        if (!stage) return { success: false, error: "Stage nao encontrada." };

        if (value) {
            // Desmarca todas as outras do mesmo pipeline
            await supabase
                .from("stages")
                .update({ [flag]: false })
                .eq("pipeline_id", stage.pipeline_id)
                .eq("tenant_id", tenantId)
                .neq("id", stageId);
        }

        const { error } = await supabase
            .from("stages")
            .update({ [flag]: value })
            .eq("id", stageId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        revalidatePath("/leads");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Marca um pipeline como default (e desmarca os outros do tenant).
 * O pipeline default e o que o webhook do WhatsApp usa para criar
 * deals novos.
 */
export async function setPipelineDefault(
    pipelineId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Desmarca todos os outros pipelines do tenant
        await supabase
            .from("pipelines")
            .update({ is_default: false })
            .eq("tenant_id", tenantId)
            .neq("id", pipelineId);

        const { error } = await supabase
            .from("pipelines")
            .update({ is_default: true })
            .eq("id", pipelineId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        revalidatePath("/leads");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateStagesOrder(items: { id: string; position: number; pipeline_id: string }[]) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Usage of Promise.all for batch updates to avoid "upsert" constraint issues (missing required fields)
        // Since stage count is small per pipeline, this is performant enough.
        const promises = items.map(item =>
            supabase
                .from("stages")
                .update({ position: item.position })
                .eq("id", item.id)
                .eq("tenant_id", tenantId)
        );

        await Promise.all(promises);

        revalidatePath("/settings/pipelines");
        return { success: true };
    } catch (error: any) {
        console.error("Order Update Error:", error);
        return { success: false, error: error.message };
    }
}
