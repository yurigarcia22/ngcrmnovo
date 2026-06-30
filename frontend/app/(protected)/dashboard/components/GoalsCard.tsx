import Link from "next/link";
import { Target, DollarSign, Phone, CalendarCheck } from "lucide-react";

type Metrics = {
    targetRevenue: number; targetCalls: number; targetMeetings: number;
    revenue: number; calls: number; meetings: number;
};

type Progress = {
    isAdmin: boolean;
    label: string;
    me: Metrics | null;
    general: Metrics | null;
    perUser?: Array<{ userId: string; name: string; targetRevenue: number; revenue: number; targetCalls: number; calls: number; targetMeetings: number; meetings: number }>;
};

function money(v: number): string {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1)}k`;
    return `R$ ${Math.round(v)}`;
}

function MetricBar({ icon, label, current, target, fmt }: { icon: React.ReactNode; label: string; current: number; target: number; fmt: (n: number) => string }) {
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const hit = target > 0 && current >= target;
    const noTarget = target <= 0;
    const barColor = hit ? "#34d399" : "#818cf8";
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/85">{icon}{label}</span>
                <span className="text-[12px] tabular-nums text-blue-200/70">
                    <span className="text-white font-bold">{fmt(current)}</span>
                    <span className="text-blue-200/40"> / {noTarget ? "—" : fmt(target)}</span>
                    {!noTarget && <span className={`ml-2 font-bold ${hit ? "text-emerald-300" : "text-indigo-300"}`}>{pct}%</span>}
                </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
        </div>
    );
}

export function GoalsCard({ progress }: { progress: Progress }) {
    const data = progress.isAdmin ? progress.general : progress.me;
    if (!data) return null;

    const title = progress.isAdmin ? "Meta geral do time" : "Minha meta";
    const perUser = progress.isAdmin ? (progress.perUser ?? []) : [];

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10 h-full">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
                        <Target className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
                        <p className="text-[11px] text-blue-200/50 capitalize">{progress.label}</p>
                    </div>
                </div>
                {progress.isAdmin && (
                    <Link href="/settings/metas" className="text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold">Editar</Link>
                )}
            </div>

            <div className="space-y-4">
                <MetricBar icon={<DollarSign size={13} />} label="Valor vendido" current={data.revenue} target={data.targetRevenue} fmt={money} />
                <MetricBar icon={<Phone size={13} />} label="Ligações feitas" current={data.calls} target={data.targetCalls} fmt={(n) => String(n)} />
                <MetricBar icon={<CalendarCheck size={13} />} label="Reuniões marcadas" current={data.meetings} target={data.targetMeetings} fmt={(n) => String(n)} />
            </div>

            {progress.isAdmin && perUser.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/40 mb-2.5">Por vendedor</p>
                    <div className="space-y-2.5">
                        {perUser.map((u) => {
                            const pct = u.targetRevenue > 0 ? Math.min(100, Math.round((u.revenue / u.targetRevenue) * 100)) : 0;
                            const hit = u.targetRevenue > 0 && u.revenue >= u.targetRevenue;
                            return (
                                <div key={u.userId} className="flex items-center gap-3">
                                    <span className="text-[12px] text-white/80 truncate w-28 shrink-0">{u.name}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: hit ? "#34d399" : "#818cf8" }} />
                                    </div>
                                    <span className="text-[11px] tabular-nums text-blue-200/60 w-24 text-right shrink-0">
                                        {money(u.revenue)}{u.targetRevenue > 0 && <span className="text-blue-200/35"> / {money(u.targetRevenue)}</span>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
