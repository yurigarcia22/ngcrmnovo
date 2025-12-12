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

        const { data, error } = await supabase
            .from("pipelines")
            .insert({ name, tenant_id: tenantId })
            .select()
            .single();

        if (error) throw error;
        revalidatePath("/settings/pipelines");
        return { success: true, data };
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
