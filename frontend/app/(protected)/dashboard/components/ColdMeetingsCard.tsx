"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck, X, Phone, Loader2, CalendarClock, Check, XCircle, UserX } from "lucide-react";
import { toast } from "sonner";
import { getColdMeetingsDetails, setMeetingOutcome, type MeetingOutcome } from "@/app/(protected)/dashboard/actions";

type Meeting = {
    noteId: string;
    leadId: string;
    nome: string;
    telefone: string;
    nicho: string;
    marcadaEm: string;
    proximaReuniao: string | null;
    vendedor: string;
    outcome: MeetingOutcome | null;
};

const OUTCOMES: { key: MeetingOutcome; label: string; icon: typeof Check; active: string; idle: string }[] = [
    { key: "aconteceu", label: "Aconteceu", icon: Check, active: "bg-emerald-600 text-white border-emerald-600", idle: "text-emerald-700 border-emerald-200 hover:bg-emerald-50" },
    { key: "cancelada", label: "Cancelada", icon: XCircle, active: "bg-rose-600 text-white border-rose-600", idle: "text-rose-700 border-rose-200 hover:bg-rose-50" },
    { key: "no_show", label: "No-show", icon: UserX, active: "bg-amber-500 text-white border-amber-500", idle: "text-amber-700 border-amber-200 hover:bg-amber-50" },
];

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
    const [savingNote, setSavingNote] = useState<string | null>(null);

    async function openModal() {
        setOpen(true);
        setLoading(true);
        const res = await getColdMeetingsDetails({ period, userId, startDate, endDate });
        setMeetings(res.success ? (res.data as Meeting[]) : []);
        setLoading(false);
    }

    async function handleOutcome(m: Meeting, outcome: MeetingOutcome) {
        // Clicar de novo no atual remove; senao aplica.
        const next = m.outcome === outcome ? null : outcome;
        setSavingNote(m.noteId);
        setMeetings((prev) => prev.map((x) => (x.noteId === m.noteId ? { ...x, outcome: next } : x)));
        const res = await setMeetingOutcome({ noteId: m.noteId, coldLeadId: m.leadId, outcome: next ?? outcome, meetingAt: m.proximaReuniao, clear: next === null });
        if (!res.success) {
            toast.error("Erro ao salvar resultado", { description: res.error });
            const r = await getColdMeetingsDetails({ period, userId, startDate, endDate });
            setMeetings(r.success ? (r.data as Meeting[]) : []);
        }
        setSavingNote(null);
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

            {open && typeof document !== "undefined" && createPortal(
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
                                    <p className="text-[11px] text-slate-500">{meetings.length} no período · marque o resultado</p>
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

                                            {/* Resultado da reunião */}
                                            <div className="flex items-center gap-2 mt-2.5">
                                                {OUTCOMES.map((o) => {
                                                    const Icon = o.icon;
                                                    const isActive = m.outcome === o.key;
                                                    return (
                                                        <button
                                                            key={o.key}
                                                            type="button"
                                                            disabled={savingNote === m.noteId}
                                                            onClick={() => handleOutcome(m, o.key)}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-semibold transition-colors disabled:opacity-50 ${isActive ? o.active : `bg-white ${o.idle}`}`}
                                                        >
                                                            <Icon className="w-3.5 h-3.5" />
                                                            {o.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
