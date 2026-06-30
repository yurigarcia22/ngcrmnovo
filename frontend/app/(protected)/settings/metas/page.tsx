"use client";
import { useState, useEffect } from "react";
import { Target, Loader2, Save, DollarSign, Phone, CalendarCheck, Users, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { getGoalsForMonth, upsertGoal } from "./actions";

type GoalRowProps = {
    title: string;
    subtitle?: string;
    userId: string | null;
    goal: any;
    accent?: boolean;
    onSaved: () => void;
};

function GoalRow({ title, subtitle, userId, goal, accent, onSaved }: GoalRowProps) {
    const [revenue, setRevenue] = useState<string>(goal ? String(goal.target_revenue ?? 0) : "");
    const [calls, setCalls] = useState<string>(goal ? String(goal.target_calls ?? 0) : "");
    const [meetings, setMeetings] = useState<string>(goal ? String(goal.target_meetings ?? 0) : "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setRevenue(goal ? String(goal.target_revenue ?? 0) : "");
        setCalls(goal ? String(goal.target_calls ?? 0) : "");
        setMeetings(goal ? String(goal.target_meetings ?? 0) : "");
    }, [goal]);

    async function save() {
        setSaving(true);
        const res = await upsertGoal({
            userId,
            targetRevenue: Number(revenue) || 0,
            targetCalls: Number(calls) || 0,
            targetMeetings: Number(meetings) || 0,
        });
        if (res.success) { toast.success("Meta salva!"); onSaved(); }
        else toast.error(res.error || "Erro ao salvar");
        setSaving(false);
    }

    const field = (icon: React.ReactNode, label: string, value: string, set: (v: string) => void, prefix?: string) => (
        <div className="flex-1 min-w-[120px]">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1">{icon}{label}</label>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition">
                {prefix && <span className="pl-2.5 text-sm text-slate-400">{prefix}</span>}
                <input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none tabular-nums"
                />
            </div>
        </div>
    );

    return (
        <div className={`rounded-xl border p-4 ${accent ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between mb-3 gap-3">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                    {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
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
            <div className="flex flex-wrap gap-3">
                {field(<DollarSign size={12} />, "Valor vendido", revenue, setRevenue, "R$")}
                {field(<Phone size={12} />, "Ligações feitas", calls, setCalls)}
                {field(<CalendarCheck size={12} />, "Reuniões marcadas", meetings, setMeetings)}
            </div>
        </div>
    );
}

export default function MetasSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [label, setLabel] = useState("");
    const [general, setGeneral] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);

    async function load() {
        setLoading(true);
        const res = await getGoalsForMonth();
        if (!res.success) {
            setDenied(true);
        } else {
            setLabel(res.label || "");
            setGeneral(res.general ?? null);
            setUsers(res.users ?? []);
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
                description={`Defina a meta do time e de cada vendedor. Mês: ${label}.`}
                icon={<Target className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Metas" },
                ]}
            />

            <div className="space-y-6">
                <div>
                    <div className="flex items-center gap-2 mb-2 text-slate-500">
                        <Target size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Meta geral do time</span>
                    </div>
                    <GoalRow
                        title="Time inteiro"
                        subtitle="Aparece no dashboard do administrador"
                        userId={null}
                        goal={general}
                        accent
                        onSaved={load}
                    />
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
                                <GoalRow
                                    key={u.userId}
                                    title={u.fullName}
                                    subtitle={u.role === "admin" ? "Administrador" : "Vendedor"}
                                    userId={u.userId}
                                    goal={u.goal}
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
