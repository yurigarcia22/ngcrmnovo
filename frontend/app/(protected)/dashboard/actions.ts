"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";

export async function getDashboardData(filters?: { period?: string; userId?: string; startDate?: string; endDate?: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { period = "today", userId, startDate: customStart, endDate: customEnd } = filters || {};

        // Date Logic
        // Timezone Logic for BRT (UTC-3)
        const nowUTC = new Date();
        const offsetHours = -3;
        const brT = new Date(nowUTC.getTime() + offsetHours * 3600 * 1000);

        let sYear = brT.getUTCFullYear();
        let sMonth = brT.getUTCMonth();
        let sDay = brT.getUTCDate();
        
        // Default Today
        let startDate = new Date(Date.UTC(sYear, sMonth, sDay, 3, 0, 0, 0)).toISOString(); 
        let endDate = new Date(Date.UTC(sYear, sMonth, sDay, 26, 59, 59, 999)).toISOString();

        if (period === "yesterday") {
            const yesterdayBRT = new Date(brT);
            yesterdayBRT.setUTCDate(brT.getUTCDate() - 1);
            const yYear = yesterdayBRT.getUTCFullYear();
            const yMonth = yesterdayBRT.getUTCMonth();
            const yDay = yesterdayBRT.getUTCDate();
            startDate = new Date(Date.UTC(yYear, yMonth, yDay, 3, 0, 0, 0)).toISOString();
            endDate = new Date(Date.UTC(yYear, yMonth, yDay, 26, 59, 59, 999)).toISOString();
        } else if (period === "week") {
            const weekStartBRT = new Date(brT);
            weekStartBRT.setUTCDate(brT.getUTCDate() - 7);
            startDate = new Date(Date.UTC(weekStartBRT.getUTCFullYear(), weekStartBRT.getUTCMonth(), weekStartBRT.getUTCDate(), 3, 0, 0, 0)).toISOString();
        } else if (period === "month") {
            startDate = new Date(Date.UTC(sYear, sMonth, 1, 3, 0, 0, 0)).toISOString();
        } else if (period === "custom" && customStart && customEnd) {
            const [cYear, cMonth, cDay] = customStart.split('-').map(Number);
            const [eYear, eMonth, eDay] = customEnd.split('-').map(Number);
            startDate = new Date(Date.UTC(cYear, cMonth - 1, cDay, 3, 0, 0, 0)).toISOString();
            endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay, 26, 59, 59, 999)).toISOString();
        } else if (period === "all") {
            startDate = new Date(0).toISOString(); // Epoch
            endDate = new Date(Date.UTC(sYear, sMonth, sDay, 26, 59, 59, 999)).toISOString();
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
        const leadsQuery = applyFilters(supabase.from("deals").select("id", { count: 'exact', head: true }), "created_at");

        // 2. Open Value
        const openValueQuery = applyFilters(supabase.from("deals").select("value").neq("status", "won").neq("status", "lost"), "created_at");

        // 3. Won Deals
        let wonQuery = supabase.from("deals").select("value", { count: 'exact' }).eq("status", "won").eq("tenant_id", tenantId);
        if (userId && userId !== "all") wonQuery = wonQuery.eq("owner_id", userId);
        if (period !== "all") wonQuery = wonQuery.gte("closed_at", startDate).lte("closed_at", endDate);

        // 4. Leads by Stage
        const stageQuery = applyFilters(supabase.from("deals").select(`stage_id, stages (name)`).neq("status", "won").neq("status", "lost"), "created_at");

        // 5. Tasks (pendentes = nao concluidas).
        //    Coluna correta e is_completed boolean, nao status.
        let tasksQuery = supabase
            .from("tasks")
            .select("id", { count: 'exact', head: true })
            .eq("tenant_id", tenantId)
            .eq("is_completed", false);
        if (userId && userId !== "all") tasksQuery = tasksQuery.eq("assigned_to", userId);

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
        let coldLeadsQuery = supabase.from("cold_leads").select("id", { count: 'exact', head: true }).eq("tenant_id", tenantId);
        if (period !== 'all') {
            coldLeadsQuery = coldLeadsQuery.gte("created_at", startDate).lte("created_at", endDate);
        }

        // 9. Cold Activity Notes
        let coldActivityQuery = supabase
            .from("cold_lead_notes")
            .select("content, created_by, cold_leads!inner(tenant_id)")
            .eq("cold_leads.tenant_id", tenantId)
            .ilike("content", "Interação Registrada:%");

        if (period !== "all") {
            coldActivityQuery = coldActivityQuery.gte("created_at", startDate).lte("created_at", endDate);
        }
        if (userId && userId !== "all") {
            coldActivityQuery = coldActivityQuery.eq("created_by", userId);
        }

        let tenantQuery = supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

        // 10. Lost Deals (no periodo)
        let lostQuery = supabase
            .from("deals")
            .select("value", { count: "exact" })
            .eq("status", "lost")
            .eq("tenant_id", tenantId);
        if (userId && userId !== "all") lostQuery = lostQuery.eq("owner_id", userId);
        if (period !== "all") lostQuery = lostQuery.gte("closed_at", startDate).lte("closed_at", endDate);

        // 11. Won Deals do periodo anterior (mesma duracao) para comparativo
        // Defensivo: so calcula prev range se nao for "all" e durations razoaveis
        let wonPrevQuery: any = null;
        if (period !== "all") {
            const periodDurationMs = new Date(endDate).getTime() - new Date(startDate).getTime();
            // Sanity check: se duration esta entre 1min e 1 ano
            if (periodDurationMs > 60_000 && periodDurationMs < 366 * 24 * 3600_000) {
                const prevStart = new Date(new Date(startDate).getTime() - periodDurationMs).toISOString();
                const prevEnd = startDate;
                wonPrevQuery = supabase
                    .from("deals")
                    .select("value", { count: "exact" })
                    .eq("status", "won")
                    .eq("tenant_id", tenantId)
                    .gte("closed_at", prevStart)
                    .lte("closed_at", prevEnd);
                if (userId && userId !== "all") wonPrevQuery = wonPrevQuery.eq("owner_id", userId);
            }
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
            { data: activityNotes },
            { data: tenantData },
            { count: lostDeals, data: lostDealsData },
            wonPrevResult,
        ] = await Promise.all([
            leadsQuery,
            openValueQuery,
            wonQuery,
            stageQuery,
            tasksQuery,
            msgQuery,
            latestMsgQuery,
            coldLeadsQuery,
            coldActivityQuery,
            tenantQuery,
            lostQuery,
            wonPrevQuery ?? Promise.resolve({ count: 0, data: [] as any[] }),
        ]);

        const wonDealsPrev = (wonPrevResult as any)?.count ?? 0;
        const wonDealsPrevData = (wonPrevResult as any)?.data ?? [];


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
        let decisionMakers = 0;
        let meetings = 0;

        activityNotes?.forEach((note: any) => {
            const rawResult = note.content.replace("Interação Registrada:", "").trim();
            if (['ligacao_feita', 'contato_realizado', 'contato_decisor', 'reuniao_marcada', 'numero_inexistente'].includes(rawResult)) {
                callsMade++;
            }
            if (['contato_realizado', 'contato_decisor', 'reuniao_marcada'].includes(rawResult)) {
                connections++;
            }
            if (['contato_decisor', 'reuniao_marcada'].includes(rawResult)) {
                decisionMakers++;
            }
            if (rawResult === 'reuniao_marcada') {
                meetings++;
            }
        });


        // === METRICAS DERIVADAS ===
        const lostValue = (lostDealsData ?? []).reduce((s: number, d: any) => s + Number(d.value || 0), 0);
        const wonValuePrev = (wonDealsPrevData ?? []).reduce((s: number, d: any) => s + Number(d.value || 0), 0);

        // Variacao percentual vs periodo anterior
        const wonValueChangePct = wonValuePrev > 0
            ? Math.round(((wonValue - wonValuePrev) / wonValuePrev) * 100)
            : (wonValue > 0 ? 100 : 0);

        // Taxa de conversao: ganhos / (ganhos + perdidos)
        const totalClosed = (wonDeals || 0) + (lostDeals || 0);
        const conversionRate = totalClosed > 0
            ? Math.round(((wonDeals || 0) / totalClosed) * 100)
            : 0;

        // Ticket medio (so ganhos)
        const avgTicket = (wonDeals || 0) > 0 ? wonValue / (wonDeals as number) : 0;

        return {
            tenantName: tenantData?.name || "Minha Empresa",
            totalLeads: totalLeads || 0,
            totalOpenValue,
            wonDeals: wonDeals || 0,
            wonValue,
            wonValuePrev,
            wonValueChangePct,
            lostDeals: lostDeals || 0,
            lostValue,
            conversionRate,
            avgTicket,
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
                decisionMakers: decisionMakers,
                meetings: meetings
            }
        };

    } catch (error: any) {
        console.error("getDashboardData Error:", error);
        return {
            tenantName: "Minha Empresa",
            totalLeads: 0,
            totalOpenValue: 0,
            wonDeals: 0,
            wonValue: 0,
            wonValuePrev: 0,
            wonValueChangePct: 0,
            lostDeals: 0,
            lostValue: 0,
            conversionRate: 0,
            avgTicket: 0,
            leadsByStage: [],
            lastLeads: [],
            tasksCount: 0,
            conversationsCount: 0,
            unansweredChatsCount: 0,
            longestWaitTime: "0m",
            coldMetrics: { total: 0, calls: 0, connections: 0, decisionMakers: 0, meetings: 0 }
        };
    }
}

