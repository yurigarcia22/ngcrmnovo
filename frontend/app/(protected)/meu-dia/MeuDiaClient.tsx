"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    CheckSquare, Square, Clock, AlarmClock, Calendar,
    Plus, X, Trash2, Repeat, Flame, ChevronRight, ChevronLeft,
    AlertTriangle, Sun, CalendarDays, Trophy, List,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { createTaskFull, completeTask, deleteTask, rescheduleTask, getMyTasks, getMyTasksRange } from "@/app/actions";
import { qk } from "@/lib/query-keys";
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
    isSameMonth, isSameDay, addMonths, subMonths, format,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface Task {
    id: string;
    title?: string | null;
    description: string;
    due_date: string;
    is_completed: boolean;
    priority: "low" | "normal" | "high" | "urgent";
    is_recurring: boolean;
    recurrence_pattern: "daily" | "weekly" | "monthly" | null;
    completed_at: string | null;
    deal_id?: string | null;
    cold_lead_id?: string | null;
    deals?: { id: string; title: string; contacts?: { name?: string } | null } | null;
    cold_leads?: { id: string; nome?: string; telefone?: string } | null;
}

interface TasksGrouped {
    overdue: Task[];
    today: Task[];
    upcoming: Task[];
    completedRecent: Task[];
}

interface Props {
    initialTasks: TasksGrouped;
}

