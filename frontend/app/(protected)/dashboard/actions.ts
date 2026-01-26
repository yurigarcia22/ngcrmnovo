"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";

export async function getDashboardData(filters?: { period?: string; userId?: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { period = "today", userId } = filters || {};

        // Date Logic
        const now = new Date();
        let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(); // Default Today
        let endDate = new Date().toISOString();

        if (period === "yesterday") {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
            endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString();
        } else if (period === "week") {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 7);
            startDate = weekStart.toISOString();
        } else if (period === "month") {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = monthStart.toISOString();
        } else if (period === "all") {
            startDate = new Date(0).toISOString(); // Epoch
        }

        // Helper to apply filters
        const applyFilters = (query: any, dateField = "created_at", userField = "owner_id") => {
            let q = query.eq("tenant_id", tenantId);
            if (userId && userId !== "all") {
                q = q.eq(userField, userId);
            }
            if (period !== "all") {
                q = q.gte(dateField, startDate).lte(dateField, endDate);
            }
            return q;
        };

        // Prepare Queries

        // 1. Total Leads
        const leadsQuery = applyFilters(supabase.from("deals").select("*", { count: 'exact', head: true }), "created_at");

        // 2. Open Value
        const openValueQuery = applyFilters(supabase.from("deals").select("value").neq("status", "won").neq("status", "lost"), "created_at");

        // 3. Won Deals
        let wonQuery = supabase.from("deals").select("value", { count: 'exact' }).eq("status", "won").eq("tenant_id", tenantId);
        if (userId && userId !== "all") wonQuery = wonQuery.eq("owner_id", userId);
        if (period !== "all") wonQuery = wonQuery.gte("closed_at", startDate).lte("closed_at", endDate);

        // 4. Leads by Stage
        const stageQuery = applyFilters(supabase.from("deals").select(`stage_id, stages (name)`).neq("status", "won").neq("status", "lost"), "created_at");

        // 5. Tasks
        let tasksQuery = supabase.from("tasks").select("*", { count: 'exact', head: true }).neq("status", "completed").eq("tenant_id", tenantId);
        if (userId && userId !== "all") tasksQuery = tasksQuery.eq("owner_id", userId);

        // 6. Messages (Conversations)
        let msgQuery = supabase.from("messages").select("contact_id").eq("tenant_id", tenantId).gte("created_at", startDate).lte("created_at", endDate);

        // 7. Latest Messages (for Unanswered & Wait Time)
        // We fetch a bit more to ensure we get enough distinct contacts
        const latestMsgQuery = supabase
            .from("messages")
            .select("contact_id, direction, created_at, content")
            .eq("tenant_id", tenantId)
            .order("contact_id", { ascending: true })
            .order("created_at", { ascending: false });

        // 8. Cold Leads
        let coldLeadsQuery = supabase.from("cold_leads").select("*", { count: 'exact', head: true }).eq("tenant_id", tenantId);
        if (period !== 'all') {
            coldLeadsQuery = coldLeadsQuery.gte("created_at", startDate).lte("created_at", endDate);
        }

        // 9. Cold Activity Notes
        let coldActivityQuery = supabase
            .from("cold_lead_notes")
            .select("content, created_by") // Added created_by for filter check if needed (though applied below)
            .ilike("content", "Interação Registrada:%");

        if (period !== "all") {
            coldActivityQuery = coldActivityQuery.gte("created_at", startDate).lte("created_at", endDate);
        }
        if (userId && userId !== "all") {
            coldActivityQuery = coldActivityQuery.eq("created_by", userId);
        }

        // Execute all in parallel
        const [
            { count: totalLeads },
            { data: openDeals },
            { count: wonDeals, data: wonDealsData },
            { data: dealsByStage },
            { count: tasksCount },
            { data: rawMsgs },
            { data: latestMessages },
            { count: coldLeadsCount },
            { data: activityNotes }
        ] = await Promise.all([
            leadsQuery,
            openValueQuery,
            wonQuery,
            stageQuery,
            tasksQuery,
            msgQuery,
            latestMsgQuery,
            coldLeadsQuery,
            coldActivityQuery
        ]);


        // --- Process Results ---

        const totalOpenValue = openDeals?.reduce((sum: number, deal: any) => sum + (deal.value || 0), 0) || 0;
        const wonValue = wonDealsData?.reduce((sum: number, deal: any) => sum + (deal.value || 0), 0) || 0;

        // Stage Distribution
        const stageMap: Record<string, number> = {};
        dealsByStage?.forEach((deal: any) => {
            const stageName = deal.stages?.name || "Sem Etapa";
            stageMap[stageName] = (stageMap[stageName] || 0) + 1;
        });
        const distByStage = Object.entries(stageMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value); // Sort by highest count

        // Chat Metrics
        const uniqueContacts = new Set(rawMsgs?.map((m: any) => m.contact_id));
        const conversationsCount = uniqueContacts.size;

        // Unanswered & Wait Time
        const lastMsgMap = new Map();
        latestMessages?.forEach((msg: any) => {
            if (!lastMsgMap.has(msg.contact_id)) {
                lastMsgMap.set(msg.contact_id, msg);
            }
        });

        let unansweredCount = 0;
        let maxWaitSeconds = 0;
        const nowTime = new Date().getTime();

        for (const msg of lastMsgMap.values()) {
            if (msg.direction === 'inbound') {
                unansweredCount++;
                const wait = (nowTime - new Date(msg.created_at).getTime()) / 1000;
                if (wait > maxWaitSeconds) maxWaitSeconds = wait;
            }
        }

        let longestWaitTime = "0m";
        if (maxWaitSeconds > 0) {
            const hours = Math.floor(maxWaitSeconds / 3600);
            const minutes = Math.floor((maxWaitSeconds % 3600) / 60);
            if (hours > 24) longestWaitTime = `${Math.floor(hours / 24)}d ${hours % 24}h`;
            else if (hours > 0) longestWaitTime = `${hours}h ${minutes}m`;
            else longestWaitTime = `${minutes}m`;
        }

        // Cold Call Metrics
        let callsMade = 0;
        let connections = 0;
        let meetings = 0;

        activityNotes?.forEach((note: any) => {
            const rawResult = note.content.replace("Interação Registrada:", "").trim();
            if (['ligacao_feita', 'contato_realizado', 'contato_decisor', 'reuniao_marcada', 'numero_inexistente'].includes(rawResult)) {
                callsMade++;
            }
            if (['contato_realizado', 'contato_decisor', 'reuniao_marcada'].includes(rawResult)) {
                connections++;
            }
            if (rawResult === 'reuniao_marcada') {
                meetings++;
            }
        });


        return {
            totalLeads: totalLeads || 0,
            totalOpenValue,
            wonDeals: wonDeals || 0,
            wonValue,
            leadsByStage: distByStage,
            lastLeads: [],
            tasksCount: tasksCount || 0,
            conversationsCount,
            unansweredChatsCount: unansweredCount,
            longestWaitTime,
            coldMetrics: {
                total: coldLeadsCount || 0,
                calls: callsMade,
                connections: connections,
                meetings: meetings
            }
        };

    } catch (error: any) {
        console.error("getDashboardData Error:", error);
        return {
            totalLeads: 0,
            totalOpenValue: 0,
            wonDeals: 0,
            wonValue: 0,
            leadsByStage: [],
            lastLeads: [],
            tasksCount: 0,
            conversationsCount: 0,
            unansweredChatsCount: 0,
            longestWaitTime: "0m",
            coldMetrics: { total: 0, calls: 0, connections: 0, meetings: 0 }
        };
    }
}
