"use client";

import { useState } from "react";
import { CalendarCheck, X, Phone, Loader2, CalendarClock } from "lucide-react";
import { getColdMeetingsDetails } from "@/app/(protected)/dashboard/actions";

type Meeting = {
    leadId: string;
    nome: string;
    telefone: string;
    nicho: string;
    marcadaEm: string;
    proximaReuniao: string | null;
    vendedor: string;
};

function formatPhone(p: string): string {
    const d = String(p || "").replace(/\D/g, "");
    if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(p || "");
}

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

export function ColdMeetingsCard({
    value, pct, period, userId, startDate, endDate,
}: {
    value: number;
    pct?: number;
    period: string;
    userId: string;
    startDate?: string;
    endDate?: string;
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [meetings, setMeetings] = useState<Meeting[]>([]);

    async function openModal() {
        setOpen(true);
        setLoading(true);
        const res = await getColdMeetingsDetails({ period, userId, startDate, endDate });
        setMeetings(res.success ? (res.data as Meeting[]) : []);
        setLoading(false);
    }

    return (
        <>
            <button
                type="button"
                onClick={openModal}
                className="block w-full text-left bg-[#0f172a]/40 p-4 rounded-xl border border-white/5 hover:border-white/10 hover:bg-[#0f172a]/60 transition-colors relative cursor-pointer"
            >
                {typeof pct === "number" && (
                    <div className="absolute top-2 right-2 text-[9px] font-bold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                        {pct}%
                    </div>
                )}
                <CalendarCheck className="w-4 h-4 text-gray-500 mb-2" />
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reuniões</div>
                <div className="text-xl font-bold text-emerald-300">{value}</div>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <CalendarCheck className="w-4 h-4" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Reuniões marcadas</h2>
                                    <p className="text-[11px] text-slate-500">{meetings.length} no período · só visualização</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} aria-label="Fechar" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="py-16 flex items-center justify-center text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
                                </div>
                            ) : meetings.length === 0 ? (
                                <div className="py-16 text-center text-slate-400 text-sm">Nenhuma reunião marcada no período.</div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {meetings.map((m, i) => (
                                        <li key={`${m.leadId}-${i}`} className="px-6 py-3.5 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-slate-800 text-sm truncate">{m.nome}</span>
                                                        {m.nicho && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{m.nicho}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-[12px] text-slate-500">
                                                        {m.telefone && (
                                                            <span className="inline-flex items-center gap-1 tabular-nums">
                                                                <Phone className="w-3 h-3" /> {formatPhone(m.telefone)}
                                                            </span>
                                                        )}
                                                        <span className="text-slate-400">por {m.vendedor}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-[11px] text-slate-400">marcada em</div>
                                                    <div className="text-[12px] font-medium text-slate-600">{formatDateTime(m.marcadaEm)}</div>
                                                    {m.proximaReuniao && (
                                                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                                                            <CalendarClock className="w-3 h-3" /> {formatDateTime(m.proximaReuniao)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
