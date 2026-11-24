"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/app/actions";
import { isModuleEnabled } from "@/lib/modules";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// "Agora" em Brasilia: os campos UTC deste Date sao a hora local de Brasilia (sem horario de verao).
function brNow() {
    return new Date(Date.now() - 3 * 3600 * 1000);
}

// Normaliza um "YYYY-MM" (ou vazio = mes corrente BRT) para o 1o dia do mes (date) + label.
function resolvePeriod(period?: string) {
    let y: number, m: number; // m: 0-based
    if (period && /^\d{4}-\d{2}$/.test(period)) {
        const [yy, mm] = period.split("-").map(Number);
        y = yy; m = mm - 1;
    } else {
        const brT = brNow();
        y = brT.getUTCFullYear(); m = brT.getUTCMonth();
    }
    const periodDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { periodDate, label: `${MESES[m]}/${y}` };
}

const int = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const num = (v: unknown) => Math.max(0, Number(v) || 0);

// ---- Tipos ----------------------------------------------------------------

export type DayTargets = { calls: number; decisors: number; meetings: number; meetingsDone: number };
export type WeekTargets = { calls: number; meetings: number; meetingsDone: number; proposals: number; contracts: number };
export type MonthTargets = { revenue: number; calls: number; meetings: number };
export type GoalTargets = { day: DayTargets; week: WeekTargets; month: MonthTargets };

export type Milestone = { due: string; contracts: number; revenue: number };
export type GoalPlan = { startDate: string; baseRevenue: number; milestones: Milestone[] };

export type MetricKey =
    | "calls" | "decisors" | "meetings" | "meetings_done" | "proposals"
    | "contracts" | "revenue" | "dispatched" | "replies" | "replies_pending";
export type Period3 = { d: number; w: number; m: number };
export type RealTotals = Record<MetricKey, Period3>;

const METRICS: MetricKey[] = ["calls", "decisors", "meetings", "meetings_done", "proposals", "contracts", "revenue", "dispatched", "replies", "replies_pending"];

function emptyTotals(): RealTotals {
    const t = {} as RealTotals;
    for (const k of METRICS) t[k] = { d: 0, w: 0, m: 0 };
    return t;
}

function rowToTargets(g: any | null, monthRow: any | null): GoalTargets {
    return {
        day: {
            calls: int(g?.day_calls), decisors: int(g?.day_decisors),
            meetings: int(g?.day_meetings), meetingsDone: int(g?.day_meetings_done),
        },
        week: {
            calls: int(g?.week_calls), meetings: int(g?.week_meetings), meetingsDone: int(g?.week_meetings_done),
            proposals: int(g?.week_proposals), contracts: int(g?.week_contracts),
        },
        // Meta do mes so vale para o proprio mes (nao herda do mes anterior).
        month: {
            revenue: num(monthRow?.target_revenue), calls: int(monthRow?.target_calls), meetings: int(monthRow?.target_meetings),
        },
    };
}

function hasDayWeek(g: any | null) {
    if (!g) return false;
    return ["day_calls", "day_decisors", "day_meetings", "day_meetings_done", "week_calls", "week_meetings", "week_meetings_done", "week_proposals", "week_contracts"]
        .some((k) => int(g[k]) > 0);
}

// Escolhe, para um dono (null = geral), a linha do mes corrente e a linha que vale
// para dia/semana: a do mes corrente se tiver alvo de dia/semana, senao a mais recente que tiver.
function pickGoal(goals: any[], owner: string | null, periodDate: string) {
    const mine = goals.filter((g) => (owner === null ? g.user_id === null : g.user_id === owner));
    const current = mine.find((g) => g.period === periodDate) ?? null;
    const sorted = mine.filter((g) => g.period <= periodDate).sort((a, b) => (a.period < b.period ? 1 : -1));
    const dayWeek = hasDayWeek(current) ? current : (sorted.find((g) => hasDayWeek(g)) ?? null);
    return { current, dayWeek };
}

function parsePlan(row: any | null): GoalPlan | null {
    if (!row) return null;
    const list = Array.isArray(row.milestones) ? row.milestones : [];
    return {
        startDate: String(row.start_date),
        baseRevenue: num(row.base_revenue),
        milestones: list
            .filter((x: any) => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.due)))
            .map((x: any) => ({ due: String(x.due), contracts: int(x.contracts), revenue: num(x.revenue) }))
            .sort((a: Milestone, b: Milestone) => (a.due < b.due ? -1 : 1)),
    };
}

// ---- CONFIG (admin) ----------------------------------------------------

