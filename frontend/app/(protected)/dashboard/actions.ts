"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";

export async function getDashboardData() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // 1. Total Leads Today
        // Assuming 'created_at' is the timestamp for when the lead was created
        const { count: totalLeadsToday, error: leadsError } = await supabase
            .from("deals")
            .select("*", { count: 'exact', head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", startOfToday);

        if (leadsError) throw leadsError;

        // 2. Total Open Value (Pipeline)
        // status != 'won' AND status != 'lost'
        const { data: openDeals, error: valueError } = await supabase
            .from("deals")
            .select("value")
            .eq("tenant_id", tenantId)
            .neq("status", "won")
            .neq("status", "lost");

        if (valueError) throw valueError;

        const totalOpenValue = openDeals?.reduce((sum, deal) => sum + (deal.value || 0), 0) || 0;

        // 3. Won Deals This Month
        // status = 'won' AND closed_at >= startOfMonth
        const { count: wonDealsMonth, error: wonError } = await supabase
            .from("deals")
            .select("*", { count: 'exact', head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "won")
            .gte("closed_at", startOfMonth);

        if (wonError) throw wonError;

        // 4. Leads by Stage
        // We need to join with stages to get the name
        const { data: dealsByStage, error: stageError } = await supabase
            .from("deals")
            .select(`
                stage_id,
                stages (
                    name
                )
            `)
            .eq("tenant_id", tenantId)
            .neq("status", "won")
            .neq("status", "lost"); // Usually dashboard chart shows active pipeline? User said "Leads por Estágio".
        // If we include won/lost, the chart might look different.
        // "Leads by Stage" usually implies active deals in the funnel. I'll filter active ones.
        // But wait, "Status: leadsByStage: Agrupamento para gráfico (quantos em cada etapa)."
        // Often stages include "won" or "lost" columns in a Kanban, but in a database they might be statuses on the deal, not separate stages.
        // app/actions.ts shows `stage_id` and `status`. Logic suggests stages are the columns.
        // If a deal is 'won', does it stay in a stage? Yes, usually.
        // I will include ALL deals in the stage count logic regardless of status, OR just open ones?
        // "Leads por Estágio" -> Usually active leads.
        // Let's stick to ACTIVE (open) deals for the stage chart to represent the "Pipeline".
        // If the user wants historical, they'd ask for "Conversion".

        if (stageError) throw stageError;

        // Aggregation in JS since Supabase simple client doesn't do complex GROUP BY easily without RPC
        const stageMap: Record<string, number> = {};

        dealsByStage?.forEach((deal: any) => {
            const stageName = deal.stages?.name || "Unknown";
            stageMap[stageName] = (stageMap[stageName] || 0) + 1;
        });

        const leadsByStage = Object.entries(stageMap).map(([name, value]) => ({
            name,
            value
        }));

        // 5. Last 5 Leads
        const { data: lastLeads, error: lastError } = await supabase
            .from("deals")
            .select("id, title, value, created_at, status")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(5);

        if (lastError) throw lastError;

        return {
            totalLeadsToday: totalLeadsToday || 0,
            totalOpenValue,
            wonDealsMonth: wonDealsMonth || 0,
            leadsByStage,
            lastLeads: lastLeads || []
        };

    } catch (error: any) {
        console.error("getDashboardData Error:", error);
        // Return empty structure to avoid crashing UI, or throw?
        // Better to return clean empty data or let UI handle error.
        // I'll return zeros so the dashboard renders safely.
        return {
            totalLeadsToday: 0,
            totalOpenValue: 0,
            wonDealsMonth: 0,
            leadsByStage: [],
            lastLeads: []
        };
    }
}
