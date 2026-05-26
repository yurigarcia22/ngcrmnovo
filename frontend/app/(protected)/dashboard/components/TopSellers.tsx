"use client";

import { Trophy } from "lucide-react";

interface Seller {
    name: string;
    count: number;
    value: number;
}

function formatCurrency(v: number): string {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TopSellers({ sellers }: { sellers: Seller[] }) {
    if (!sellers || sellers.length === 0) {
        return null;
    }

    const max = Math.max(...sellers.map((s) => s.value), 1);

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10 h-full">
            <div className="flex items-center gap-2 mb-5">
                <Trophy className="w-4 h-4 text-amber-300" />
                <h3 className="text-base font-bold text-white">Top vendedores</h3>
            </div>

            <div className="space-y-3">
                {sellers.map((s, i) => {
                    const widthPct = (s.value / max) * 100;
                    return (
                        <div key={s.name + i}>
                            <div className="flex items-center justify-between text-xs mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                        i === 0 ? "bg-amber-500 text-amber-950"
                                        : i === 1 ? "bg-gray-300 text-gray-800"
                                        : i === 2 ? "bg-orange-700 text-orange-100"
                                        : "bg-white/10 text-gray-400"
                                    }`}>
                                        {i + 1}
                                    </span>
                                    <span className="font-semibold text-gray-200 truncate">{s.name}</span>
                                </div>
                                <span className="text-emerald-300 font-bold tabular-nums shrink-0 ml-2">
                                    {formatCurrency(s.value)}
                                </span>
                            </div>
                            <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden ml-7">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full"
                                    style={{ width: `${widthPct}%` }}
                                />
                            </div>
                            <div className="text-[10px] text-gray-500 ml-7 mt-0.5">
                                {s.count} {s.count === 1 ? "deal" : "deals"}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
