"use client";

import { cn } from "@/lib/utils";
import { Divide } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    className?: string;
    children?: React.ReactNode;
}

export function StatCard({ title, value, subtitle, className, children }: StatCardProps) {
    return (
        <div className={cn("bg-[#0f172a]/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-white flex flex-col justify-between hover:border-cyan-500/50 transition-all", className)}>
            <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">{title}</h3>
                {children ? children : (
                    <div className="mt-4">
                        <div className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">{value}</div>
                        {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

export function MessagesCard() {
    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-white h-full hover:border-cyan-500/50 transition-all">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">MENSAGENS RECEBIDAS</h3>

            <div className="flex items-end justify-end mb-6">
                <div className="text-right">
                    <div className="text-5xl font-bold text-[#10b981]">0</div>
                    <p className="text-xs text-gray-500">esta semana</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                        <span className="text-sm text-gray-300">WhatsApp Cloud API</span>
                    </div>
                    <span className="text-[#10b981] font-mono">0</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[cyan]"></div>
                        <span className="text-sm text-gray-300">Bate-papo online</span>
                    </div>
                    <span className="text-[cyan] font-mono">0</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                    <span className="text-sm text-gray-300 pl-4">Outros</span>
                    <span className="text-gray-500 font-mono">0</span>
                </div>
            </div>
        </div>
    )
}
