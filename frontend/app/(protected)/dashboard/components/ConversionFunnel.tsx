"use client";

interface FunnelData {
    name: string;
    value: number;
}

interface Props {
    data: FunnelData[];
}

export function ConversionFunnel({ data }: Props) {
    if (!data || data.length === 0) {
        return (
            <div className="bg-white/[0.04] rounded-2xl p-6 border border-white/10 h-full flex items-center justify-center">
                <p className="text-sm text-gray-400">Sem dados de funil ainda.</p>
            </div>
        );
    }

    const max = Math.max(...data.map((d) => d.value), 1);
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10 h-full">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-white">Funil de conversão</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {total} {total === 1 ? "negócio" : "negócios"} em aberto
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                {data.map((stage, i) => {
                    const widthPct = (stage.value / max) * 100;
                    const sharePct = total > 0 ? Math.round((stage.value / total) * 100) : 0;

                    return (
                        <div key={stage.name} className="group">
                            <div className="flex items-center justify-between mb-1 text-xs">
                                <span className="font-semibold text-gray-300">{stage.name}</span>
                                <span className="text-gray-400">
                                    <span className="font-bold text-white">{stage.value}</span>
                                    <span className="opacity-50 ml-1">· {sharePct}%</span>
                                </span>
                            </div>
                            <div className="h-7 bg-white/[0.03] rounded-md overflow-hidden relative">
                                <div
                                    className="h-full rounded-md transition-all"
                                    style={{
                                        width: `${widthPct}%`,
                                        background: `linear-gradient(90deg, ${hueAt(i, data.length, 0.45)}, ${hueAt(i, data.length, 0.75)})`,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function hueAt(idx: number, total: number, alpha: number): string {
    // Gradient azul -> roxo -> rosa conforme avanca no funil
    const hue = 220 - (idx / Math.max(total - 1, 1)) * 100;
    return `hsla(${hue}, 70%, 55%, ${alpha})`;
}
