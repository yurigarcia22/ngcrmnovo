"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, MessageCircle, MessageSquare } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    className?: string;
    children?: React.ReactNode;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
}

export function StatCard({ title, value, subtitle, className, children, trend, trendValue }: StatCardProps) {
    return (
        <div className={cn(
            "relative overflow-hidden rounded-2xl p-6 transition-all duration-300 group",
            "bg-[#0f172a]/60 backdrop-blur-xl border border-white/5",
            "hover:border-white/10 hover:bg-[#0f172a]/80 hover:shadow-2xl hover:shadow-cyan-500/10",
            className
        )}>
            {/* Gradient Glow Effect */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-cyan-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xs font-bold text-gray-400 tracking-widest uppercase">{title}</h3>
                    {trend && (
                        <div className={cn(
                            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border",
                            trend === "up" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" :
                                trend === "down" ? "text-rose-400 border-rose-500/20 bg-rose-500/10" :
                                    "text-gray-400 border-gray-500/20 bg-gray-500/10"
                        )}>
                            {trend === "up" && <ArrowUpRight className="w-3 h-3" />}
                            {trend === "down" && <ArrowDownRight className="w-3 h-3" />}
                            {trendValue}
                        </div>
                    )}
                </div>

                {children ? children : (
                    <div className="mt-2">
                        <div className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-none">
                            {value}
                        </div>
                        {subtitle && <p className="text-xs text-gray-500 mt-2 font-medium">{subtitle}</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

export function MessagesCard({ conversationsCount = 0, unansweredCount = 0 }: { conversationsCount?: number, unansweredCount?: number }) {
    return (
        <div className="relative overflow-hidden rounded-2xl p-6 h-full transition-all duration-300 bg-[#0f172a]/60 backdrop-blur-xl border border-white/5 hover:border-white/10 hover:bg-[#0f172a]/80 group">
            {/* Gradient Glow */}
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 rounded-full bg-emerald-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <h3 className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-6">MENSAGENS</h3>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-emerald-500/30 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                            <MessageCircle className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-gray-400 font-medium uppercase">Ativas</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{conversationsCount}</div>
                </div>

                <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-orange-500/30 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                            <MessageSquare className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-gray-400 font-medium uppercase">Aguardando</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{unansweredCount}</div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Tempo médio de resposta</span>
                    <span className="text-white font-mono font-medium">-- min</span>
                </div>
            </div>
        </div>
    )
}
