"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#6366f1", "#a855f7", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6"];

export function DealsStageChart({ data }: { data: { name: string; value: number }[] }) {
    if (!data || data.length === 0) {
        return (
            <div className="relative overflow-hidden rounded-2xl p-6 h-full min-h-[300px] flex flex-col justify-center items-center bg-[#0f172a]/60 backdrop-blur-xl border border-white/5">
                <p className="text-gray-400 text-sm">Sem dados de pipeline para exibir</p>
            </div>
        )
    }

    return (
        <div className="relative overflow-hidden rounded-2xl p-6 h-full min-h-[300px] bg-[#0f172a]/60 backdrop-blur-xl border border-white/5 hover:border-white/10 transition-all">
            <h3 className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-6">DISTRIBUIÇÃO POR ETAPA</h3>

            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.5} />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={100}
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: 'white', opacity: 0.05 }}
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#f8fafc'
                            }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