// Lista vendedores + a meta geral e a de cada um para o mes corrente. Quando o mes
// ainda nao tem linha, os alvos de dia/semana vem preenchidos com os do mes anterior.
export async function getGoalsForMonth(period?: string) {
    try {
        const profile = await getCurrentProfile();
        if (!profile) throw new Error("Não autenticado.");
        if (profile.role !== "admin") throw new Error("Apenas administradores.");

        const { tenantId } = profile;
        const { periodDate, label } = resolvePeriod(period);
        const supabase = svc();

        const [{ data: members }, { data: goals }, { data: planRow }, disparos] = await Promise.all([
            supabase.from("profiles").select("id, full_name, avatar_url, role").eq("tenant_id", tenantId).eq("is_active", true).order("full_name"),
            supabase.from("goals").select("*").eq("tenant_id", tenantId).lte("period", periodDate),
            supabase.from("goal_plans").select("*").eq("tenant_id", tenantId).maybeSingle(),
            isModuleEnabled(tenantId, "disparos"),
        ]);

        const all = goals ?? [];
        const build = (owner: string | null) => {
            const { current, dayWeek } = pickGoal(all, owner, periodDate);
            const inherited = !hasDayWeek(current) && !!dayWeek;
            return {
                exists: !!current,
                targets: rowToTargets(dayWeek, current),
                inheritedFrom: inherited ? String(dayWeek.period) : null,
            };
        };

        const users = (members ?? []).map((u: any) => ({
            userId: u.id,
            fullName: u.full_name || "Sem nome",
            role: u.role,
            goal: build(u.id),
        }));

        return {
            success: true, isAdmin: true, period: periodDate, label,
            general: build(null), users,
            plan: parsePlan(planRow), disparos,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Cria/atualiza a meta do mes corrente. userId null = meta geral do tenant.
export async function upsertGoal(input: { userId: string | null; period?: string; targets: GoalTargets }) {
    try {
        const profile = await getCurrentProfile();
        if (!profile) throw new Error("Não autenticado.");
        if (profile.role !== "admin") throw new Error("Apenas administradores definem metas.");

        const { tenantId } = profile;
        const { periodDate } = resolvePeriod(input.period);
        const supabase = svc();
        const t = input.targets;

        const payload = {
            tenant_id: tenantId,
            user_id: input.userId,
            period: periodDate,
            target_revenue: num(t.month.revenue),
            target_calls: int(t.month.calls),
            target_meetings: int(t.month.meetings),
            day_calls: int(t.day.calls),
            day_decisors: int(t.day.decisors),
            day_meetings: int(t.day.meetings),
            day_meetings_done: int(t.day.meetingsDone),
            week_calls: int(t.week.calls),
            week_meetings: int(t.week.meetings),
            week_meetings_done: int(t.week.meetingsDone),
            week_proposals: int(t.week.proposals),
            week_contracts: int(t.week.contracts),
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

// Salva o plano de marcos do tenant (inicio, faturamento de partida e marcos).
export async function saveGoalPlan(plan: GoalPlan) {
    try {
        const profile = await getCurrentProfile();
        if (!profile) throw new Error("Não autenticado.");
        if (profile.role !== "admin") throw new Error("Apenas administradores definem metas.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate || "")) throw new Error("Informe a data de início.");

        const milestones = (plan.milestones || [])
            .filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.due || ""))
            .map((m) => ({ due: m.due, contracts: int(m.contracts), revenue: num(m.revenue) }))
            .sort((a, b) => (a.due < b.due ? -1 : 1));

        const { error } = await svc().from("goal_plans").upsert({
            tenant_id: profile.tenantId,
            start_date: plan.startDate,
            base_revenue: num(plan.baseRevenue),
            milestones,
            updated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id" });
        if (error) throw error;

        revalidatePath("/settings/metas");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ---- PROGRESSO (dashboard) ---------------------------------------------

// Meta x realizado de HOJE, da SEMANA e do MES (Brasilia). O realizado vem da funcao
// goals_execution no banco:
//   ligacoes/decisores  = interacoes registradas no cold call
//   reunioes marcadas   = cold call + botao Reuniao do Disparo
//   reunioes feitas     = resultado "aconteceu" (cold call + Disparo)
//   propostas           = deal entrando numa etapa marcada como Proposta
//   contratos / valor   = deals ganhas nos funis que contam na meta
//   disparos / respostas = Disparo (resposta automatica de robo nao conta)
export async function getGoalsProgress() {
    try {
        const profile = await getCurrentProfile();
        if (!profile) return { success: false as const };
        const { tenantId, userId, role } = profile;
        const isAdmin = role === "admin";
        const { periodDate, label } = resolvePeriod();
        const supabase = svc();

        const [{ data: goals }, { data: rows, error: rowsErr }, { data: members }, { data: planRow }, disparos, coldCall] = await Promise.all([
            supabase.from("goals").select("*").eq("tenant_id", tenantId).lte("period", periodDate),
            supabase.rpc("goals_execution", { p_tenant: tenantId }),
            supabase.from("profiles").select("id, full_name").eq("tenant_id", tenantId).eq("is_active", true),
            supabase.from("goal_plans").select("*").eq("tenant_id", tenantId).maybeSingle(),
            isModuleEnabled(tenantId, "disparos"),
            isModuleEnabled(tenantId, "cold_call"),
        ]);
        if (rowsErr) throw rowsErr;

        // Realizado por usuario (null = sem dono, so entra no total do time).
        const byUser = new Map<string, RealTotals>();
        const team = emptyTotals();
        for (const r of (rows ?? []) as any[]) {
            const k = r.metric as MetricKey;
            if (!METRICS.includes(k)) continue;
            const v = { d: Number(r.d) || 0, w: Number(r.w) || 0, m: Number(r.m) || 0 };
            team[k].d += v.d; team[k].w += v.w; team[k].m += v.m;
            const uid = r.user_id ? String(r.user_id) : "";
            if (!uid) continue;
            if (!byUser.has(uid)) byUser.set(uid, emptyTotals());
            const u = byUser.get(uid)!;
            u[k].d += v.d; u[k].w += v.w; u[k].m += v.m;
        }

        // Alvo: admin ve a meta geral (ou a propria, se nao tiver geral); vendedor ve a sua.
        const all = goals ?? [];
        const general = pickGoal(all, null, periodDate);
        const own = pickGoal(all, userId, periodDate);
        const chosen = isAdmin && (general.current || general.dayWeek) ? general : own;
        const hasAnyGoal = !!(chosen.current || chosen.dayWeek);
        const targets = hasAnyGoal ? rowToTargets(chosen.dayWeek, chosen.current) : null;
        const real = isAdmin ? team : (byUser.get(userId) ?? emptyTotals());

        // Disparos de hoje: o teto do dia e a soma do limite diario das campanhas rodando.
        let dispatchCap = 0;
        if (disparos) {
            const { data: camps } = await supabase.from("dispatch_campaigns").select("daily_cap, created_by")
                .eq("tenant_id", tenantId).eq("status", "running");
            for (const c of camps ?? []) {
                if (isAdmin || c.created_by === userId) dispatchCap += Number(c.daily_cap) || 0;
            }
        }

        // Marcos: contratos e valor ganho desde o inicio do plano (time todo).
        const plan = parsePlan(planRow);
        let planProgress: { contracts: number; revenue: number } | null = null;
        if (plan) {
            const { data: won } = await supabase.rpc("goals_won_since", { p_tenant: tenantId, p_since: `${plan.startDate}T00:00:00-03:00` });
            const w = Array.isArray(won) ? won[0] : won;
            planProgress = { contracts: Number(w?.contracts) || 0, revenue: Number(w?.revenue) || 0 };
        }

        // Calendario: dia da semana (1 = segunda) e dias uteis ja corridos na semana.
        const now = brNow();
        const dow = now.getUTCDay();
        const isWeekday = dow >= 1 && dow <= 5;
        const weekDaysElapsed = dow === 0 || dow === 6 ? 5 : dow;
        const dd = String(now.getUTCDate()).padStart(2, "0");
        const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
        const monday = new Date(now.getTime() - ((dow + 6) % 7) * 86400000);
        const sunday = new Date(monday.getTime() + 6 * 86400000);
        const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

        const nameById = new Map<string, string>();
        for (const m of members ?? []) nameById.set(m.id, m.full_name || "Sem nome");
        const perUser = isAdmin
            ? [...byUser.entries()]
                .map(([uid, t]) => ({ userId: uid, name: nameById.get(uid) ?? "Sem nome", real: t }))
                .filter((u) => nameById.has(u.userId))
                .sort((a, b) => b.real.calls.w - a.real.calls.w || b.real.meetings.w - a.real.meetings.w)
            : [];

        return {
            success: true as const,
            isAdmin,
            label,
            todayLabel: `${DIAS[dow]}, ${dd}/${mm}`,
            weekLabel: `${fmt(monday)} a ${fmt(sunday)}`,
            isWeekday,
            weekDaysElapsed,
            targets,
            real,
            modules: { disparos, coldCall },
            dispatchCap,
            plan,
            planProgress,
            perUser,
        };
    } catch (e: any) {
        return { success: false as const, error: e.message };
    }
}
