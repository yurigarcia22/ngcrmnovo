"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    CalendarPlus, Clock, PawPrint, Syringe, Cake, Stethoscope, Phone,
    ArrowRight, CircleDollarSign, CalendarDays, MessageCircle,
} from "lucide-react";
import { getVetHomeData } from "@/app/(protected)/agenda/actions";

/* ---------- helpers ---------- */
function brl(v: number) {
    return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const timeOf = (iso: string) => (iso ? iso.slice(11, 16) : "");
function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
}
function longDate() {
    return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function dueLabel(due: string | null) {
    if (!due) return null;
    const d = new Date(`${due}T12:00:00`);
    if (isNaN(d.getTime())) return null;
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (days < 0) return { t: "vencida", tone: "rose" as const };
    if (days === 0) return { t: "vence hoje", tone: "amber" as const };
    if (days <= 30) return { t: `${days}d`, tone: "amber" as const };
    return { t: "em dia", tone: "teal" as const };
}
const STATUS: Record<string, { t: string; dot: string; text: string }> = {
    agendado: { t: "Agendado", dot: "bg-sky-400", text: "text-sky-700" },
    confirmado: { t: "Confirmado", dot: "bg-teal-400", text: "text-teal-700" },
    atendido: { t: "Atendido", dot: "bg-emerald-500", text: "text-emerald-700" },
    faltou: { t: "Faltou", dot: "bg-rose-400", text: "text-rose-700" },
    cancelado: { t: "Cancelado", dot: "bg-slate-300", text: "text-slate-500" },
};

/* ---------- page ---------- */
export default function VetDashboard() {
    const [d, setD] = useState<any>(null);

    useEffect(() => {
        getVetHomeData().then((r) => setD(r?.success ? r : { empty: true }));
    }, []);

    const m = d?.metrics;
    const wa = d?.whatsapp;
    const appts: any[] = d?.todayAppointments ?? [];
    const vacc: any[] = d?.vaccinesDue ?? [];
    const bdays: any[] = d?.birthdays ?? [];

    return (
        <div className="mx-auto max-w-6xl px-5 py-7 md:px-8 md:py-9">
            {/* Saudacao */}
            <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <div>
                    <p className="text-[13px] font-medium text-teal-700/80 flex items-center gap-1.5">
                        <Stethoscope size={15} /> {d?.clinicName ?? "Clínica"}
                    </p>
                    <h1 className="mt-1 text-[28px] md:text-[34px] font-extrabold tracking-tight text-slate-800 text-balance">
                        {greeting()}!
                    </h1>
                    <p className="text-sm text-slate-500 capitalize">{longDate()}</p>
                </div>
                <Link
                    href="/agenda"
                    className="group inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 transition-all hover:bg-teal-700 hover:shadow-md hover:shadow-teal-600/25 active:scale-[0.98]"
                >
                    <CalendarPlus size={17} />
                    Novo atendimento
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
            </header>

            {/* Faixa de indicadores (um bloco, nao um grid de cards identicos) */}
            <div className="mb-8 grid grid-cols-2 divide-slate-200/70 rounded-2xl border border-slate-200/80 bg-white/80 sm:grid-cols-4 sm:divide-x">
                <Stat icon={<CalendarDays size={16} />} value={m ? m.atendimentosHoje : "·"} label="Atendimentos hoje" tint="text-teal-600" />
                <Stat icon={<Syringe size={16} />} value={m ? m.vacinasVencendo : "·"} label="Vacinas vencendo" tint="text-amber-600" />
                <Stat icon={<PawPrint size={16} />} value={m ? m.totalPets : "·"} label="Pets" tint="text-sky-600" />
                <Stat icon={<CircleDollarSign size={16} />} value={m ? brl(m.faturamentoMes) : "·"} label="Faturamento do mês" tint="text-emerald-600" />
            </div>

            {/* Atendimento WhatsApp hoje */}
            {wa && (
                <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-3.5">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                        <MessageCircle size={15} className="text-emerald-600" /> WhatsApp hoje
                    </span>
                    <span className="text-sm text-slate-600"><b className="font-bold text-slate-800 tabular-nums">{wa.recebidasHoje}</b> recebidas</span>
                    <span className="text-sm text-slate-600"><b className="font-bold text-slate-800 tabular-nums">{wa.enviadasHoje}</b> enviadas</span>
                    <span className="text-sm text-slate-600"><b className="font-bold text-slate-800 tabular-nums">{wa.conversasHoje}</b> {wa.conversasHoje === 1 ? "conversa" : "conversas"}</span>
                    <Link href="/chat" className="ml-auto text-[13px] font-semibold text-teal-700 hover:text-teal-800">abrir conversas</Link>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                {/* Agenda de hoje — o foco real da home */}
                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <Clock size={17} className="text-teal-600" /> Agenda de hoje
                        </h2>
                        <Link href="/agenda" className="text-[13px] font-semibold text-teal-700 hover:text-teal-800">
                            ver agenda
                        </Link>
                    </div>

                    {!d ? (
                        <Skeleton rows={3} />
                    ) : appts.length === 0 ? (
                        <EmptyAgenda />
                    ) : (
                        <ol className="relative space-y-2.5">
                            {appts.map((a, i) => {
                                const st = STATUS[a.status] ?? STATUS.agendado;
                                return (
                                    <li
                                        key={a.id}
                                        className="fade-in-up"
                                        style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                                    >
                                        <Link
                                            href="/agenda"
                                            className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3 transition-colors hover:border-teal-300 hover:bg-teal-50/40"
                                        >
                                            <div className="flex w-12 shrink-0 flex-col items-center">
                                                <span className="text-base font-bold tabular-nums text-slate-800">{timeOf(a.starts_at)}</span>
                                            </div>
                                            <span className="h-9 w-px bg-slate-200/80" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate font-semibold text-slate-800">{a.pet?.name ?? "Sem pet"}</span>
                                                    {a.service_name && (
                                                        <span className="truncate rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">{a.service_name}</span>
                                                    )}
                                                </div>
                                                <span className="truncate text-[13px] text-slate-500">{a.contact?.name ?? "—"}</span>
                                            </div>
                                            <span className={`flex shrink-0 items-center gap-1.5 text-[12px] font-semibold ${st.text}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.t}
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>

                {/* Coluna lateral: vacinas + aniversariantes */}
                <div className="space-y-6">
                    {/* Vacinas a vencer */}
                    <section>
                        <h2 className="mb-3 text-base font-bold text-slate-800 flex items-center gap-2">
                            <Syringe size={16} className="text-amber-500" /> Vacinas a vencer
                        </h2>
                        {!d ? (
                            <Skeleton rows={2} />
                        ) : vacc.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-[13px] text-slate-400">
                                Nenhuma vacina vencendo. 🎉
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {vacc.slice(0, 5).map((v) => {
                                    const dl = dueLabel(v.next_due_at);
                                    const phone = v.pet?.contact?.phone?.replace(/\D/g, "");
                                    const toneCls =
                                        dl?.tone === "rose" ? "bg-rose-50 text-rose-700"
                                            : dl?.tone === "amber" ? "bg-amber-50 text-amber-700"
                                                : "bg-teal-50 text-teal-700";
                                    return (
                                        <li key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate text-sm font-semibold text-slate-800">{v.pet?.name ?? "Pet"}</span>
                                                    {dl && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${toneCls}`}>{dl.t}</span>}
                                                </div>
                                                <span className="truncate text-[12px] text-slate-500">{v.vaccine_name} · {v.pet?.contact?.name ?? "—"}</span>
                                            </div>
                                            {phone && (
                                                <a
                                                    href={`https://wa.me/${phone}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="shrink-0 rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50"
                                                    title="Avisar no WhatsApp"
                                                >
                                                    <Phone size={15} />
                                                </a>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    {/* Aniversariantes do mes */}
                    {bdays.length > 0 && (
                        <section>
                            <h2 className="mb-3 text-base font-bold text-slate-800 flex items-center gap-2">
                                <Cake size={16} className="text-pink-500" /> Aniversariantes do mês
                            </h2>
                            <ul className="space-y-2">
                                {bdays.slice(0, 5).map((p) => (
                                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-500">
                                            <PawPrint size={15} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                                            <span className="truncate text-[12px] text-slate-500">{p.contact?.name ?? "—"}</span>
                                        </div>
                                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-pink-600">
                                            {String(p.birth_date).slice(8, 10)}/{String(p.birth_date).slice(5, 7)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------- subcomponents ---------- */
function Stat({ icon, value, label, tint }: { icon: React.ReactNode; value: any; label: string; tint: string }) {
    return (
        <div className="flex items-center gap-3 px-4 py-4 border-t border-slate-200/70 first:border-t-0 sm:border-t-0">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 ${tint}`}>{icon}</span>
            <div className="min-w-0">
                <div className="text-lg font-extrabold leading-none text-slate-800">{value}</div>
                <div className="mt-1 text-[12px] text-slate-500">{label}</div>
            </div>
        </div>
    );
}

function Skeleton({ rows }: { rows: number }) {
    return (
        <div className="space-y-2.5">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-[58px] rounded-xl border border-slate-200/70 bg-white/60">
                    <div className="skeleton h-full w-full rounded-xl opacity-40" />
                </div>
            ))}
        </div>
    );
}

function EmptyAgenda() {
    return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-500">
                <CalendarDays size={22} />
            </div>
            <p className="font-semibold text-slate-700">Nenhum atendimento hoje</p>
            <p className="mt-0.5 text-[13px] text-slate-500">Que tal agendar o primeiro?</p>
            <Link href="/agenda" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-teal-700">
                <CalendarPlus size={15} /> Agendar
            </Link>
        </div>
    );
}