export async function getWonDealsDetails(filters?: { period?: string; userId?: string; startDate?: string; endDate?: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { period = "today", userId, startDate: customStart, endDate: customEnd } = filters || {};

        const now = new Date();
        let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
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
        } else if (period === "custom" && customStart && customEnd) {
            const [sYear, sMonth, sDay] = customStart.split('-').map(Number);
            const [eYear, eMonth, eDay] = customEnd.split('-').map(Number);
            startDate = new Date(sYear, sMonth - 1, sDay, 0, 0, 0).toISOString();
            endDate = new Date(eYear, eMonth - 1, eDay, 23, 59, 59).toISOString();
        } else if (period === "all") {
            startDate = new Date(0).toISOString();
        }

        let wonQuery = supabase
            .from("deals")
            .select("id, title, value, closed_at, status")
            .eq("status", "won")
            .eq("tenant_id", tenantId)
            .order("closed_at", { ascending: false });

        if (userId && userId !== "all") wonQuery = wonQuery.eq("owner_id", userId);
        if (period !== "all") wonQuery = wonQuery.gte("closed_at", startDate).lte("closed_at", endDate);

        const { data, error } = await wonQuery;
        if (error) throw error;

        return { success: true, data };
    } catch (error: any) {
        console.error("getWonDealsDetails Error:", error);
        return { success: false, error: error.message };
    }
}

