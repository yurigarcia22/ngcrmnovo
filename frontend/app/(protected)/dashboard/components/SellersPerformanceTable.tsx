"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { User, Clock, Mail, Inbox, TrendingUp, AlertTriangle, CheckSquare } from "lucide-react";

interface Seller {
    id: string;
    name: string;
    avatar: string | null;
    openDeals: number;
    pipelineValue: number;
    wonCount: number;
    wonValue: number;
    conversionRate: number;
    pendingTasks: number;
    overdueTasks: number;
    sentMessages: number;
    receivedMessages: number;
    uniqueContactsReached: number;
    avgResponseSeconds: number;
}

function formatCurrencyCompact(v: number): string {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 10_000) return `R$ ${(v / 1000).toFixed(0)}k`;
    if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1)}k`;
    if (v === 0) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(sec: number): string {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}min`;
    if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
    return `${(sec / 86400).toFixed(1)}d`;
}

export function SellersPerformanceTable({ sellers }: { sellers: Seller[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentUserId = searchParams.get("userId");

    function filterBySeller(id: string) {
        const sp = new URLSearchParams(searchParams.toString());
        if (currentUserId === id) {
            sp.delete("userId");
        } else {
            sp.set("userId", id);
        }
        router.push(`/dashboard?${sp.toString()}`);
    }

    if (sellers.length === 0) {
        return (
            <div className="bg-white/[0.04] rounded-2xl p-6 border border-white/10 text-center text-sm text-gray-400">
                Nenhum vendedor ativo no tenant.
            </div>
        );
    }

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-bold text-white">Performance por vendedor</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Clique numa linha para filtrar o dashboard
                    </p>
                </div>
                {currentUserId && currentUserId !== "all" && (
                    <button
                        onClick={() => {
                            const sp = new URLSearchParams(searchParams.toString());
                            sp.delete("userId");
                            router.push(`/dashboard?${sp.toString()}`);
                        }}
                        className="text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold"
                    >
                        Limpar filtro
                    </button>
                )}
            </div>

            <div className="overflow-x-auto custom-scrollbar -mx-2">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
                            <th className="text-left font-semibold px-2 py-2">Vendedor</th>
                            <th className="text-right font-semibold px-2 py-2" title="Deals abertos">
                                <Inbox size={11} className="inline" /> Aberto
                            </th>
                            <th className="text-right font-semibold px-2 py-2">Pipeline</th>
                            <th className="text-right font-semibold px-2 py-2 text-emerald-400">Ganho</th>
                            <th className="text-right font-semibold px-2 py-2" title="% won/(won+lost)">
                                <TrendingUp size={11} className="inline" /> Conv.
                            </th>
                            <th className="text-right font-semibold px-2 py-2" title="Tarefas pendentes">
                                <CheckSquare size={11} className="inline" /> Tasks
                            </th>
                            <th className="text-right font-semibold px-2 py-2" title="Tarefas atrasadas">
                                <AlertTriangle size={11} className="inline" /> Atr.
                            </th>
                            <th className="text-right font-semibold px-2 py-2" title="Tempo medio ate primeira resposta">
                                <Clock size={11} className="inline" /> Resp.
                            </th>
                            <th className="text-right font-semibold px-2 py-2" title="Mensagens enviadas">
                                <Mail size={11} className="inline" /> Enviadas
                            </th>
                            <th className="text-right font-semibold px-2 py-2" title="Leads únicos contatados">
                                Leads únicos
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sellers.map((s) => {
                            const isActive = currentUserId === s.id;
                            return (
                                <tr
                                    key={s.id}
                                    onClick={() => filterBySeller(s.id)}
                                    className={`border-b border-white/5 cursor-pointer transition-colors ${
                                        isActive ? "bg-indigo-500/10" : "hover:bg-white/[0.03]"
                                    }`}
                                >
                                    <td className="px-2 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-indigo-500/20 overflow-hidden flex items-center justify-center shrink-0">
                                                {s.avatar ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User size={12} className="text-indigo-200" />
                                                )}
                                            </div>
                                            <span className="font-semibold text-white truncate max-w-[140px]">
                                                {s.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="text-right px-2 py-3 text-gray-300 tabular-nums">{s.openDeals}</td>
                                    <td className="text-right px-2 py-3 text-gray-300 tabular-nums">{formatCurrencyCompact(s.pipelineValue)}</td>
                                    <td className="text-right px-2 py-3 text-emerald-300 font-semibold tabular-nums">
                                        {formatCurrencyCompact(s.wonValue)}
                                        {s.wonCount > 0 && <span className="text-[9px] text-emerald-500/70 ml-1">({s.wonCount})</span>}
                                    </td>
                                    <td className="text-right px-2 py-3 text-gray-300 tabular-nums">
                                        <span className={s.conversionRate >= 60 ? "text-emerald-400 font-bold" : s.conversionRate >= 30 ? "text-amber-400" : "text-gray-400"}>
                                            {s.conversionRate}%
                                        </span>
                                    </td>
                                    <td className="text-right px-2 py-3 text-gray-300 tabular-nums">{s.pendingTasks}</td>
                                    <td className="text-right px-2 py-3 tabular-nums">
                                        <span className={s.overdueTasks > 0 ? "text-rose-400 font-bold" : "text-gray-500"}>
                                            {s.overdueTasks}
                                        </span>
                                    </td>
                                    <td className="text-right px-2 py-3 text-gray-300 tabular-nums">
                                        {formatDuration(s.avgResponseSeconds)}
                                    </td>
                                    <td className="text-right px-2 py-3 text-gray-300 tabular-nums">{s.sentMessages}</td>
                                    <td className="text-right px-2 py-3 text-blue-300 font-semibold tabular-nums">
                                        {s.uniqueContactsReached}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
