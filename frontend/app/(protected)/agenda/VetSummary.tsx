"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Syringe, Cake, PawPrint, DollarSign } from "lucide-react";
import { getVetDashboard } from "./actions";

function brl(v: number) {
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function VetSummary() {
    const [m, setM] = useState<any>(null);

    useEffect(() => {
        getVetDashboard().then((r) => { if (r.enabled && r.metrics) setM(r.metrics); });
    }, []);

    if (!m) return null;

    const stats = [
        { icon: CalendarCheck, label: "Atendimentos hoje", value: m.atendimentosHoje, tint: "text-teal-600", href: "/agenda" },
        { icon: Syringe, label: "Vacinas vencendo", value: m.vacinasVencendo, tint: "text-amber-600", href: "/pets" },
        { icon: Cake, label: "Aniversariantes do mês", value: m.aniversariantes, tint: "text-pink-600", href: "/pets" },
        { icon: PawPrint, label: "Pets cadastrados", value: m.totalPets, tint: "text-sky-600", href: "/pets" },
        { icon: DollarSign, label: "Faturamento do mês", value: brl(m.faturamentoMes), tint: "text-emerald-600", href: "/agenda" },
    ];

    return (
        <div className="mb-5 grid grid-cols-2 divide-slate-200 rounded-2xl border border-slate-200 bg-white sm:grid-cols-5 sm:divide-x">
            {stats.map((s) => (
                <Link
                    key={s.label}
                    href={s.href}
                    className="flex items-center gap-3 px-4 py-4 border-t border-slate-200 first:border-t-0 sm:border-t-0 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 ${s.tint}`}>
                        <s.icon size={16} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-lg font-extrabold leading-none text-slate-800">{s.value}</div>
                        <div className="mt-1 text-[12px] text-slate-500 truncate">{s.label}</div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
