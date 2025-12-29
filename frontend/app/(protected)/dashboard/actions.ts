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

        // --- DEALS METRICS ---

        // 1. Total Leads (Created in period)
        const leadsQuery = supabase.from("deals").select("*", { count: 'exact', head: true });
        const { count: totalLeads } = await applyFilters(leadsQuery, "created_at");

        // 2. Total Open Value (Active Pipeline)
        // We filter OPEN deals by CREATION date? Usually pipeline is "everything open right now".
        // But if filtering by "Last Week", maybe "Open deals created last week"?
        // Let's stick to "Created in period" for consistency with the filter label.
        const openValueQuery = supabase.from("deals").select("value").neq("status", "won").neq("status", "lost");
        const { data: openDeals } = await applyFilters(openValueQuery, "created_at");
        const totalOpenValue = openDeals?.reduce((sum: number, deal: any) => sum + (deal.value || 0), 0) || 0;

        // 3. Won Deals
        const wonQuery = supabase.from("deals").select("value", { count: 'exact' }).eq("status", "won");
        // For won, use closed_at
        let qWon = wonQuery.eq("tenant_id", tenantId);
        if (userId && userId !== "all") qWon = qWon.eq("owner_id", userId);
        if (period !== "all") qWon = qWon.gte("closed_at", startDate).lte("closed_at", endDate);
        const { count: wonDeals, data: wonDealsData } = await qWon;
        const wonValue = wonDealsData?.reduce((sum: number, deal: any) => sum + (deal.value || 0), 0) || 0;

        // 4. Leads by Stage
        const stageQuery = supabase.from("deals").select(`stage_id, stages (name)`).neq("status", "won").neq("status", "lost");
        const { data: dealsByStage } = await applyFilters(stageQuery, "created_at");

        const stageMap: Record<string, number> = {};
        dealsByStage?.forEach((deal: any) => {
            const stageName = deal.stages?.name || "Unknown";
            stageMap[stageName] = (stageMap[stageName] || 0) + 1;
        });
        const distByStage = Object.entries(stageMap).map(([name, value]) => ({ name, value }));

        // --- TASKS METRICS ---
        // Active Tasks (Snapshot, ignoring date filter for "Active", or Tasks Due in Period?)
        // Let's do: Tasks Due in Period OR Created in Period?
        // Usually "Tasks" card implies "Pending Tasks".
        // Let's return Total Pending Tasks (Snapshot)
        let tasksQuery = supabase.from("tasks").select("*", { count: 'exact', head: true }).neq("status", "completed").eq("tenant_id", tenantId);
        if (userId && userId !== "all") tasksQuery = tasksQuery.eq("owner_id", userId);
        // Note: Not filtering pending tasks by date, showing ALL pending.
        const { count: tasksCount } = await tasksQuery;


        // --- CHAT METRICS ---
        // 1. Current Conversations (Active in period)
        // Distinct contacts messaged in period
        let msgQuery = supabase.from("messages").select("contact_id").eq("tenant_id", tenantId).gte("created_at", startDate).lte("created_at", endDate);
        // Message table doesn't have owner_id directly usually, it links to contact -> owner?
        // Or we just count global if userId is 'all'. If userId selected, we need to filter messages where contact owner is userId?
        // Too complex for single query. Let's ignore userId filter for Chat Metrics for now OR try to join.
        // For MVP, Global Chat Metrics.
        const { data: rawMsgs } = await msgQuery;
        const uniqueContacts = new Set(rawMsgs?.map((m: any) => m.contact_id));
        const conversationsCount = uniqueContacts.size;


        // 2. Unanswered Chats & Wait Time
        // Strategy: Get latest message for top 50 active contacts
        // Implementation: "Distinct On" contact_id ordered by created_at desc
        const { data: latestMessages } = await supabase
            .from("messages")
            .select("contact_id, direction, created_at, content")
            .eq("tenant_id", tenantId)
            .order("contact_id", { ascending: true })
            .order("created_at", { ascending: false });

        // Post-process in JS (since distinct on via supabase js client is tricky without .distinctOn() method exposure maybe?)
        // Actually, let's manual process.
        // Group by contact_id
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

        // Format Max Wait Time
        // e.g. "2h 30m"
        let longestWaitTime = "0m";
        if (maxWaitSeconds > 0) {
            const hours = Math.floor(maxWaitSeconds / 3600);
            const minutes = Math.floor((maxWaitSeconds % 3600) / 60);
            if (hours > 24) longestWaitTime = `${Math.floor(hours / 24)}d ${hours % 24}h`;
            else if (hours > 0) longestWaitTime = `${hours}h ${minutes}m`;
            else longestWaitTime = `${minutes}m`;
        }

        // Avg Response Time? (Skip for now, complex)


        // --- COLD CALL METRICS ---
        // 1. Total Cold Leads
        let coldLeadsQuery = supabase.from("cold_leads").select("*", { count: 'exact', head: true }).eq("tenant_id", tenantId);
        if (period !== 'all') {
            coldLeadsQuery = coldLeadsQuery.gte("created_at", startDate).lte("created_at", endDate);
        }
        const { count: coldLeadsCount } = await coldLeadsQuery;

        // 2. Activity Metrics (Calls, Connections, Meetings) - via cold_lead_notes
        let coldActivityQuery = supabase
            .from("cold_lead_notes")
            .select("content")
            .ilike("content", "Interação Registrada:%");

        if (period !== "all") {
            coldActivityQuery = coldActivityQuery.gte("created_at", startDate).lte("created_at", endDate);
        }
        if (userId && userId !== "all") {
            coldActivityQuery = coldActivityQuery.eq("created_by", userId);
        }

        const { data: activityNotes } = await coldActivityQuery;

        let callsMade = 0;
        let connections = 0;
        let meetings = 0;

        activityNotes?.forEach((note: any) => {
            const rawResult = note.content.replace("Interação Registrada:", "").trim();
            // result strings: ligacao_feita, contato_realizado, contato_decisor, reuniao_marcada, numero_inexistente

            // Calls: All interactions count as a call (including numero_inexistente? User didn't specify, but usually yes)
            // User said: "contabilize como ligação feita" for: ligacao_feita, contato_realizado, contato_decisor, reuniao_marcada
            if (['ligacao_feita', 'contato_realizado', 'contato_decisor', 'reuniao_marcada', 'numero_inexistente'].includes(rawResult)) {
                callsMade++;
            }

            // Connections: Answered (excludes ligacao_feita/numero_inexistente)
            if (['contato_realizado', 'contato_decisor', 'reuniao_marcada'].includes(rawResult)) {
                connections++;
            }

            // Meetings
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
            lastLeads: [], // Deprecated in UI update plan? Or keep empty.

            // New
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
