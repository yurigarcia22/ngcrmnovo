import Link from "next/link";
import { Radio } from "lucide-react";

type ChannelRow = { name: string; color: string; count: number; wonValue: number };

function formatCompact(v: number): string {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1)}k`;
    return `R$ ${v.toFixed(0)}`;
}

export function AcquisitionChannelsCard({ data }: { data: ChannelRow[] }) {
    const rows = data ?? [];
    const total = rows.reduce((s, r) => s + r.count, 0);

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10 h-full">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center shrink-0">
                    <Radio className="w-4 h-4" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-white tracking-wide">Aquisição por canal</h2>
                    <p className="text-[11px] text-blue-200/50">De onde os negócios vieram</p>
                </div>
            </div>

            {total === 0 ? (
                <div className="py-8 text-center">
                    <p className="text-sm text-blue-200/50">Nenhum negócio com canal no período.</p>
                    <Link href="/settings/acquisition-channels" className="text-xs text-indigo-300 hover:text-indigo-200 font-semibold mt-1 inline-block">
                        Configurar canais
                    </Link>
                </div>
            ) : (
                <div className="space-y-3.5">
                    {rows.map((r, i) => {
                        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        return (
                            <div key={i}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-white/90">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                        {r.name}
                                    </span>
                                    <span className="text-[12px] text-blue-200/60 tabular-nums">
                                        {r.count} {r.count === 1 ? "negócio" : "negócios"}
                                        {r.wonValue > 0 && <span className="text-emerald-300/80 ml-2">{formatCompact(r.wonValue)}</span>}
                                    </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{ width: `${pct}%`, backgroundColor: r.color }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
