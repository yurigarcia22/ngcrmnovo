"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function ChartWrapper({ data }: { data: any[] }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Sem dados para exibir no gráfico.
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                    dataKey="name"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" barSize={40}>
                    {/* Can add multiple colors if needed using Cell */}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