const priorityColor = {
    low:    "bg-slate-100 text-slate-600 border-slate-200",
    normal: "bg-blue-50 text-blue-700 border-blue-200",
    high:   "bg-amber-50 text-amber-700 border-amber-200",
    urgent: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatRelative(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
        return `Hoje ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) {
        return `Amanhã ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    const diffDays = Math.round((d.getTime() - now.getTime()) / (24 * 3600 * 1000));
    if (diffDays < 0) return `Há ${Math.abs(diffDays)}d`;
    if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function normalize(raw: any): TasksGrouped {
    const normalizeTask = (t: any) => {
        const deal = Array.isArray(t.deals) ? t.deals[0] ?? null : t.deals ?? null;
        const coldLead = Array.isArray(t.cold_leads) ? t.cold_leads[0] ?? null : t.cold_leads ?? null;
        let dealNormalized = null;
        if (deal) {
            const contact = Array.isArray(deal.contacts) ? deal.contacts[0] ?? null : deal.contacts ?? null;
            dealNormalized = { id: deal.id, title: deal.title, contacts: contact };
        }
        return { ...t, deals: dealNormalized, cold_leads: coldLead };
    };
    const normGroup = (arr: any[] | undefined) => (arr ?? []).map(normalizeTask);
    return {
        overdue: normGroup(raw?.overdue),
        today: normGroup(raw?.today),
        upcoming: normGroup(raw?.upcoming),
        completedRecent: normGroup(raw?.completedRecent),
    };
}

export function MeuDiaClient({ initialTasks }: Props) {
    const router = useRouter();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const [showNew, setShowNew] = useState(false);
    const [view, setView] = useState<'list' | 'calendar'>('list');

    const tasksQuery = useQuery<TasksGrouped>({
        queryKey: qk.tasks.mine(),
        queryFn: async () => {
            const res = await getMyTasks();
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar tarefas");
            return normalize(res.data);
        },
        initialData: initialTasks,
        staleTime: 30_000,
    });
    const tasks = tasksQuery.data ?? initialTasks;
    const setTasks = (
        updater: TasksGrouped | ((prev: TasksGrouped) => TasksGrouped),
    ) => {
        queryClient.setQueryData(qk.tasks.mine(), (prev: TasksGrouped | undefined) => {
            const base = prev ?? tasks;
            return typeof updater === "function" ? (updater as any)(base) : updater;
        });
    };
    const reload = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: qk.tasks.mine() });
    }, [queryClient]);

    async function handleComplete(t: Task) {
        // Optimistic: move pra completedRecent
        setTasks((prev) => ({
            ...prev,
            overdue: prev.overdue.filter((x) => x.id !== t.id),
            today: prev.today.filter((x) => x.id !== t.id),
            upcoming: prev.upcoming.filter((x) => x.id !== t.id),
            completedRecent: [{ ...t, is_completed: true, completed_at: new Date().toISOString() }, ...prev.completedRecent],
        }));
        const res = await completeTask(t.id);
        if (!res.success) {
            toast.error("Erro ao concluir");
            reload();
            return;
        }
        toast.success(t.is_recurring ? "Concluída + próxima ocorrência criada" : "Tarefa concluída");
        if (t.is_recurring) reload(); // realtime nao tem aqui — força refresh pra mostrar a próxima
    }

    async function handleDelete(t: Task) {
        const ok = await confirm({
            title: "Excluir tarefa?",
            description: t.description,
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;
        setTasks((prev) => ({
            overdue: prev.overdue.filter((x) => x.id !== t.id),
            today: prev.today.filter((x) => x.id !== t.id),
            upcoming: prev.upcoming.filter((x) => x.id !== t.id),
            completedRecent: prev.completedRecent.filter((x) => x.id !== t.id),
        }));
        const res = await deleteTask(t.id);
        if (!res.success) {
            toast.error("Erro ao excluir");
            reload();
        }
    }

    const totalPending = tasks.overdue.length + tasks.today.length + tasks.upcoming.length;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-5xl mx-auto p-6 lg:p-8">

                {/* Header */}
                <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Meu Dia</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            {totalPending === 0
                                ? "Tudo em dia! Bom trabalho 🎯"
                                : `${totalPending} tarefa${totalPending > 1 ? "s" : ""} pendente${totalPending > 1 ? "s" : ""}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Toggle Lista / Calendario */}
                        <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
                            <button
                                onClick={() => setView('list')}
                                className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <List className="w-4 h-4" /> Lista
                            </button>
                            <button
                                onClick={() => setView('calendar')}
                                className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors ${view === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <CalendarDays className="w-4 h-4" /> Calendário
                            </button>
                        </div>
                        <button
                            onClick={() => setShowNew(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm"
                        >
                            <Plus className="w-4 h-4" /> Nova tarefa
                        </button>
                    </div>
                </div>

                {/* SEÇÕES */}
                {view === 'calendar' ? (
                    <CalendarMonth />
                ) : (
                <>
                {tasks.overdue.length > 0 && (
                    <Section
                        title="Atrasadas"
                        count={tasks.overdue.length}
                        accent="rose"
                        icon={<AlertTriangle className="w-4 h-4" />}
                    >
                        {tasks.overdue.map((t) => (
                            <TaskRow key={t.id} task={t} onComplete={handleComplete} onDelete={handleDelete} overdue />
                        ))}
                    </Section>
                )}

                <Section
                    title="Hoje"
                    count={tasks.today.length}
                    accent="amber"
                    icon={<Sun className="w-4 h-4" />}
                >
                    {tasks.today.length === 0 ? (
                        <Empty msg="Nada agendado pra hoje. Que descanso 😎" />
                    ) : (
                        tasks.today.map((t) => (
                            <TaskRow key={t.id} task={t} onComplete={handleComplete} onDelete={handleDelete} today />
                        ))
                    )}
                </Section>

                <Section
                    title="Próximos 7 dias"
                    count={tasks.upcoming.length}
                    accent="blue"
                    icon={<CalendarDays className="w-4 h-4" />}
                >
                    {tasks.upcoming.length === 0 ? (
                        <Empty msg="Sem nada agendado para a semana." />
                    ) : (
                        tasks.upcoming.map((t) => (
                            <TaskRow key={t.id} task={t} onComplete={handleComplete} onDelete={handleDelete} />
                        ))
                    )}
                </Section>

                {tasks.completedRecent.length > 0 && (
                    <Section
                        title="Concluídas recentemente"
                        count={tasks.completedRecent.length}
                        accent="emerald"
                        icon={<Trophy className="w-4 h-4" />}
                        defaultCollapsed
                    >
                        {tasks.completedRecent.map((t) => (
                            <TaskRow key={t.id} task={t} onComplete={() => {}} onDelete={handleDelete} done />
                        ))}
                    </Section>
                )}
                </>
                )}

            </div>

            {showNew && (
                <NewTaskModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); reload(); }} />
            )}
        </div>
    );
}

// =====================================================================

function Section({
    title, count, accent, icon, children, defaultCollapsed,
}: {
    title: string; count: number; accent: "rose" | "amber" | "blue" | "emerald";
    icon: React.ReactNode; children: React.ReactNode; defaultCollapsed?: boolean;
}) {
    const [open, setOpen] = useState(!defaultCollapsed);
    const colors = {
        rose:    { bg: "bg-rose-100",    text: "text-rose-700",    border: "border-rose-200"    },
        amber:   { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200"   },
        blue:    { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200"    },
        emerald: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
    }[accent];

    return (
        <div className="mb-6">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between mb-3 group"
            >
                <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 ${colors.bg} ${colors.text}`}>
                        {icon}
                        {title}
                    </div>
                    <span className="text-xs text-slate-400">{count}</span>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
            {open && <div className="space-y-2">{children}</div>}
        </div>
    );
}

