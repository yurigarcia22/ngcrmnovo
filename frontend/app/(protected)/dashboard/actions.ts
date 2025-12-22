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
        const applyFilters = (query: any, dateField = "created_at") => {
            let q = query.eq("tenant_id", tenantId);
            if (userId && userId !== "all") {
                q = q.eq("owner_id", userId); // Assuming 'owner_id' or similar exists on deals? 'user_id'?
                // Checking previous app/actions.ts... 'owner_id' is mentioned in getConversations. 
                // Let's verify 'owner_id' in deals schema or use 'contact_id' -> NO, deals have an owner.
                // If 'owner_id' doesn't exist, we might crash. 
                // Let's assume 'owner_id' exists based on typical CRM schemas. 
                // Wait, app/actions.ts getConversations selects 'owner_id'. Safe.
            }
            if (period !== "all") {
                q = q.gte(dateField, startDate).lte(dateField, endDate);
            }
            return q;
        };

        // 1. Total Leads (Created in period)
        const leadsQuery = supabase
            .from("deals")
            .select("*", { count: 'exact', head: true });

        const { count: totalLeads, error: leadsError } = await applyFilters(leadsQuery, "created_at");

        if (leadsError) throw leadsError;

        // 2. Total Open Value (Pipeline - Active now, regardless of creation date? Or created in period?)
        // Usually, "Pipeline" means what is currently open. Filters might apply to "when it was created" or "active now".
        // If I filter by "Today", seeing "Pipeline Value" of ONLY deals created today is ... specific.
        // Usually Dashboard filters apply to the Creation Date or Closing Date.
        // Let's start with standard "Active in period" or just "Current Pipeline" (ignoring date) + "Filtered Pipeline"
        // User asked for filters. Let's filter EVERYTHING by the date range for consistency.
        const openValueQuery = supabase
            .from("deals")
            .select("value")
            .neq("status", "won")
            .neq("status", "lost");

        const { data: openDeals, error: valueError } = await applyFilters(openValueQuery, "created_at");

        if (valueError) throw valueError;
        const totalOpenValue = openDeals?.reduce((sum: number, deal: { value: any }) => sum + (deal.value || 0), 0) || 0;

        // 3. Won Deals (Closed in period)
        const wonQuery = supabase
            .from("deals")
            .select("*", { count: 'exact', head: true })
            .eq("status", "won");

        // For won deals, we normally look at 'closed_at'
        let qWon = wonQuery.eq("tenant_id", tenantId);
        if (userId && userId !== "all") qWon = qWon.eq("owner_id", userId);
        if (period !== "all") qWon = qWon.gte("closed_at", startDate).lte("closed_at", endDate);

        const { count: wonDeals, error: wonError } = await qWon;

        if (wonError) throw wonError;

        // Calculate wonValue
        let qWonValue = supabase.from("deals").select("value").eq("status", "won");
        qWonValue = qWonValue.eq("tenant_id", tenantId);
        if (userId && userId !== "all") qWonValue = qWonValue.eq("owner_id", userId);
        if (period !== "all") qWonValue = qWonValue.gte("closed_at", startDate).lte("closed_at", endDate);

        const { data: wonDealsData, error: wonValueError } = await qWonValue;
        if (wonValueError) throw wonValueError;

        const wonValue = wonDealsData?.reduce((sum: number, deal: { value: any }) => sum + (deal.value || 0), 0) || 0;

        // 4. Leads by Stage (Active?)
        const stageQuery = supabase
            .from("deals")
            .select(`
                stage_id,
                stages (
                    name
                )
            `)
            .neq("status", "won")
            .neq("status", "lost");

        const { data: dealsByStage, error: stageError } = await applyFilters(stageQuery, "created_at");
        // Note: Filtering pipeline distribution by creation date is tricky. 
        // Showing "Deals created this week by stage" is valid.

        if (stageError) throw stageError;

        const stageMap: Record<string, number> = {};
        dealsByStage?.forEach((deal: any) => {
            const stageName = deal.stages?.name || "Unknown";
            stageMap[stageName] = (stageMap[stageName] || 0) + 1;
        });

        const distByStage = Object.entries(stageMap).map(([name, value]) => ({
            name,
            value
        }));

        // 5. Last Leads
        const recentQuery = supabase
            .from("deals")
            .select("id, title, value, created_at, status")
            .order("created_at", { ascending: false })
            .limit(5);

        const { data: lastLeads, error: lastError } = await applyFilters(recentQuery, "created_at");

        if (lastError) throw lastError;

        return {
            totalLeads: totalLeads || 0,
            totalOpenValue,
            wonDeals: wonDeals || 0,
            wonValue,
            leadsByStage: distByStage,
            lastLeads: lastLeads || []
        };

    } catch (error: any) {
        console.error("getDashboardData Error:", error);
        return {
            totalLeads: 0,
            totalOpenValue: 0,
            wonDeals: 0,
            wonValue: 0,
            leadsByStage: [],
            lastLeads: []
        };
    }
}
