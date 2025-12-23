"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";

// 1. Get List of Pipelines
export async function getPipelines() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("pipelines")
            .select("*, stages(id, name, position)")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// 2. Get Board Data (Stages + Deals)
export async function getBoardData(pipelineId?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        let activePipelineId = pipelineId;

        // A. If no ID provided, find defaults
        if (!activePipelineId) {
            const { data: firstPipe } = await supabase
                .from("pipelines")
                .select("id")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: true })
                .limit(1)
                .single();

            if (firstPipe) activePipelineId = firstPipe.id;
        }

        if (!activePipelineId) {
            // Case where NO pipelines exist at all? Return empty
            return { success: true, stages: [], deals: [], currentPipelineId: null };
        }

        // B. Fetch Stages for this Pipeline
        const { data: stages, error: stagesError } = await supabase
            .from("stages")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("pipeline_id", activePipelineId!)
            .order("position", { ascending: true });

        if (stagesError) throw stagesError;

        // C. Fetch Deals for these Stages
        // We filter deals that belong to ANY of the stages in this pipeline.
        // Or simpler: We can just filter by tenant, but that would return deals from OTHER pipelines too if we don't filter by stage IDs.
        // Assuming deals have 'stage_id', we must filter by the stages found above.

        const stageIds = stages.map(s => s.id);

        // If no stages, no deals
        let deals: any[] = [];
        if (stageIds.length > 0) {
            const { data: dealsData, error: dealsError } = await supabase
                .from("deals")
                .select(`
                    *,
                    contacts (name, phone),
                    deal_tags (
                        tags (id, name, color)
                    ),
                    deal_items (
                        products (name)
                    )
                `)
                .eq("tenant_id", tenantId)
                .in("stage_id", stageIds)
                .order("updated_at", { ascending: false });

            if (dealsError) throw dealsError;
            deals = dealsData;
        }

        // D. Fetch Field Definitions (for card display)
        const { data: fieldDefinitions, error: fieldsError } = await supabase
            .from("custom_field_definitions")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("position", { ascending: true });

        if (fieldsError) throw fieldsError;

        return {
            success: true,
            stages,
            deals,
            fieldDefinitions, // Return fields
            currentPipelineId: activePipelineId
        };

    } catch (error: any) {
        console.error("getBoardData Error:", error);
        return { success: false, error: error.message };
    }
}