// =====================================================================
// PERFORMANCE BY SELLER + RESPONSE QUALITY (Pacotes 1 + 2)
// =====================================================================
export async function getSellersPerformance(filters?: {
    period?: string;
    startDate?: string;
    endDate?: string;
}) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { period = "today", startDate: customStart, endDate: customEnd } = filters || {};
        const brT = new Date(Date.now() - 3 * 3600 * 1000);
        const sYear = brT.getUTCFullYear();
        const sMonth = brT.getUTCMonth();
        const sDay = brT.getUTCDate();

        let startDate = new Date(Date.UTC(sYear, sMonth, sDay, 3, 0, 0)).toISOString();
        let endDate = new Date(Date.UTC(sYear, sMonth, sDay, 26, 59, 59)).toISOString();

        if (period === "yesterday") {
            const y = new Date(brT);
            y.setUTCDate(brT.getUTCDate() - 1);
            startDate = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate(), 3, 0, 0)).toISOString();
            endDate = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate(), 26, 59, 59)).toISOString();
        } else if (period === "week") {
            const w = new Date(brT);
            w.setUTCDate(brT.getUTCDate() - 7);
            startDate = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), 3, 0, 0)).toISOString();
        } else if (period === "month") {
            startDate = new Date(Date.UTC(sYear, sMonth, 1, 3, 0, 0)).toISOString();
        } else if (period === "custom" && customStart && customEnd) {
            const [cy, cm, cd] = customStart.split('-').map(Number);
            const [ey, em, ed] = customEnd.split('-').map(Number);
            startDate = new Date(Date.UTC(cy, cm - 1, cd, 3, 0, 0)).toISOString();
            endDate = new Date(Date.UTC(ey, em - 1, ed, 26, 59, 59)).toISOString();
        } else if (period === "all") {
            startDate = new Date(0).toISOString();
        }

        const [
            { data: profiles },
            { data: deals },
            { data: tasks },
            { data: messages },
        ] = await Promise.all([
            supabase
                .from("profiles")
                .select("id, full_name, avatar_url")
                .eq("tenant_id", tenantId)
                .eq("is_active", true),
            supabase
                .from("deals")
                .select("id, owner_id, status, value, closed_at, created_at")
                .eq("tenant_id", tenantId),
            supabase
                .from("tasks")
                .select("id, assigned_to, is_completed, due_date")
                .eq("tenant_id", tenantId),
            supabase
                .from("messages")
                .select("id, deal_id, contact_id, direction, created_at, deals!inner(owner_id, tenant_id)")
                .eq("tenant_id", tenantId)
                .gte("created_at", startDate)
                .lte("created_at", endDate),
        ]);

        const inRange = (iso?: string | null) => iso ? (iso >= startDate && iso <= endDate) : false;
        const nowMs = Date.now();

        const sellers = (profiles ?? []).map((p: any) => {
            const myDeals = (deals ?? []).filter((d: any) => d.owner_id === p.id);
            const open = myDeals.filter((d: any) => d.status !== "won" && d.status !== "lost");
            const wonInPeriod = myDeals.filter((d: any) => d.status === "won" && inRange(d.closed_at));
            const lostInPeriod = myDeals.filter((d: any) => d.status === "lost" && inRange(d.closed_at));

            const myTasks = (tasks ?? []).filter((t: any) => t.assigned_to === p.id);
            const pendingTasks = myTasks.filter((t: any) => !t.is_completed);
            const overdueTasks = pendingTasks.filter((t: any) =>
                t.due_date && new Date(t.due_date).getTime() < nowMs
            );

            const myMsgs = (messages ?? []).filter((m: any) => m.deals?.owner_id === p.id);
            const sent = myMsgs.filter((m: any) => m.direction === "outbound");
            const received = myMsgs.filter((m: any) => m.direction === "inbound");
            const uniqueContactsReached = new Set(sent.map((m: any) => m.contact_id)).size;

            const pipeline = open.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
            const wonValue = wonInPeriod.reduce((s: number, d: any) => s + Number(d.value || 0), 0);
            const closed = wonInPeriod.length + lostInPeriod.length;
            const conversionRate = closed > 0 ? Math.round((wonInPeriod.length / closed) * 100) : 0;

            const byDeal: Record<string, any[]> = {};
            for (const m of myMsgs as any[]) {
                if (!byDeal[m.deal_id]) byDeal[m.deal_id] = [];
                byDeal[m.deal_id].push(m);
            }

            const responseTimes: number[] = [];
            for (const dealMsgs of Object.values(byDeal)) {
                const sorted = (dealMsgs as any[]).sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
                for (let i = 0; i < sorted.length - 1; i++) {
                    if (sorted[i].direction === "inbound" && sorted[i + 1].direction === "outbound") {
                        const delta = (new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime()) / 1000;
                        if (delta > 0 && delta < 48 * 3600) responseTimes.push(delta);
                    }
                }
            }
            const avgResponseSec = responseTimes.length > 0
                ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
                : 0;

            return {
                id: p.id,
                name: p.full_name ?? "Sem nome",
                avatar: p.avatar_url ?? null,
                openDeals: open.length,
                pipelineValue: pipeline,
                wonCount: wonInPeriod.length,
                wonValue,
                conversionRate,
                pendingTasks: pendingTasks.length,
                overdueTasks: overdueTasks.length,
                sentMessages: sent.length,
                receivedMessages: received.length,
                uniqueContactsReached,
                avgResponseSeconds: Math.round(avgResponseSec),
            };
        });

        sellers.sort((a: any, b: any) => b.wonValue - a.wonValue);

        const allSent = (messages ?? []).filter((m: any) => m.direction === "outbound");
        const allReceived = (messages ?? []).filter((m: any) => m.direction === "inbound");
        const allUniqueContacts = new Set(allSent.map((m: any) => m.contact_id)).size;

        const slaBuckets = { under5min: 0, under1h: 0, under24h: 0, over24h: 0 };
        const dealsAll: Record<string, any[]> = {};
        for (const m of (messages ?? []) as any[]) {
            if (!dealsAll[m.deal_id]) dealsAll[m.deal_id] = [];
            dealsAll[m.deal_id].push(m);
        }

        const allResponseTimes: number[] = [];
        const conversationsWithInbound = new Set<string>();
        const conversationsAnswered = new Set<string>();

        for (const [dealId, dealMsgs] of Object.entries(dealsAll)) {
            const sorted = (dealMsgs as any[]).sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            let hadInbound = false;
            let answered = false;
            for (let i = 0; i < sorted.length; i++) {
                if (sorted[i].direction === "inbound") hadInbound = true;
                if (hadInbound && sorted[i].direction === "outbound") answered = true;
                if (i < sorted.length - 1 && sorted[i].direction === "inbound" && sorted[i + 1].direction === "outbound") {
                    const delta = (new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime()) / 1000;
                    if (delta <= 0) continue;
                    allResponseTimes.push(delta);
                    if (delta < 300) slaBuckets.under5min++;
                    else if (delta < 3600) slaBuckets.under1h++;
                    else if (delta < 86400) slaBuckets.under24h++;
                    else slaBuckets.over24h++;
                }
            }
            if (hadInbound) conversationsWithInbound.add(dealId);
            if (answered) conversationsAnswered.add(dealId);
        }

        const avgFirstResponseSec = allResponseTimes.length > 0
            ? Math.round(allResponseTimes.reduce((s, t) => s + t, 0) / allResponseTimes.length)
            : 0;

        const responseRate = conversationsWithInbound.size > 0
            ? Math.round((conversationsAnswered.size / conversationsWithInbound.size) * 100)
            : 0;

        return {
            success: true,
            data: {
                sellers,
                quality: {
                    totalSent: allSent.length,
                    totalReceived: allReceived.length,
                    uniqueLeadsReached: allUniqueContacts,
                    avgFirstResponseSec,
                    responseRate,
                    slaBuckets,
                },
            },
        };
    } catch (e: any) {
        console.error("getSellersPerformance Error:", e);
        return { success: false, error: e?.message ?? "Erro", data: null };
    }
}
