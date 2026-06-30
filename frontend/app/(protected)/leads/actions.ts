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
            // is_inbox/is_won/is_lost/color sao usados pelo NewLeadModal para esconder
            // Ganho/Perdido e escolher a etapa de entrada. Sem eles vinham undefined e
            // o usuario conseguia criar lead direto em "Ganho"/"Perdido".
            .select("*, stages(id, name, position, is_inbox, is_won, is_lost, color)")
            .eq("tenant_id", tenantId)
            .eq("kind", "deals")  // /leads so mostra funis de venda
            .order("created_at", { ascending: true });

        if (error) throw error;
        // Ordena as stages por position (o embed nao garante ordem).
        const sorted = (data ?? []).map((p: any) => ({
            ...p,
            stages: (p.stages ?? []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
        }));
        return { success: true, data: sorted };
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
                .eq("kind", "deals")
                .order("created_at", { ascending: true })
                .limit(1)
                .single();

            if (firstPipe) {
                activePipelineId = firstPipe.id;
            } else {
                // AUTO-CREATE DEFAULT PIPELINE IF NONE EXISTS
                const { data: newPipe, error: pipeErr } = await supabase
                    .from("pipelines")
                    .insert({ name: "Funil de Vendas", tenant_id: tenantId })
                    .select("id")
                    .single();

                if (pipeErr) throw pipeErr;
                activePipelineId = newPipe.id;

                // Create Default Stages
                const defaultStages = [
                    { pipeline_id: activePipelineId, name: "Contato Feito", position: 1, color: "#cbd5e1", tenant_id: tenantId },
                    { pipeline_id: activePipelineId, name: "Reunião Agendada", position: 2, color: "#fef08a", tenant_id: tenantId },
                    { pipeline_id: activePipelineId, name: "Proposta Enviada", position: 3, color: "#fed7aa", tenant_id: tenantId },
                    { pipeline_id: activePipelineId, name: "Em Negociação", position: 4, color: "#bfdbfe", tenant_id: tenantId },
                    { pipeline_id: activePipelineId, name: "Perdido", position: 5, color: "#ef4444", tenant_id: tenantId },
                    { pipeline_id: activePipelineId, name: "Ganho", position: 6, color: "#22c55e", tenant_id: tenantId }
                ];

                await supabase.from("stages").insert(defaultStages);
            }
        }

        if (!activePipelineId) {
            // Should not happen anymore due to auto-create, but fallback
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
        const stageIds = stages.map(s => s.id);
        const inboxStageIds = stages.filter(s => s.is_inbox).map(s => s.id);

        // If no stages, no deals
        let deals: any[] = [];
        if (stageIds.length > 0) {
            // Select enxuto: so colunas usadas pelo KanbanCard.
            // deal_contacts/deal_items removidos daqui (lazy load no modal do deal).
            const { data: dealsData, error: dealsError } = await supabase
                .from("deals")
                .select(`
                    id, title, value, stage_id, owner_id, status, tenant_id,
                    promoted_at, snoozed_until, resolved_at, closed_at,
                    lost_reason, lost_reason_id, lost_details,
                    contact_id, custom_values, stage_entered_at,
                    acquisition_channel_id,
                    created_at, updated_at,
                    contacts (name, phone, photo_url),
                    owner:owner_id (full_name, avatar_url),
                    acquisition_channels (id, name, color),
                    deal_members (id, user_id, profiles(full_name, avatar_url)),
                    deal_tags (tags (id, name, color)),
                    deal_items (quantity, products (name)),
                    tasks (id, due_date, is_completed)
                `)
                .eq("tenant_id", tenantId)
                .in("stage_id", stageIds)
                .order("updated_at", { ascending: false });

            if (dealsError) throw dealsError;
            deals = dealsData ?? [];
        }

        // C2. Enriquece deals do INBOX com preview da ultima mensagem.
        // Pra evitar 1 query por deal, busca todas as ultimas mensagens
        // dos deals do inbox em uma query unica e mapeia por deal_id.
        if (inboxStageIds.length > 0 && deals.length > 0) {
            const inboxDealIds = deals
                .filter(d => inboxStageIds.includes(d.stage_id))
                .map(d => d.id);

            if (inboxDealIds.length > 0) {
                const { data: lastMessages } = await supabase
                    .from("messages")
                    .select("deal_id, content, type, direction, created_at")
                    .in("deal_id", inboxDealIds)
                    .eq("tenant_id", tenantId)
                    .order("created_at", { ascending: false });

                // Constroi mapa deal_id -> primeira (mais recente) msg
                const lastMsgByDeal = new Map<string, any>();
                for (const m of lastMessages ?? []) {
                    if (!lastMsgByDeal.has(m.deal_id)) {
                        lastMsgByDeal.set(m.deal_id, m);
                    }
                }

                deals = deals.map(d => {
                    if (inboxStageIds.includes(d.stage_id)) {
                        return { ...d, last_message: lastMsgByDeal.get(d.id) ?? null };
                    }
                    return d;
                });
            }
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
