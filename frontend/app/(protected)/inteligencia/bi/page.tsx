"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { getAiDailyStats } from "../actions";

// Paleta categórica VALIDADA (validate_palette.js: todos os checks PASS,
// light mode, superfície branca). Cor segue a série, ordem fixa.
const SERIES = [
    { key: "leads_novos", label: "Leads novos", color: "#4f46e5" },
    { key: "agendamentos", label: "Agendamentos", color: "#059669" },
    { key: "atendimentos", label: "Atendimentos", color: "#b45309" },
    { key: "conversas", label: "Conversas ativas", color: "#9333ea" },
] as const;
type SerieKey = (typeof SERIES)[number]["key"];

function fmtDia(iso: string) {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
}

export default function BiDiarioPage() {
    const [days, setDays] = useState<7 | 14 | 30>(14);
    const [hidden, setHidden] = useState<Set<SerieKey>>(new Set());
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const statsQuery = useQuery({
        queryKey: ["ai", "daily", days],
        queryFn: async () => {
            const r = await getAiDailyStats(days);
            if (!r.success) throw new Error(r.error);
            return r.rows as { dia: string; leads_novos: number; agendamentos: number; atendimentos: number; conversas: number }[];
        },
        refetchInterval: 120_000,
    });
    const rows = statsQuery.data ?? [];

    const totals = useMemo(() => Object.fromEntries(
        SERIES.map((s) => [s.key, rows.reduce((acc, r) => acc + (r[s.key] ?? 0), 0)])
    ) as Record<SerieKey, number>, [rows]);

    // ---------- geometria do grafico ----------
    const W = 920, H = 320, M = { top: 16, right: 120, bottom: 28, left: 40 };
    const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
    const visible = SERIES.filter((s) => !hidden.has(s.key));
    const maxY = Math.max(4, ...rows.flatMap((r) => visible.map((s) => r[s.key] ?? 0)));
    const x = (i: number) => M.left + (rows.length <= 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
    const y = (v: number) => M.top + ih - (v / maxY) * ih;
    const yTicks = useMemo(() => {
        const step = Math.max(1, Math.ceil(maxY / 4));
        const t: number[] = [];
        for (let v = 0; v <= maxY; v += step) t.push(v);
        return t;
    }, [maxY]);

    function onMove(e: React.MouseEvent<SVGSVGElement>) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || rows.length === 0) return;
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const i = Math.round(((px - M.left) / iw) * (rows.length - 1));
        setHoverIdx(Math.min(rows.length - 1, Math.max(0, i)));
    }

    const hover = hoverIdx != null ? rows[hoverIdx] : null;

    return (
        <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-6xl mx-auto px-6 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <a href="/inteligencia" className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" aria-label="Voltar">
                            <ArrowLeft size={16} />
                        </a>
                        <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">BI diário</h1>
                            <p className="text-xs text-slate-500">Leads, agendamentos e atendimento — dia a dia, contados na data em que aconteceram.</p>
                        </div>
                    </div>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        {([7, 14, 30] as const).map((d) => (
                            <button key={d} onClick={() => setDays(d)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold ${days === d ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                                {d} dias
                            </button>
                        ))}
                    </div>
                </div>

                {/* Totais do periodo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {SERIES.map((s) => (
                        <div key={s.key} className="bg-white border border-slate-200 rounded-xl p-4">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                                {s.label}
                            </div>
                            <div className="text-2xl font-bold text-slate-800">{totals[s.key] ?? 0}</div>
                            <div className="text-[11px] text-slate-400">no período</div>
                        </div>
                    ))}
                </div>

                {/* Grafico */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                    {/* Legenda (clicavel: esconde/mostra serie; cor nunca muda) */}
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                        {SERIES.map((s) => (
                            <button key={s.key}
                                onClick={() => setHidden((h) => { const n = new Set(h); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${hidden.has(s.key) ? "text-slate-300" : "text-slate-600"}`}>
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: hidden.has(s.key) ? "#cbd5e1" : s.color }} />
                                {s.label}
                            </button>
                        ))}
                        <span className="ml-auto text-[11px] text-slate-400">clique na legenda para ocultar uma linha</span>
                    </div>

                    {statsQuery.isLoading ? (
                        <div className="h-64 flex items-center justify-center text-sm text-slate-400">Carregando...</div>
                    ) : (
                    <div className="overflow-x-auto">
                    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]"
                        onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)} role="img"
                        aria-label="Gráfico de linhas: métricas diárias da Inteligência">
                        {/* grid horizontal recessivo */}
                        {yTicks.map((t) => (
                            <g key={t}>
                                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth={1} />
                                <text x={M.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{t}</text>
                            </g>
                        ))}
                        {/* eixo x: datas (pula rotulos se muitos dias) */}
                        {rows.map((r, i) => (
                            (rows.length <= 16 || i % Math.ceil(rows.length / 14) === 0) && (
                                <text key={r.dia} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">{fmtDia(r.dia)}</text>
                            )
                        ))}
                        {/* crosshair */}
                        {hover && (
                            <line x1={x(hoverIdx!)} x2={x(hoverIdx!)} y1={M.top} y2={M.top + ih} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
                        )}
                        {/* linhas (2px) + marcador no hover + rotulo direto no ultimo ponto */}
                        {visible.map((s) => {
                            const pts = rows.map((r, i) => `${x(i)},${y(r[s.key] ?? 0)}`).join(" ");
                            const last = rows[rows.length - 1];
                            return (
                                <g key={s.key}>
                                    <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                                    {hover && (
                                        <circle cx={x(hoverIdx!)} cy={y(hover[s.key] ?? 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                                    )}
                                    {last && (
                                        <text x={W - M.right + 8} y={y(last[s.key] ?? 0) + 4} fontSize={11} fontWeight={700} fill={s.color}>
                                            {last[s.key] ?? 0} · {s.label}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                        {/* area de captura do hover */}
                        <rect x={M.left} y={M.top} width={iw} height={ih} fill="transparent" />
                    </svg>
                    </div>
                    )}

                    {/* tooltip */}
                    {hover && (
                        <div className="mt-2 inline-flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                            <b className="text-slate-700">{fmtDia(hover.dia)}</b>
                            {visible.map((s) => (
                                <span key={s.key} className="inline-flex items-center gap-1 text-slate-600">
                                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                                    {s.label}: <b>{hover[s.key] ?? 0}</b>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Tabela (acessibilidade + conferencia) */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                                    <th className="px-4 py-2.5">Dia</th>
                                    {SERIES.map((s) => <th key={s.key} className="px-4 py-2.5">{s.label}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {[...rows].reverse().map((r) => (
                                    <tr key={r.dia} className="border-b border-slate-50 text-slate-700">
                                        <td className="px-4 py-2 font-semibold">{fmtDia(r.dia)}</td>
                                        {SERIES.map((s) => <td key={s.key} className="px-4 py-2 tabular-nums">{r[s.key] ?? 0}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-3">
                    Agendamentos contam no dia em que o paciente confirmou na conversa (não no dia em que a IA processou).
                    Atendimentos = conversas respondidas pela clínica no dia. Fuso: horário de Brasília.
                </p>
            </div>
        </div>
    );
}
