"use client";

import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

interface Props {
    icon: LucideIcon;
    label: string;
    value: string;
    sub?: string;
    /** Variacao percentual vs periodo anterior. Positivo=verde, negativo=vermelho */
    changePct?: number | null;
    /** Texto auxiliar do change (ex: "vs período anterior") */
    changeLabel?: string;
    accent?: "indigo" | "emerald" | "rose" | "amber" | "blue" | "purple";
}

const accentColors = {
    indigo: { ring: "ring-indigo-500/30", bg: "bg-indigo-500/10", icon: "text-indigo-300" },
    emerald: { ring: "ring-emerald-500/30", bg: "bg-emerald-500/10", icon: "text-emerald-300" },
    rose: { ring: "ring-rose-500/30", bg: "bg-rose-500/10", icon: "text-rose-300" },
    amber: { ring: "ring-amber-500/30", bg: "bg-amber-500/10", icon: "text-amber-300" },
    blue: { ring: "ring-blue-500/30", bg: "bg-blue-500/10", icon: "text-blue-300" },
    purple: { ring: "ring-purple-500/30", bg: "bg-purple-500/10", icon: "text-purple-300" },
} as const;

export function KpiCard({ icon: Icon, label, value, sub, changePct, changeLabel, accent = "indigo" }: Props) {
    const c = accentColors[accent];
    const hasChange = typeof changePct === "number";
    const isPositive = hasChange && changePct! > 0;
    const isNegative = hasChange && changePct! < 0;

    return (
        <div className={`bg-white/[0.04] backdrop-blur-sm rounded-2xl p-5 border border-white/10 ring-1 ${c.ring} hover:bg-white/[0.06] transition-all`}>
            <div className="flex items-start justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {label}
                </div>
                <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${c.icon}`} />
                </div>
            </div>

            <div className="text-2xl font-bold text-white mb-1">{value}</div>

            <div className="flex items-center gap-2 mt-2">
                {sub && (
                    <span className="text-xs text-gray-400">{sub}</span>
                )}
                {hasChange && (
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isPositive ? "bg-emerald-500/15 text-emerald-300"
                        : isNegative ? "bg-rose-500/15 text-rose-300"
                        : "bg-gray-500/15 text-gray-300"
                    }`}>
                        {isPositive && <TrendingUp className="w-2.5 h-2.5" />}
                        {isNegative && <TrendingDown className="w-2.5 h-2.5" />}
                        {!isPositive && !isNegative && <Minus className="w-2.5 h-2.5" />}
                        {Math.abs(changePct!)}%
                        {changeLabel && <span className="opacity-70 font-normal">{changeLabel}</span>}
                    </span>
                )}
            </div>
        </div>
    );
}
