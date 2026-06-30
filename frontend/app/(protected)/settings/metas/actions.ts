"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/app/actions";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Resultados de cold-call que contam como "ligação feita" (mesma regra do dashboard).
const CALL_RESULTS = ["ligacao_feita", "contato_realizado", "contato_decisor", "reuniao_marcada", "convertido", "descartado", "sem_interesse", "numero_inexistente"];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Normaliza um "YYYY-MM" (ou vazio = mes corrente BRT) para o 1o dia do mes (date) + label + range ISO.
function resolvePeriod(period?: string) {
    let y: number, m: number; // m: 0-based
    if (period && /^\d{4}-\d{2}$/.test(period)) {
        const [yy, mm] = period.split("-").map(Number);
        y = yy; m = mm - 1;
    } else {
        const brT = new Date(Date.now() - 3 * 3600 * 1000);
        y = brT.getUTCFullYear(); m = brT.getUTCMonth();
    }
    const periodDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const startISO = new Date(Date.UTC(y, m, 1, 3, 0, 0)).toISOString();
    const endISO = new Date(Date.UTC(y, m + 1, 1, 3, 0, 0)).toISOString();
    return { periodDate, startISO, endISO, label: `${MESES[m]}/${y}` };
}

// ---- CONFIG (admin) ----------------------------------------------------

