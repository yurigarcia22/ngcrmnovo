"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Stethoscope, CalendarCheck, Syringe, Cake, PawPrint, DollarSign,
    Clock, ChevronRight, User,
} from "lucide-react";
import { getVetDashboard, getAppointmentsByDay } from "@/app/(protected)/agenda/actions";

function brl(v: number) {
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function todayStr() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
const timeOf = (iso: string) => (iso ? iso.slice(11, 16) : "");
const STATUS_CLS: Record<string, string> = {
    agendado: "bg-blue-50 text-blue-600",
    confirmado: "bg-teal-50 text-teal-600",
    atendido: "bg-emerald-50 text-emerald-600",
    faltou: "bg-red-50 text-red-600",
    cancelado: "bg-gray-100 text-gray-500",
};

export default function VetDashboardSection() {
    const [m, setM] = useState<any>(null);
    const [appts, setAppts] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        getVetDashboard().then((r) => { if (r.enabled && r.metrics) setM(r.metrics); });
        getAppointmentsByDay(todayStr()).then((r) => { setAppts(r.appointments ?? []); setLoaded(true); });
    }, []);

    if (!m) return null;

    const cards = [
        { icon: CalendarCheck, label: "Atendimentos hoje", value: m.atendimentosHoje, cls: "text-indigo-600 bg-indigo-50", href: "/agenda" },
        { icon: Syringe, label: "Vacinas vencendo", value: m.vacinasVencendo, cls: "text-amber-600 bg-amber-50", href: "/pets" },
        { icon: Cake, label: "Aniversariantes do mês", value: m.aniversariantes, cls: "text-pink-600 bg-pink-50", href: "/pets" },
        { icon: PawPrint, label: "Pets cadastrados", value: m.totalPets, cls: "text-teal-600 bg-teal-50", href: "/pets" },
        { icon: DollarSign, label: "Faturamento do mês", value: brl(m.faturamentoMes), cls: "text-emerald-600 bg-emerald-50", href: "/agenda" },
    ];

    return (
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Stethoscope className="text-indigo-600" size={18} /> Resumo da Clínica
                </h2>
                <Link href="/agenda" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
                    Abrir agenda <ChevronRight size={13} />
                </Link>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {cards.map((c) => (
                    <Link key={c.label} href={c.href} className="border border-gray-100 rounded-xl p-3 hover:shadow-sm hover:border-indigo-200 transition-all">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${c.cls}`}><c.icon size={16} /></div>
                        <div className="text-lg font-bold text-gray-800 leading-tight">{c.value}</div>
                        <div className="text-[11px] text-gray-500">{c.label}</div>
                    </Link>
                ))}
            </div>

            {/* Atendimentos de hoje */}
            <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                    <Clock size={12} /> Atendimentos de hoje
                </div>
                {!loaded ? (
                    <div className="text-xs text-gray-400 py-2">Carregando...</div>
                ) : appts.length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-2">Nenhum atendimento agendado para hoje.</div>
                ) : (
                    <div className="space-y-1.5">
                        {appts.slice(0, 6).map((a) => (
                            <Link key={a.id} href="/agenda" className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50">
                                <span className="text-sm font-bold text-gray-700 w-12 shrink-0">{timeOf(a.starts_at)}</span>
                                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <PawPrint size={13} className="text-indigo-400 shrink-0" />
                                    <span className="text-sm text-gray-800 truncate">{a.pet?.name ?? "Sem pet"}</span>
                                    {a.service_name && <span className="text-[11px] text-gray-400 truncate">· {a.service_name}</span>}
                                </span>
                                <span className="text-[11px] text-gray-500 hidden sm:flex items-center gap-1 truncate max-w-[120px]"><User size={11} /> {a.contact?.name ?? "—"}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_CLS[a.status] ?? STATUS_CLS.agendado}`}>{a.status}</span>
                            </Link>
                        ))}
                        {appts.length > 6 && (
                            <Link href="/agenda" className="block text-center text-xs text-indigo-600 font-semibold hover:underline pt-1">
                                ver todos os {appts.length} atendimentos
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