function Empty({ msg }: { msg: string }) {
    return (
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-400 text-center italic">
            {msg}
        </div>
    );
}

function TaskRow({
    task, onComplete, onDelete, overdue, today, done,
}: {
    task: Task;
    onComplete: (t: Task) => void;
    onDelete: (t: Task) => void;
    overdue?: boolean;
    today?: boolean;
    done?: boolean;
}) {
    const [isPending, startTransition] = useTransition();
    const linkedName = task.deals?.contacts?.name ?? task.deals?.title ?? task.cold_leads?.nome ?? task.cold_leads?.telefone ?? null;
    const linkedHref = task.deals?.id ? `/deals/${task.deals.id}` : null;

    return (
        <div className={`bg-white border rounded-lg p-3 flex items-start gap-3 transition-all ${
            done ? "border-slate-100 opacity-60"
            : overdue ? "border-rose-200 bg-rose-50/30"
            : today ? "border-amber-200"
            : "border-slate-200 hover:border-slate-300"
        }`}>
            <button
                onClick={() => startTransition(() => onComplete(task))}
                disabled={done || isPending}
                className={`mt-0.5 shrink-0 ${done ? "text-emerald-500" : "text-slate-300 hover:text-emerald-500"}`}
                title={done ? "Concluída" : "Marcar como concluída"}
            >
                {done ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            </button>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {task.title && <strong className={`text-sm ${done ? "line-through text-slate-400" : "text-slate-900"}`}>{task.title}</strong>}
                    <span className={`text-sm ${done ? "line-through text-slate-400" : "text-slate-700"}`}>
                        {task.description}
                    </span>
                    {task.is_recurring && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            <Repeat className="w-3 h-3" />
                            {task.recurrence_pattern === "daily" ? "diária" : task.recurrence_pattern === "weekly" ? "semanal" : "mensal"}
                        </span>
                    )}
                    {task.priority !== "normal" && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${priorityColor[task.priority]}`}>
                            {task.priority === "urgent" && <Flame className="w-3 h-3" />}
                            {task.priority}
                        </span>
                    )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelative(task.due_date)}
                    </span>
                    {linkedName && (
                        linkedHref ? (
                            <Link href={linkedHref} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                                <ChevronRight className="w-3 h-3" />
                                {linkedName}
                            </Link>
                        ) : (
                            <span>· {linkedName}</span>
                        )
                    )}
                </div>
            </div>

            <button
                onClick={() => onDelete(task)}
                className="text-slate-300 hover:text-rose-500 shrink-0 mt-0.5"
                title="Excluir"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState(() => {
        const d = new Date();
        d.setHours(d.getHours() + 1, 0, 0, 0);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    });
    const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrencePattern, setRecurrencePattern] = useState<"daily" | "weekly" | "monthly">("weekly");
    const [saving, setSaving] = useState(false);

    async function save() {
        if (!description.trim()) {
            toast.error("Descreva a tarefa");
            return;
        }
        setSaving(true);
        const res = await createTaskFull({
            description: description.trim(),
            dueDate: new Date(dueDate).toISOString(),
            priority,
            isRecurring,
            recurrencePattern: isRecurring ? recurrencePattern : null,
        });
        setSaving(false);
        if (!res.success) {
            toast.error("Erro: " + res.error);
            return;
        }
        toast.success("Tarefa criada");
        onCreated();
    }

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">Nova tarefa</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            O que fazer?
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            autoFocus
                            placeholder="Ligar pro João sobre proposta"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            Quando?
                        </label>
                        <input
                            type="datetime-local"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                        />
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                        {(["low", "normal", "high", "urgent"] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPriority(p)}
                                className={`px-2 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                                    priority === p
                                        ? priorityColor[p]
                                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                }`}
                            >
                                {p === "low" ? "Baixa" : p === "normal" ? "Normal" : p === "high" ? "Alta" : "Urgente"}
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isRecurring}
                                onChange={(e) => setIsRecurring(e.target.checked)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-slate-700">Repetir</span>
                        </label>

                        {isRecurring && (
                            <div className="mt-2 ml-6 flex gap-1">
                                {(["daily", "weekly", "monthly"] as const).map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setRecurrencePattern(r)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-md border ${
                                            recurrencePattern === r
                                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                : "border-slate-200 text-slate-500 hover:bg-slate-50"
                                        }`}
                                    >
                                        {r === "daily" ? "Diária" : r === "weekly" ? "Semanal" : "Mensal"}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 rounded-md">
                        Cancelar
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="px-4 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md"
                    >
                        {saving ? "Salvando..." : "Criar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Visao calendario: grade do mes com as tarefas posicionadas pela data.
function CalendarMonth() {
    const [cursor, setCursor] = useState<Date>(() => new Date());
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const today = new Date();

    const calQuery = useQuery({
        queryKey: ["myTasksRange", gridStart.toISOString(), gridEnd.toISOString()],
        queryFn: async () => {
            const res = await getMyTasksRange(gridStart.toISOString(), gridEnd.toISOString());
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar");
            return (res.data ?? []).map((t: any) => {
                const deal = Array.isArray(t.deals) ? t.deals[0] ?? null : t.deals ?? null;
                return { ...t, deals: deal };
            });
        },
        staleTime: 30_000,
    });
    const calTasks: any[] = calQuery.data ?? [];
    const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            {/* Navegacao de mes */}
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCursor(subMonths(cursor, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Mês anterior">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-slate-800 capitalize">
                    {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
                </h2>
                <button onClick={() => setCursor(addMonths(cursor, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Próximo mês">
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Cabecalho dos dias da semana */}
            <div className="grid grid-cols-7 gap-1 mb-1">
                {weekdays.map((d) => (
                    <div key={d} className="text-[11px] font-bold text-slate-400 text-center py-1">{d}</div>
                ))}
            </div>

            {/* Grade de dias */}
            <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                    const inMonth = isSameMonth(day, cursor);
                    const isToday = isSameDay(day, today);
                    const dayTasks = calTasks
                        .filter((t) => t.due_date && isSameDay(new Date(t.due_date), day))
                        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
                    return (
                        <div
                            key={day.toISOString()}
                            className={`min-h-[96px] rounded-lg border p-1.5 ${inMonth ? "bg-white" : "bg-slate-50/60"} ${isToday ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-100"}`}
                        >
                            <div className={`text-[11px] font-bold mb-1 ${isToday ? "text-indigo-600" : inMonth ? "text-slate-600" : "text-slate-300"}`}>
                                {format(day, "d")}
                            </div>
                            <div className="space-y-1">
                                {dayTasks.slice(0, 4).map((t) => {
                                    const overdueT = !t.is_completed && new Date(t.due_date) < today && !isSameDay(new Date(t.due_date), today);
                                    const cls = t.is_completed
                                        ? "bg-slate-100 text-slate-400 line-through"
                                        : overdueT ? "bg-rose-100 text-rose-700"
                                        : t.priority === "urgent" ? "bg-rose-50 text-rose-700"
                                        : t.priority === "high" ? "bg-amber-50 text-amber-700"
                                        : "bg-indigo-50 text-indigo-700";
                                    const label = `${format(new Date(t.due_date), "HH:mm")} ${t.description}`;
                                    const chip = (
                                        <div className={`text-[10px] px-1.5 py-0.5 rounded truncate ${cls}`} title={label}>{label}</div>
                                    );
                                    return t.deals?.id
                                        ? <Link key={t.id} href={`/deals/${t.deals.id}`}>{chip}</Link>
                                        : <div key={t.id}>{chip}</div>;
                                })}
                                {dayTasks.length > 4 && (
                                    <div className="text-[9px] text-slate-400 pl-1">+{dayTasks.length - 4} mais</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {calQuery.isLoading && (
                <div className="text-center text-xs text-slate-400 mt-3">Carregando tarefas...</div>
            )}
        </div>
    );
}