// Lista vendedores + a meta geral e a meta de cada um para um mes.
export async function getGoalsForMonth(period?: string) {
    try {
        const profile = await getCurrentProfile();
        if (!profile) throw new Error("Não autenticado.");
        if (profile.role !== "admin") throw new Error("Apenas administradores.");

        const { tenantId } = profile;
        const { periodDate, label } = resolvePeriod(period);
        const supabase = svc();

        const [{ data: members }, { data: goals }] = await Promise.all([
            supabase.from("profiles").select("id, full_name, avatar_url, role").eq("tenant_id", tenantId).eq("is_active", true).order("full_name"),
            supabase.from("goals").select("*").eq("tenant_id", tenantId).eq("period", periodDate),
        ]);

        const goalByUser = new Map<string, any>();
        let general: any = null;
        for (const g of goals ?? []) {
            if (g.user_id === null) general = g;
            else goalByUser.set(g.user_id, g);
        }

        const users = (members ?? []).map((u: any) => ({
            userId: u.id,
            fullName: u.full_name || "Sem nome",
            role: u.role,
            goal: goalByUser.get(u.id) ?? null,
        }));

        return { success: true, isAdmin: true, period: periodDate, label, general, users };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Cria/atualiza uma meta. userId null = meta geral do tenant.
export async function upsertGoal(input: {
    userId: string | null;
    period?: string;
    targetRevenue: number;
    targetCalls: number;
    targetMeetings: number;
}) {
    try {
        const profile = await getCurrentProfile();
        if (!profile) throw new Error("Não autenticado.");
        if (profile.role !== "admin") throw new Error("Apenas administradores definem metas.");

        const { tenantId } = profile;
        const { periodDate } = resolvePeriod(input.period);
        const supabase = svc();

        const payload = {
            tenant_id: tenantId,
            user_id: input.userId,
            period: periodDate,
            target_revenue: Math.max(0, Number(input.targetRevenue) || 0),
            target_calls: Math.max(0, Math.round(Number(input.targetCalls) || 0)),
            target_meetings: Math.max(0, Math.round(Number(input.targetMeetings) || 0)),
            updated_at: new Date().toISOString(),
        };

        // Indices unicos sao parciais (user_id IS NULL / NOT NULL), entao fazemos
        // o upsert manualmente: procura existente e atualiza, senao insere.
        let existing = supabase.from("goals").select("id").eq("tenant_id", tenantId).eq("period", periodDate);
        existing = input.userId === null ? existing.is("user_id", null) : existing.eq("user_id", input.userId);
        const { data: found } = await existing.maybeSingle();

        if (found?.id) {
            const { error } = await supabase.from("goals").update(payload).eq("id", found.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from("goals").insert(payload);
            if (error) throw error;
        }

        revalidatePath("/settings/metas");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ---- PROGRESSO (dashboard) ---------------------------------------------

// Calcula meta vs realizado do MES CORRENTE para o usuario atual (e, se admin,
// para o time todo e por vendedor). Realizado:
//   revenue  = soma do valor de deals ganhos (closed_at no mes) por owner
//   calls    = notas "Interação Registrada:<resultado de ligacao>" por created_by
//   meetings = notas "Interação Registrada: reuniao_marcada" por created_by
export async function getGoalsProgress() {
    try {
        const profile = await getCurrentProfile();
        if (!profile) return { success: false };
        const { tenantId, userId, role } = profile;
        const isAdmin = role === "admin";
        const { periodDate, startISO, endISO, label } = resolvePeriod();
        const supabase = svc();

        const [{ data: goals }, { data: wonDeals }, { data: notes }, { data: members }] = await Promise.all([
            supabase.from("goals").select("*").eq("tenant_id", tenantId).eq("period", periodDate),
            supabase.from("deals").select("owner_id, value, closed_at, status").eq("tenant_id", tenantId).eq("status", "won").gte("closed_at", startISO).lt("closed_at", endISO),
            supabase.from("cold_lead_notes").select("created_by, content, created_at, cold_leads!inner(tenant_id)").eq("cold_leads.tenant_id", tenantId).ilike("content", "Interação Registrada:%").gte("created_at", startISO).lt("created_at", endISO),
            supabase.from("profiles").select("id, full_name").eq("tenant_id", tenantId).eq("is_active", true),
        ]);

        // Agrega realizado por usuario.
        type Real = { revenue: number; calls: number; meetings: number };
        const realByUser = new Map<string, Real>();
        const ensure = (uid: string) => {
            if (!realByUser.has(uid)) realByUser.set(uid, { revenue: 0, calls: 0, meetings: 0 });
            return realByUser.get(uid)!;
        };
        let totalRevenue = 0, totalCalls = 0, totalMeetings = 0;

        for (const d of wonDeals ?? []) {
            const v = Number(d.value || 0);
            totalRevenue += v;
            if (d.owner_id) ensure(d.owner_id).revenue += v;
        }
        for (const n of notes ?? []) {
            const result = String(n.content || "").replace("Interação Registrada:", "").trim();
            const isCall = CALL_RESULTS.includes(result);
            const isMeeting = result === "reuniao_marcada";
            if (isCall) { totalCalls += 1; if (n.created_by) ensure(n.created_by).calls += 1; }
            if (isMeeting) { totalMeetings += 1; if (n.created_by) ensure(n.created_by).meetings += 1; }
        }

        // Metas indexadas.
        const goalByUser = new Map<string, any>();
        let generalGoal: any = null;
        for (const g of goals ?? []) {
            if (g.user_id === null) generalGoal = g;
            else goalByUser.set(g.user_id, g);
        }

        const nameById = new Map<string, string>();
        for (const m of members ?? []) nameById.set(m.id, m.full_name || "Sem nome");

        const myReal = realByUser.get(userId) ?? { revenue: 0, calls: 0, meetings: 0 };
        const myGoal = goalByUser.get(userId) ?? null;

        const me = myGoal ? {
            targetRevenue: Number(myGoal.target_revenue || 0),
            targetCalls: Number(myGoal.target_calls || 0),
            targetMeetings: Number(myGoal.target_meetings || 0),
            ...myReal,
        } : null;

        let general: any = null;
        let perUser: any[] = [];
        if (isAdmin) {
            general = generalGoal ? {
                targetRevenue: Number(generalGoal.target_revenue || 0),
                targetCalls: Number(generalGoal.target_calls || 0),
                targetMeetings: Number(generalGoal.target_meetings || 0),
                revenue: totalRevenue, calls: totalCalls, meetings: totalMeetings,
            } : { targetRevenue: 0, targetCalls: 0, targetMeetings: 0, revenue: totalRevenue, calls: totalCalls, meetings: totalMeetings };

            perUser = (members ?? [])
                .map((m: any) => {
                    const g = goalByUser.get(m.id);
                    const r = realByUser.get(m.id) ?? { revenue: 0, calls: 0, meetings: 0 };
                    return {
                        userId: m.id,
                        name: m.full_name || "Sem nome",
                        hasGoal: !!g,
                        targetRevenue: Number(g?.target_revenue || 0),
                        targetCalls: Number(g?.target_calls || 0),
                        targetMeetings: Number(g?.target_meetings || 0),
                        ...r,
                    };
                })
                // Mostra quem tem meta ou quem produziu algo no mes.
                .filter((u: any) => u.hasGoal || u.revenue > 0 || u.calls > 0 || u.meetings > 0)
                .sort((a: any, b: any) => b.revenue - a.revenue);
        }

        return { success: true, isAdmin, period: periodDate, label, me, general, perUser };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
