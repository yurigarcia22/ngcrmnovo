"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";

const data = [
    { name: "Group A", value: 400 },
    { name: "Group B", value: 300 },
    { name: "Group C", value: 300 },
    { name: "Group D", value: 200 },
];
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export function SourcesRadialChart() {
    // Placeholder logic: if no data, show warning like screenshot
    const hasData = false;

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-white h-full hover:border-cyan-500/50 transition-all flex flex-col">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">FONTES DE LEAD</h3>

            {/* If no data */}
            {!hasData && (
                <div className="flex items-center gap-2 text-yellow-400 text-xs font-medium mb-4">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Dados Insuficientes para exibir</span>
                </div>
            )}

            <div className="flex-1 min-h-[200px] flex items-center justify-center relative opacity-50">
                {/* Decorative Radial Rings (Visual Hack to match print) */}
                <div className="absolute w-40 h-40 rounded-full border-[10px] border-[#1e293b] border-t-cyan-500/30 transform -rotate-45"></div>
                <div className="absolute w-32 h-32 rounded-full border-[10px] border-[#1e293b] border-r-blue-500/30 transform rotate-12"></div>
                <div className="absolute w-24 h-24 rounded-full border-[10px] border-[#1e293b] border-b-green-500/30 transform -rotate-12"></div>
            </div>
        </div>
    )
}
