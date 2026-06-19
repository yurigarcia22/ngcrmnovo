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

    const cards = [
        { icon: CalendarCheck, label: "Atendimentos hoje", value: m.atendimentosHoje, cls: "text-indigo-600 bg-indigo-50", href: "/agenda" },
        { icon: Syringe, label: "Vacinas vencendo", value: m.vacinasVencendo, cls: "text-amber-600 bg-amber-50", href: "/pets" },
        { icon: Cake, label: "Aniversariantes do mês", value: m.aniversariantes, cls: "text-pink-600 bg-pink-50", href: "/pets" },
        { icon: PawPrint, label: "Pets cadastrados", value: m.totalPets, cls: "text-teal-600 bg-teal-50", href: "/pets" },
        { icon: DollarSign, label: "Faturamento do mês", value: brl(m.faturamentoMes), cls: "text-emerald-600 bg-emerald-50", href: "/agenda" },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {cards.map((c) => (
                <Link key={c.label} href={c.href} className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${c.cls}`}>
                        <c.icon size={16} />
                    </div>
                    <div className="text-lg font-bold text-gray-800 leading-tight">{c.value}</div>
                    <div className="text-[11px] text-gray-500">{c.label}</div>
                </Link>
            ))}
        </div>
    );
}
