"use client";

import { Clock, Send, Inbox, Users, Zap, TrendingUp } from "lucide-react";

interface Quality {
    totalSent: number;
    totalReceived: number;
    uniqueLeadsReached: number;
    avgFirstResponseSec: number;
    responseRate: number;
    slaBuckets: {
        under5min: number;
        under1h: number;
        under24h: number;
        over24h: number;
    };
}

function formatDuration(sec: number): string {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}min`;
    if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
    return `${(sec / 86400).toFixed(1)}d`;
}

export function ResponseQualityCard({ quality }: { quality: Quality }) {
    const totalSLA =
        quality.slaBuckets.under5min +
        quality.slaBuckets.under1h +
        quality.slaBuckets.under24h +
        quality.slaBuckets.over24h;

    const pct = (n: number) => (totalSLA > 0 ? Math.round((n / totalSLA) * 100) : 0);

    return (
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-white">Qualidade do atendimento</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Velocidade e cobertura das respostas
                    </p>
                </div>
            </div>

            {/* Mini KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <MiniKpi
                    icon={<Send className="w-3.5 h-3.5 text-blue-300" />}
                    label="Enviadas"
                    value={quality.totalSent.toString()}
                />
                <MiniKpi
                    icon={<Inbox className="w-3.5 h-3.5 text-emerald-300" />}
                    label="Recebidas"
                    value={quality.totalReceived.toString()}
                />
                <MiniKpi
                    icon={<Users className="w-3.5 h-3.5 text-purple-300" />}
                    label="Leads únicos"
                    value={quality.uniqueLeadsReached.toString()}
                    hint="contatos distintos"
                />
                <MiniKpi
                    icon={<TrendingUp className="w-3.5 h-3.5 text-amber-300" />}
                    label="Taxa resposta"
                    value={`${quality.responseRate}%`}
                    hint="conversas respondidas"
                />
            </div>

            {/* Tempo médio */}
            <div className="bg-white/[0.03] rounded-xl p-4 mb-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/15 rounded-lg flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Tempo médio de 1ª resposta
                    </div>
                    <div className="text-xl font-bold text-white">
                        {formatDuration(quality.avgFirstResponseSec)}
                    </div>
                </div>
            </div>

            {/* SLA Stack */}
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="w-3 h-3 text-amber-300" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Distribuição (SLA)
                    </span>
                </div>

                {totalSLA === 0 ? (
                    <p className="text-xs text-gray-500 italic py-2">
                        Sem respostas registradas no período.
                    </p>
                ) : (
                    <>
                        <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                            {quality.slaBuckets.under5min > 0 && (
                                <div
                                    className="bg-emerald-500"
                                    style={{ width: `${pct(quality.slaBuckets.under5min)}%` }}
                                    title={`<5min: ${quality.slaBuckets.under5min}`}
                                />
                            )}
                            {quality.slaBuckets.under1h > 0 && (
                                <div
                                    className="bg-yellow-500"
                                    style={{ width: `${pct(quality.slaBuckets.under1h)}%` }}
                                    title={`<1h: ${quality.slaBuckets.under1h}`}
                                />
                            )}
                            {quality.slaBuckets.under24h > 0 && (
                                <div
                                    className="bg-orange-500"
                                    style={{ width: `${pct(quality.slaBuckets.under24h)}%` }}
                                    title={`<24h: ${quality.slaBuckets.under24h}`}
                                />
                            )}
                            {quality.slaBuckets.over24h > 0 && (
                                <div
                                    className="bg-rose-500"
                                    style={{ width: `${pct(quality.slaBuckets.over24h)}%` }}
                                    title={`>24h: ${quality.slaBuckets.over24h}`}
                                />
                            )}
                        </div>

                        <div className="grid grid-cols-4 gap-2 mt-3 text-[10px]">
                            <SlaLegend color="bg-emerald-500" label="< 5min" value={quality.slaBuckets.under5min} pct={pct(quality.slaBuckets.under5min)} />
                            <SlaLegend color="bg-yellow-500" label="< 1h" value={quality.slaBuckets.under1h} pct={pct(quality.slaBuckets.under1h)} />
                            <SlaLegend color="bg-orange-500" label="< 24h" value={quality.slaBuckets.under24h} pct={pct(quality.slaBuckets.under24h)} />
                            <SlaLegend color="bg-rose-500" label="> 24h" value={quality.slaBuckets.over24h} pct={pct(quality.slaBuckets.over24h)} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function MiniKpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
    return (
        <div className="bg-white/[0.03] rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                {icon}
                {label}
            </div>
            <div className="text-lg font-bold text-white tabular-nums">{value}</div>
            {hint && <div className="text-[9px] text-gray-500 mt-0.5">{hint}</div>}
        </div>
    );
}

function SlaLegend({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
    return (
        <div className="flex items-start gap-1.5">
            <div className={`w-2 h-2 rounded-full ${color} mt-0.5 shrink-0`} />
            <div className="min-w-0">
                <div className="text-gray-400 truncate">{label}</div>
                <div className="text-white font-semibold tabular-nums">
                    {value} <span className="text-gray-500 font-normal">· {pct}%</span>
                </div>
            </div>
        </div>
    );
}
