"use client";
import { useState, useEffect } from "react";
import {
    Target, Loader2, Save, DollarSign, Phone, CalendarCheck, CalendarPlus, Users, ShieldAlert,
    UserCheck, FileText, Handshake, Flag, Plus, Trash2, Info,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { getGoalsForMonth, upsertGoal, saveGoalPlan } from "./actions";
import type { GoalTargets, GoalPlan, Milestone } from "./actions";

const EMPTY: GoalTargets = {
    day: { calls: 0, decisors: 0, meetings: 0, meetingsDone: 0 },
    week: { calls: 0, meetings: 0, meetingsDone: 0, proposals: 0, contracts: 0 },
    month: { revenue: 0, calls: 0, meetings: 0 },
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function monthName(period: string) {
    const [y, m] = period.split("-").map(Number);
    return `${MESES[m - 1]}/${y}`;
}

function NumField({ icon, label, value, onChange, prefix, step }: {
    icon: React.ReactNode; label: string; value: number; onChange: (n: number) => void; prefix?: string; step?: number;
}) {
    return (
        <div className="min-w-[130px] flex-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1">{icon}{label}</label>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition">
                {prefix && <span className="pl-2.5 text-sm text-slate-400">{prefix}</span>}
                <input
                    type="number"
                    min={0}
                    step={step ?? 1}
                    value={value ? String(value) : ""}
                    onChange={(e) => onChange(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-transparent px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none tabular-nums"
                />
            </div>
        </div>
    );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-baseline gap-2 mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
                {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
            </div>
            <div className="flex flex-wrap gap-3">{children}</div>
        </div>
    );
}

type GoalInfo = { exists: boolean; targets: GoalTargets; inheritedFrom: string | null };

function GoalEditor({ title, subtitle, userId, info, accent, onSaved }: {
    title: string; subtitle?: string; userId: string | null; info: GoalInfo | null; accent?: boolean; onSaved: () => void;
}) {
    const [t, setT] = useState<GoalTargets>(info?.targets ?? EMPTY);
    const [saving, setSaving] = useState(false);

    useEffect(() => { setT(info?.targets ?? EMPTY); }, [info]);

    const setDay = (k: keyof GoalTargets["day"]) => (n: number) => setT((p) => ({ ...p, day: { ...p.day, [k]: n } }));
    const setWeek = (k: keyof GoalTargets["week"]) => (n: number) => setT((p) => ({ ...p, week: { ...p.week, [k]: n } }));
    const setMonth = (k: keyof GoalTargets["month"]) => (n: number) => setT((p) => ({ ...p, month: { ...p.month, [k]: n } }));

    async function save() {
        setSaving(true);
        const res = await upsertGoal({ userId, targets: t });
        if (res.success) { toast.success("Meta salva!"); onSaved(); }
        else toast.error(res.error || "Erro ao salvar");
        setSaving(false);
    }

    return (
        <div className={`rounded-xl border p-4 ${accent ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start justify-between mb-4 gap-3">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                    {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
                    {info?.inheritedFrom && (
                        <p className="text-[11px] text-amber-700 mt-1">
                            Dia e semana vindos de {monthName(info.inheritedFrom)} e já valendo. Salvar grava neste mês.
                        </p>
                    )}
                </div>
                <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-60 shrink-0"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Salvar
                </button>
            </div>
            <div className="space-y-4">
                <Group title="Por dia" hint="segunda a sexta">
                    <NumField icon={<Phone size={12} />} label="Ligações" value={t.day.calls} onChange={setDay("calls")} />
                    <NumField icon={<UserCheck size={12} />} label="Conversas com decisor" value={t.day.decisors} onChange={setDay("decisors")} />
                    <NumField icon={<CalendarPlus size={12} />} label="Reuniões marcadas" value={t.day.meetings} onChange={setDay("meetings")} />
                    <NumField icon={<CalendarCheck size={12} />} label="Reuniões feitas" value={t.day.meetingsDone} onChange={setDay("meetingsDone")} />
                </Group>
                <Group title="Por semana">
                    <NumField icon={<Phone size={12} />} label="Ligações" value={t.week.calls} onChange={setWeek("calls")} />
                    <NumField icon={<CalendarPlus size={12} />} label="Reuniões marcadas" value={t.week.meetings} onChange={setWeek("meetings")} />
                    <NumField icon={<CalendarCheck size={12} />} label="Reuniões feitas" value={t.week.meetingsDone} onChange={setWeek("meetingsDone")} />
                    <NumField icon={<FileText size={12} />} label="Propostas enviadas" value={t.week.proposals} onChange={setWeek("proposals")} />
                    <NumField icon={<Handshake size={12} />} label="Contratos" value={t.week.contracts} onChange={setWeek("contracts")} />
                </Group>
                <Group title="No mês" hint="opcional">
                    <NumField icon={<DollarSign size={12} />} label="Valor vendido" value={t.month.revenue} onChange={setMonth("revenue")} prefix="R$" />
                    <NumField icon={<Phone size={12} />} label="Ligações" value={t.month.calls} onChange={setMonth("calls")} />
                    <NumField icon={<CalendarPlus size={12} />} label="Reuniões marcadas" value={t.month.meetings} onChange={setMonth("meetings")} />
                </Group>
            </div>
        </div>
    );
}

function PlanEditor({ plan, onSaved }: { plan: GoalPlan | null; onSaved: () => void }) {
    const [startDate, setStartDate] = useState(plan?.startDate ?? "");
    const [baseRevenue, setBaseRevenue] = useState(plan?.baseRevenue ?? 0);
    const [rows, setRows] = useState<Milestone[]>(plan?.milestones ?? []);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setStartDate(plan?.startDate ?? "");
        setBaseRevenue(plan?.baseRevenue ?? 0);
        setRows(plan?.milestones ?? []);
    }, [plan]);

    const setRow = (i: number, patch: Partial<Milestone>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    async function save() {
        setSaving(true);
        const res = await saveGoalPlan({ startDate, baseRevenue, milestones: rows });
        if (res.success) { toast.success("Marcos salvos!"); onSaved(); }
        else toast.error(res.error || "Erro ao salvar");
        setSaving(false);
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between mb-4 gap-3">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">Plano e marcos</h3>
                    <p className="text-[11px] text-slate-500">
                        Contratos novos contam desde o início. O faturamento do marco é o de partida mais o valor das deals ganhas.
                    </p>
                </div>
                <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-60 shrink-0"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Salvar
                </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
                <div className="min-w-[150px]">
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Início</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <NumField icon={<DollarSign size={12} />} label="Faturamento de partida (por mês)" value={baseRevenue} onChange={setBaseRevenue} prefix="R$" />
            </div>

            <div className="space-y-2">
                {rows.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                        <div className="min-w-[150px]">
                            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1"><Flag size={12} /> Até</label>
                            <input type="date" value={r.due} onChange={(e) => setRow(i, { due: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                        </div>
                        <NumField icon={<Handshake size={12} />} label="Contratos novos (acumulado)" value={r.contracts} onChange={(n) => setRow(i, { contracts: n })} />
                        <NumField icon={<DollarSign size={12} />} label="Faturamento por mês" value={r.revenue} onChange={(n) => setRow(i, { revenue: n })} prefix="R$" />
                        <button
                            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                            className="mb-0.5 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            aria-label="Remover marco"
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => setRows((rs) => [...rs, { due: "", contracts: 0, revenue: 0 }])}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-1 py-1"
                >
                    <Plus size={14} /> Adicionar marco
                </button>
            </div>
        </div>
    );
}

export default function MetasSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [label, setLabel] = useState("");
    const [general, setGeneral] = useState<GoalInfo | null>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [plan, setPlan] = useState<GoalPlan | null>(null);
    const [disparos, setDisparos] = useState(false);

    async function load() {
        setLoading(true);
        const res = await getGoalsForMonth();
        if (!res.success) {
            setDenied(true);
        } else {
            setLabel(res.label || "");
            setGeneral(res.general ?? null);
            setUsers(res.users ?? []);
            setPlan(res.plan ?? null);
            setDisparos(!!res.disparos);
        }
        setLoading(false);
    }

    useEffect(() => { load(); }, []);

    if (loading) {
        return <div className="mx-auto max-w-5xl px-6 py-8"><div className="p-8 text-center text-slate-500">Carregando...</div></div>;
    }

    if (denied) {
        return (
            <div className="mx-auto max-w-5xl px-6 py-8">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">Apenas administradores podem definir metas.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            <PageHeader
                title="Metas"
                description={`Meta de execução do dia e da semana, do mês e os marcos. Mês: ${label}.`}
                icon={<Target className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Metas" },
                ]}
            />

            <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[12px] text-slate-600 flex gap-3">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p><b>Ligações e decisores:</b> o que é registrado no cold call (Prospecção). Decisor conta "falou com o decisor", "reunião marcada" e "convertido".</p>
                        <p><b>Reuniões:</b> as do cold call{disparos ? " mais as marcadas no Disparo" : ""}. Feita é a que ficou como "aconteceu".</p>
                        <p><b>Propostas:</b> deal que entra numa etapa marcada como Proposta (Configurações, Funis).</p>
                        <p><b>Contratos e valor vendido:</b> deals ganhas nos funis que contam nas metas.</p>
                    </div>
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-2 text-slate-500">
                        <Target size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Meta geral do time</span>
                    </div>
                    <GoalEditor
                        title="Time inteiro"
                        subtitle="Aparece no dashboard do administrador"
                        userId={null}
                        info={general}
                        accent
                        onSaved={load}
                    />
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-2 text-slate-500">
                        <Flag size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Marcos</span>
                    </div>
                    <PlanEditor plan={plan} onSaved={load} />
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-2 text-slate-500">
                        <Users size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Metas individuais</span>
                    </div>
                    {users.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                            Nenhum vendedor ativo na equipe.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {users.map((u) => (
                                <GoalEditor
                                    key={u.userId}
                                    title={u.fullName}
                                    subtitle={u.role === "admin" ? "Administrador" : "Vendedor"}
                                    userId={u.userId}
                                    info={u.goal}
                                    onSaved={load}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
