"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
    Target, Phone, UserCheck, CalendarPlus, CalendarCheck, FileText, Handshake,
    Send, MessageCircleReply, Clock, Copy, Check, Flag, DollarSign,
} from "lucide-react";
import type { GoalTargets, GoalPlan, RealTotals } from "@/app/(protected)/settings/metas/actions";

type Progress = {
    isAdmin: boolean;
    label: string;
    todayLabel: string;
    weekLabel: string;
    isWeekday: boolean;
    weekDaysElapsed: number;
    targets: GoalTargets | null;
    real: RealTotals;
    modules: { disparos: boolean; coldCall: boolean };
    dispatchCap: number;
    plan: GoalPlan | null;
    planProgress: { contracts: number; revenue: number } | null;
    perUser: Array<{ userId: string; name: string; real: RealTotals }>;
};

function money(v: number): string {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
    if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil`;
    return `R$ ${Math.round(v)}`;
}

const plain = (n: number) => String(Math.round(n));

function shortDate(iso: string) {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
}

// Barra de progresso. pace = quanto ja deveria ter ate hoje (so na semana).
function Bar({ icon, label, current, target, pace, fmt = plain }: {
    icon: React.ReactNode; label: string; current: number; target: number; pace?: number; fmt?: (n: number) => string;
}) {
    const has = target > 0;
    const pct = has ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const hit = has && current >= target;
    const behind = has && pace !== undefined && !hit && current < pace;
    const color = hit ? "#34d399" : behind ? "#fbbf24" : "#818cf8";
    const pacePct = has && pace !== undefined ? Math.min(100, (pace / target) * 100) : null;
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/85 min-w-0 truncate">{icon}{label}</span>
                <span className="text-[12px] tabular-nums text-blue-200/70 shrink-0">
                    <span className="text-white font-bold">{fmt(current)}</span>
                    {has && <span className="text-blue-200/40"> / {fmt(target)}</span>}
                    {has && <span className={`ml-2 font-bold ${hit ? "text-emerald-300" : behind ? "text-amber-300" : "text-indigo-300"}`}>{pct}%</span>}
                </span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                {pacePct !== null && pacePct < 100 && (
                    <div className="absolute inset-y-0 w-0.5 bg-white/50" style={{ left: `${pacePct}%` }} title="Onde deveria estar até hoje" />
                )}
            </div>
            {behind && pace !== undefined && (
                <p className="mt-1 text-[10.5px] text-amber-300/90">Faltam {fmt(Math.ceil(pace - current))} pro ritmo de hoje</p>
            )}
        </div>
    );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
    return (
        <div className="flex items-baseline justify-between mb-3 gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/50">{children}</p>
            {sub && <p className="text-[10.5px] text-blue-200/40 capitalize truncate">{sub}</p>}
        </div>
    );
}

export function buildDayLine(p: Progress): string {
    const r = p.real;
    const t = p.targets?.day;
    const of = (n: number, goal?: number) => `${Math.round(n)}${goal && goal > 0 ? ` de ${goal}` : ""}`;
    const lines = [
        `Linha do dia, ${p.todayLabel}`,
        `Ligações: ${of(r.calls.d, t?.calls)}`,
        `Decisores: ${of(r.decisors.d, t?.decisors)}`,
        `Reuniões marcadas: ${of(r.meetings.d, t?.meetings)}`,
        `Reuniões feitas: ${of(r.meetings_done.d, t?.meetingsDone)}`,
        `Propostas: ${Math.round(r.proposals.d)}`,
        `Fechamentos: ${Math.round(r.contracts.d)}`,
    ];
    if (p.modules.disparos) {
        lines.push(`Disparo: ${Math.round(r.dispatched.d)} enviados, ${Math.round(r.replies.d)} respostas, ${Math.round(r.replies_pending.d)} esperando resposta`);
    }
    return lines.join("\n");
}

export function GoalsCard({ progress: p }: { progress: Progress }) {
    const [copied, setCopied] = useState(false);
    const r = p.real;
    const t = p.targets;
    const pace = (target: number) => (target * p.weekDaysElapsed) / 5;
    const show = (target: number, current: number) => target > 0 || current > 0;
    const todayIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    async function copyLine() {
        const text = buildDayLine(p);
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        setCopied(true);
        toast.success("Linha do dia copiada. É só colar no WhatsApp.");
        setTimeout(() => setCopied(false), 2000);
    }

    const day = t?.day ?? { calls: 0, decisors: 0, meetings: 0, meetingsDone: 0 };
    const week = t?.week ?? { calls: 0, meetings: 0, meetingsDone: 0, proposals: 0, contracts: 0 };
    const month = t?.month ?? { revenue: 0, calls: 0, meetings: 0 };
    const dayTarget = (n: number) => (p.isWeekday ? n : 0);

    const nextMilestone = p.plan?.milestones.find((m) => m.due >= todayIso) ?? null;
    const pending = Math.round(r.replies_pending.d);

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10 h-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
                        <Target className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">{p.isAdmin ? "Metas do time" : "Minhas metas"}</h2>
                        <p className="text-[11px] text-blue-200/50">Execução do dia e da semana, e os marcos</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copyLine}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-white transition"
                    >
                        {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                        Copiar linha do dia
                    </button>
                    {p.isAdmin && (
                        <Link href="/settings/metas" className="text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold px-1">Editar</Link>
                    )}
                </div>
            </div>

            {!t && p.isAdmin && (
                <div className="mb-5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-[12px] text-indigo-100">
                    Ainda não tem meta cadastrada. Defina em <Link href="/settings/metas" className="font-semibold underline">Configurações, Metas</Link>.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* HOJE */}
                <div>
                    <SectionTitle sub={p.todayLabel}>Hoje</SectionTitle>
                    {!p.isWeekday && <p className="mb-3 text-[11px] text-blue-200/50">Fim de semana: sem meta do dia.</p>}
                    <div className="space-y-4">
                        {show(dayTarget(day.calls), r.calls.d) && <Bar icon={<Phone size={13} />} label="Ligações" current={r.calls.d} target={dayTarget(day.calls)} />}
                        {show(dayTarget(day.decisors), r.decisors.d) && <Bar icon={<UserCheck size={13} />} label="Conversas com decisor" current={r.decisors.d} target={dayTarget(day.decisors)} />}
                        {show(dayTarget(day.meetings), r.meetings.d) && <Bar icon={<CalendarPlus size={13} />} label="Reuniões marcadas" current={r.meetings.d} target={dayTarget(day.meetings)} />}
                        {show(dayTarget(day.meetingsDone), r.meetings_done.d) && <Bar icon={<CalendarCheck size={13} />} label="Reuniões feitas" current={r.meetings_done.d} target={dayTarget(day.meetingsDone)} />}
                        {!show(dayTarget(day.calls), r.calls.d) && !show(dayTarget(day.decisors), r.decisors.d) && !show(dayTarget(day.meetings), r.meetings.d) && !show(dayTarget(day.meetingsDone), r.meetings_done.d) && (
                            <p className="text-[12px] text-blue-200/40">Nada registrado hoje ainda.</p>
                        )}
                    </div>

                    {p.modules.disparos && (
                        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                            <div className="flex items-center justify-between text-[12px]">
                                <span className="inline-flex items-center gap-1.5 text-white/80"><Send size={12} /> Disparos de hoje</span>
                                <span className="tabular-nums text-white font-bold">{plain(r.dispatched.d)}{p.dispatchCap > 0 && <span className="text-blue-200/40 font-normal"> / {p.dispatchCap}</span>}</span>
                            </div>
                            <div className="flex items-center justify-between text-[12px]">
                                <span className="inline-flex items-center gap-1.5 text-white/80"><MessageCircleReply size={12} /> Responderam hoje</span>
                                <span className="tabular-nums text-white font-bold">{plain(r.replies.d)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[12px]">
                                <span className={`inline-flex items-center gap-1.5 ${pending > 0 ? "text-amber-300" : "text-white/80"}`}><Clock size={12} /> Esperando sua resposta</span>
                                <span className={`tabular-nums font-bold ${pending > 0 ? "text-amber-300" : "text-emerald-300"}`}>{pending}</span>
                            </div>
                            <p className="text-[10.5px] text-blue-200/40">Meta: responder todo mundo no mesmo dia. Conta quem respondeu nos últimos 7 dias e ainda não teve resposta nossa.</p>
                        </div>
                    )}
                </div>

                {/* SEMANA */}
                <div>
                    <SectionTitle sub={p.weekLabel}>Semana</SectionTitle>
                    <div className="space-y-4">
                        {show(week.calls, r.calls.w) && <Bar icon={<Phone size={13} />} label="Ligações" current={r.calls.w} target={week.calls} pace={pace(week.calls)} />}
                        {show(week.meetings, r.meetings.w) && <Bar icon={<CalendarPlus size={13} />} label="Reuniões marcadas" current={r.meetings.w} target={week.meetings} pace={pace(week.meetings)} />}
                        {show(week.meetingsDone, r.meetings_done.w) && <Bar icon={<CalendarCheck size={13} />} label="Reuniões feitas" current={r.meetings_done.w} target={week.meetingsDone} pace={pace(week.meetingsDone)} />}
                        {show(week.proposals, r.proposals.w) && <Bar icon={<FileText size={13} />} label="Propostas enviadas" current={r.proposals.w} target={week.proposals} pace={pace(week.proposals)} />}
                        {show(week.contracts, r.contracts.w) && <Bar icon={<Handshake size={13} />} label="Contratos" current={r.contracts.w} target={week.contracts} pace={pace(week.contracts)} />}
                        {!show(week.calls, r.calls.w) && !show(week.meetings, r.meetings.w) && !show(week.meetingsDone, r.meetings_done.w) && !show(week.proposals, r.proposals.w) && !show(week.contracts, r.contracts.w) && (
                            <p className="text-[12px] text-blue-200/40">Nada registrado na semana ainda.</p>
                        )}
                    </div>
                    <p className="mt-3 text-[10.5px] text-blue-200/40">O risco branco na barra é onde a semana deveria estar no fim de hoje (conta segunda a sexta).</p>
                </div>

                {/* MARCOS + MES */}
                <div>
                    <SectionTitle sub={p.label}>Marcos</SectionTitle>
                    {p.plan && p.plan.milestones.length > 0 && p.planProgress ? (
                        <div className="space-y-3">
                            {p.plan.milestones.map((m) => {
                                const contracts = p.planProgress!.contracts;
                                const revenueNow = p.plan!.baseRevenue + p.planProgress!.revenue;
                                const isNext = nextMilestone?.due === m.due;
                                const past = m.due < todayIso;
                                const hitC = m.contracts > 0 && contracts >= m.contracts;
                                const hitR = m.revenue > 0 && revenueNow >= m.revenue;
                                const pctC = m.contracts > 0 ? Math.min(100, Math.round((contracts / m.contracts) * 100)) : 0;
                                return (
                                    <div key={m.due} className={`rounded-xl border p-3 ${isNext ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white">
                                                <Flag size={12} className={isNext ? "text-indigo-300" : "text-blue-200/50"} /> Até {shortDate(m.due)}
                                            </span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${past ? (hitC ? "text-emerald-300" : "text-rose-300") : isNext ? "text-indigo-300" : "text-blue-200/40"}`}>
                                                {past ? (hitC ? "Batido" : "Passou") : isNext ? "Próximo" : ""}
                                            </span>
                                        </div>
                                        {m.contracts > 0 && (
                                            <>
                                                <div className="flex items-center justify-between text-[11.5px] mb-1">
                                                    <span className="text-white/75">Contratos novos</span>
                                                    <span className="tabular-nums"><span className="text-white font-bold">{contracts}</span><span className="text-blue-200/40"> / {m.contracts}</span></span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-2">
                                                    <div className="h-full rounded-full" style={{ width: `${pctC}%`, backgroundColor: hitC ? "#34d399" : "#818cf8" }} />
                                                </div>
                                            </>
                                        )}
                                        {m.revenue > 0 && (
                                            <div className="flex items-center justify-between text-[11.5px]">
                                                <span className="text-white/75">Faturamento por mês</span>
                                                <span className="tabular-nums"><span className={`font-bold ${hitR ? "text-emerald-300" : "text-white"}`}>{money(revenueNow)}</span><span className="text-blue-200/40"> / {money(m.revenue)}</span></span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <p className="text-[10.5px] text-blue-200/40">
                                Desde {shortDate(p.plan.startDate)}. Faturamento = {money(p.plan.baseRevenue)} de partida + valor das deals ganhas.
                            </p>
                        </div>
                    ) : (
                        <p className="text-[12px] text-blue-200/40">
                            Sem marcos cadastrados.{p.isAdmin && <> <Link href="/settings/metas" className="text-indigo-300 font-semibold">Cadastrar</Link></>}
                        </p>
                    )}

                    <div className="mt-5 space-y-4">
                        <Bar icon={<DollarSign size={13} />} label="Vendido no mês" current={r.revenue.m} target={month.revenue} fmt={money} />
                        {month.calls > 0 && <Bar icon={<Phone size={13} />} label="Ligações no mês" current={r.calls.m} target={month.calls} />}
                        {month.meetings > 0 && <Bar icon={<CalendarPlus size={13} />} label="Reuniões no mês" current={r.meetings.m} target={month.meetings} />}
                    </div>
                </div>
            </div>

            {p.isAdmin && p.perUser.length > 1 && (
                <div className="mt-6 pt-4 border-t border-white/10 overflow-x-auto">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/40 mb-2.5">Por vendedor</p>
                    <table className="w-full text-[12px] tabular-nums">
                        <thead>
                            <tr className="text-blue-200/45 text-left">
                                <th className="font-semibold py-1 pr-3">Nome</th>
                                <th className="font-semibold py-1 px-2 text-right">Ligações hoje</th>
                                <th className="font-semibold py-1 px-2 text-right">Ligações semana</th>
                                <th className="font-semibold py-1 px-2 text-right">Reuniões semana</th>
                                <th className="font-semibold py-1 px-2 text-right">Propostas</th>
                                <th className="font-semibold py-1 pl-2 text-right">Contratos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {p.perUser.map((u) => (
                                <tr key={u.userId} className="border-t border-white/[0.06] text-white/85">
                                    <td className="py-1.5 pr-3 truncate max-w-[160px]">{u.name}</td>
                                    <td className="py-1.5 px-2 text-right">{plain(u.real.calls.d)}</td>
                                    <td className="py-1.5 px-2 text-right">{plain(u.real.calls.w)}</td>
                                    <td className="py-1.5 px-2 text-right">{plain(u.real.meetings.w)}</td>
                                    <td className="py-1.5 px-2 text-right">{plain(u.real.proposals.w)}</td>
                                    <td className="py-1.5 pl-2 text-right">{plain(u.real.contracts.w)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
