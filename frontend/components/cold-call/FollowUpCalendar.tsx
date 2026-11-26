"use client";

// Agenda dos follow-ups do cold call, no estilo Google Agenda:
//   Dia    = um dia qualquer com Manha e Tarde (cartoes completos)
//   Semana = segunda a domingo, cada dia com Manha e Tarde
//   Mes    = grade do mes com os follow-ups de cada dia
// Arrastar um follow-up pra outro dia (ou pra Manha/Tarde) remarca na hora.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle2, Sun, Moon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayBR, addDaysYMD } from "@/lib/br-time";
import { qk } from "@/lib/query-keys";
import { getColdCallFollowups, updateColdCallFollowup } from "@/app/actions";
import { dial } from "@/lib/dialer";
import { FollowUpRow, actionMeta, followupWhen, followupSortKey, shortLeadName } from "./FollowUpBoard";

export type AgendaView = "dia" | "semana" | "mes";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// ---------- datas (YYYY-MM-DD, sem fuso) ----------
function parts(ymd: string) {
    const [y, m, d] = ymd.split("-").map(Number);
    return { y, m, d };
}
function weekday(ymd: string) {
    const { y, m, d } = parts(ymd);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function mondayOf(ymd: string) {
    return addDaysYMD(ymd, -((weekday(ymd) + 6) % 7));
}
function firstOfMonth(ymd: string) {
    const { y, m } = parts(ymd);
    return `${y}-${String(m).padStart(2, "0")}-01`;
}
function addMonths(ymd: string, n: number) {
    const { y, m } = parts(ymd);
    const dt = new Date(Date.UTC(y, m - 1 + n, 1));
    return dt.toISOString().slice(0, 10);
}
function lastOfMonth(ymd: string) {
    return addDaysYMD(addMonths(firstOfMonth(ymd), 1), -1);
}
function rangeFor(view: AgendaView, anchor: string): { from: string; to: string; days: string[] } {
    let from: string, to: string;
    if (view === "dia") {
        from = to = anchor;
    } else if (view === "semana") {
        from = mondayOf(anchor);
        to = addDaysYMD(from, 6);
    } else {
        from = mondayOf(firstOfMonth(anchor));
        const last = lastOfMonth(anchor);
        to = addDaysYMD(mondayOf(last), 6);
    }
    const days: string[] = [];
    for (let d = from; d <= to; d = addDaysYMD(d, 1)) days.push(d);
    return { from, to, days };
}
function title(view: AgendaView, anchor: string, from: string, to: string) {
    const a = parts(anchor);
    if (view === "dia") return `${DIAS_LONGOS[weekday(anchor)]}, ${a.d} de ${MESES[a.m - 1]}`;
    if (view === "mes") return `${MESES[a.m - 1]} de ${a.y}`;
    const f = parts(from), t = parts(to);
    return f.m === t.m
        ? `${f.d} a ${t.d} de ${MESES[t.m - 1]} de ${t.y}`
        : `${f.d} de ${MESES[f.m - 1]} a ${t.d} de ${MESES[t.m - 1]} de ${t.y}`;
}

// Secao do dia onde o follow-up aparece (qualquer horario fica na tarde, igual ao quadro).
type Section = "manha" | "tarde";
const sectionOf = (f: any): Section => (f.periodo === "manha" ? "manha" : "tarde");

// ---------- chip compacto (semana e mes) ----------
function Chip({ f, compact, onOpen, onComplete }: {
    f: any; compact?: boolean; onOpen: (f: any) => void; onComplete: (f: any) => void;
}) {
    const done = f.status === "concluido";
    const late = f.status === "atrasado";
    const meta = actionMeta(f.tipo_acao);
    const Icon = meta.Icon;
    const full = f.cold_leads?.nome || "Lead sem nome";
    return (
        <div
            draggable={!done}
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", f.id); e.dataTransfer.effectAllowed = "move"; }}
            onClick={(e) => { e.stopPropagation(); onOpen(f); }}
            title={`${full}\n${followupWhen(f)} · ${meta.label}${late ? " · atrasado" : ""}${done ? " · feito" : ""}${done ? "" : "\nArraste pra remarcar"}`}
            className={cn(
                "group relative flex items-start gap-1.5 rounded-md border pl-2 pr-1 py-1 text-[11px] leading-tight cursor-pointer transition",
                done
                    ? "bg-slate-50 border-slate-200 text-slate-400"
                    : late
                        ? "bg-red-50 border-red-200 text-red-800 hover:border-red-300"
                        : "bg-white border-slate-200 text-slate-800 hover:border-indigo-300 hover:shadow-sm",
                !done && "active:cursor-grabbing"
            )}
        >
            <span aria-hidden className={cn("absolute left-0 top-1 bottom-1 w-0.5 rounded-full", done ? "bg-slate-300" : late ? "bg-red-500" : meta.bar)} />
            <Icon className={cn("w-3 h-3 mt-px shrink-0", done ? "text-slate-300" : "text-slate-500")} />
            <div className="min-w-0 flex-1">
                <div className={cn("font-semibold", compact ? "truncate" : "line-clamp-2 break-words", done && "line-through")}>
                    {shortLeadName(full)}
                </div>
                {!compact && <div className={cn("text-[10px] mt-0.5", done ? "text-slate-400" : "text-slate-500")}>{followupWhen(f)}</div>}
            </div>
            {!done && !compact && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onComplete(f); }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 rounded p-0.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                    title="Concluir"
                    aria-label="Concluir follow-up"
                >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
            )}
            {done && <CheckCircle2 className="w-3 h-3 mt-px shrink-0 text-emerald-500" />}
        </div>
    );
}

// Area que recebe o follow-up arrastado.
function DropZone({ id, active, onDragOverZone, onDropZone, className, children }: {
    id: string; active: boolean; onDragOverZone: (id: string | null) => void; onDropZone: (e: React.DragEvent) => void;
    className?: string; children: React.ReactNode;
}) {
    return (
        <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!active) onDragOverZone(id); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragOverZone(null); }}
            onDrop={(e) => { e.preventDefault(); onDragOverZone(null); onDropZone(e); }}
            className={cn(className, active && "ring-2 ring-indigo-400 ring-inset bg-indigo-50/60")}
        >
            {children}
        </div>
    );
}

export function FollowUpCalendar({ view, onViewChange, onOpenLead, typeFilter }: {
    view: AgendaView;
    onViewChange: (v: AgendaView) => void;
    onOpenLead: (leadId: string) => void;
    /** Tipos de acao a mostrar (ligacao, whatsapp, email...). Vazio = todos. */
    typeFilter?: string[];
}) {
    const queryClient = useQueryClient();
    const today = todayBR();
    const [anchor, setAnchor] = useState(today);
    const [overZone, setOverZone] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const { from, to, days } = useMemo(() => rangeFor(view, anchor), [view, anchor]);
    const queryKey = useMemo(() => [...qk.coldCall.followups(), "agenda", from, to] as const, [from, to]);

    const agendaQuery = useQuery({
        queryKey,
        queryFn: async () => {
            const res = await getColdCallFollowups({ dateFrom: from, dateTo: to });
            if (!res.success) throw new Error(res.error || "Falha ao carregar a agenda");
            return ((res.data as any[]) || [])
                .filter((f) => f.status !== "cancelado")
                .map((f) => {
                    const d = String(f.data_agendada || "").slice(0, 10);
                    return f.status !== "concluido" && d < today ? { ...f, status: "atrasado" } : f;
                });
        },
        staleTime: 30_000,
    });
    const allItems: any[] = agendaQuery.data ?? [];
    const items: any[] = useMemo(
        () => (typeFilter && typeFilter.length ? allItems.filter((f) => typeFilter.includes(f.tipo_acao)) : allItems),
        [allItems, typeFilter],
    );

    const byDay = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const f of items) {
            const d = String(f.data_agendada || "").slice(0, 10);
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(f);
        }
        for (const list of map.values()) list.sort((a, b) => followupSortKey(a).localeCompare(followupSortKey(b)));
        return map;
    }, [items]);

    const pending = items.filter((f) => f.status !== "concluido").length;
    const done = items.length - pending;

    function move(step: number) {
        if (view === "dia") setAnchor((a) => addDaysYMD(a, step));
        else if (view === "semana") setAnchor((a) => addDaysYMD(a, 7 * step));
        else setAnchor((a) => addMonths(firstOfMonth(a), step));
    }

    const refresh = () => queryClient.invalidateQueries({ queryKey: qk.coldCall.followups() });

    const openFollowup = (f: any) => { if (f?.cold_lead_id) onOpenLead(f.cold_lead_id); };

    async function complete(f: any) {
        const res = await updateColdCallFollowup(f.id, { status: "concluido" });
        if (res.success) { toast.success("Follow-up concluído!"); refresh(); }
        else toast.error(res.error || "Erro ao concluir follow-up.");
    }

    // Remarca: muda o dia e, se caiu em outra secao, o periodo (a hora marcada sai).
    async function reschedule(id: string, date: string, section?: Section) {
        const f = items.find((x) => x.id === id);
        if (!f || f.status === "concluido") return;
        const sameDay = String(f.data_agendada).slice(0, 10) === date;
        const changeSection = section && sectionOf(f) !== section;
        if (sameDay && !changeSection) return;
        const patch: Record<string, any> = { data_agendada: date };
        if (changeSection) { patch.periodo = section; patch.horario_especifico = null; }

        // Atualiza na tela na hora; o banco confirma em seguida.
        queryClient.setQueryData(queryKey, (old: any[] | undefined) =>
            (old ?? []).map((x) => (x.id === id ? { ...x, ...patch, status: date < today ? "atrasado" : "pendente" } : x)));
        setBusy(true);
        const res = await updateColdCallFollowup(id, patch);
        setBusy(false);
        if (res.success) {
            const [, m, d] = date.split("-");
            toast.success(`Remarcado pra ${d}/${m}${changeSection ? ` (${section === "manha" ? "manhã" : "tarde"})` : ""}`);
        } else {
            toast.error(res.error || "Não consegui remarcar.");
        }
        refresh();
    }

    const dropHandler = (date: string, section?: Section) => (e: React.DragEvent) => {
        const id = e.dataTransfer.getData("text/plain");
        if (id) reschedule(id, date, section);
    };

    // ---------- cabecalho ----------
    const header = (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                    <button onClick={() => move(-1)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-l-lg" aria-label="Anterior">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => move(1)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-r-lg border-l border-slate-200" aria-label="Próximo">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                <button
                    onClick={() => setAnchor(today)}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                    Hoje
                </button>
                <h3 className="ml-1 text-base font-bold text-slate-900 capitalize">{title(view, anchor, from, to)}</h3>
                {(agendaQuery.isFetching || busy) && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>
            <div className="text-[12px] text-slate-500">
                <span className="font-semibold text-slate-700">{pending}</span> {pending === 1 ? "pendente" : "pendentes"}
                <span className="text-slate-300"> · </span>
                <span className="font-semibold text-slate-700">{done}</span> {done === 1 ? "feito" : "feitos"}
                <span className="hidden md:inline text-slate-400"> · arraste pra remarcar</span>
            </div>
            {agendaQuery.isError && <p className="w-full text-sm text-red-600">Não consegui carregar a agenda. Clique em Recarregar.</p>}
        </div>
    );

    // ---------- DIA ----------
    if (view === "dia") {
        const list = byDay.get(anchor) ?? [];
        const sec = (s: Section) => list.filter((f) => sectionOf(f) === s);
        const col = (s: Section) => {
            const its = sec(s);
            const Icon = s === "manha" ? Sun : Moon;
            return (
                <DropZone
                    id={`${anchor}-${s}`}
                    active={overZone === `${anchor}-${s}`}
                    onDragOverZone={setOverZone}
                    onDropZone={dropHandler(anchor, s)}
                    className="flex flex-col bg-white rounded-xl p-4 border border-slate-200 shadow-sm min-h-[220px] transition"
                >
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", s === "manha" ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600")}>
                            <Icon className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 text-sm">{s === "manha" ? "Manhã (8h às 12h)" : "Tarde (13h às 18h)"}</h4>
                            <p className="text-[11px] text-slate-500">{its.length} {its.length === 1 ? "follow-up" : "follow-ups"}</p>
                        </div>
                    </div>
                    {its.length === 0 ? (
                        <div className="flex-1 min-h-24 flex items-center justify-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                            Nada marcado
                        </div>
                    ) : (
                        its.map((f) => (
                            <div key={f.id} draggable={f.status !== "concluido"} onDragStart={(e) => e.dataTransfer.setData("text/plain", f.id)}>
                                <FollowUpRow
                                    followup={f}
                                    onRowClick={openFollowup}
                                    onActionClick={(id, action) => {
                                        if (action === "complete") complete(f);
                                        else if (action === "call") { if (f.cold_leads?.telefone) dial(f.cold_leads.telefone); openFollowup(f); }
                                        else if (action === "whatsapp") {
                                            const p = String(f.cold_leads?.telefone || "").replace(/\D/g, "");
                                            if (p) window.open(`https://wa.me/${p.startsWith("55") && p.length >= 12 ? p : `55${p}`}`, "_blank");
                                        }
                                    }}
                                />
                            </div>
                        ))
                    )}
                </DropZone>
            );
        };
        return (
            <div className="p-2">
                {header}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {col("manha")}
                    {col("tarde")}
                </div>
            </div>
        );
    }

    // ---------- SEMANA ----------
    if (view === "semana") {
        return (
            <div className="p-2">
                {header}
                <div className="overflow-x-auto pb-2">
                    <div className="grid grid-cols-7 gap-2 min-w-[980px]">
                        {days.map((d) => {
                            const list = byDay.get(d) ?? [];
                            const isToday = d === today;
                            const isPast = d < today;
                            const wd = weekday(d);
                            const weekend = wd === 0 || wd === 6;
                            return (
                                <div key={d} className={cn("flex flex-col rounded-xl border bg-white min-h-[420px]", isToday ? "border-indigo-300 shadow-sm" : "border-slate-200", weekend && !isToday && "bg-slate-50/60")}>
                                    <button
                                        onClick={() => { setAnchor(d); onViewChange("dia"); }}
                                        className="flex items-center justify-between px-3 py-2 border-b border-slate-100 hover:bg-slate-50 rounded-t-xl text-left"
                                        title="Abrir o dia"
                                    >
                                        <span className="flex items-baseline gap-1.5">
                                            <span className={cn("text-[11px] font-semibold uppercase", isToday ? "text-indigo-600" : "text-slate-500")}>{DIAS_CURTOS[wd]}</span>
                                            <span className={cn("text-lg font-bold leading-none", isToday ? "text-white bg-indigo-600 rounded-full w-7 h-7 inline-flex items-center justify-center text-sm" : isPast ? "text-slate-400" : "text-slate-800")}>
                                                {parts(d).d}
                                            </span>
                                        </span>
                                        {list.length > 0 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{list.length}</span>}
                                    </button>
                                    {(["manha", "tarde"] as Section[]).map((s) => {
                                        const its = list.filter((f) => sectionOf(f) === s);
                                        const zone = `${d}-${s}`;
                                        return (
                                            <DropZone
                                                key={s}
                                                id={zone}
                                                active={overZone === zone}
                                                onDragOverZone={setOverZone}
                                                onDropZone={dropHandler(d, s)}
                                                className={cn("flex-1 p-1.5 space-y-1 transition", s === "tarde" && "border-t border-dashed border-slate-200")}
                                            >
                                                <p className="px-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                                    {s === "manha" ? <Sun className="w-2.5 h-2.5" /> : <Moon className="w-2.5 h-2.5" />}
                                                    {s === "manha" ? "Manhã" : "Tarde"}
                                                </p>
                                                {its.map((f) => (
                                                    <Chip key={f.id} f={f} onOpen={openFollowup} onComplete={complete} />
                                                ))}
                                            </DropZone>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // ---------- MES ----------
    const month = parts(anchor).m;
    const MAX = 3;
    return (
        <div className="p-2">
            {header}
            <div className="overflow-x-auto pb-2">
                <div className="min-w-[860px] rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((w) => (
                            <div key={w} className="px-2 py-1.5 text-[11px] font-semibold uppercase text-slate-500">{w}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((d, i) => {
                            const list = byDay.get(d) ?? [];
                            const inMonth = parts(d).m === month;
                            const isToday = d === today;
                            const zone = `${d}-mes`;
                            return (
                                <DropZone
                                    key={d}
                                    id={zone}
                                    active={overZone === zone}
                                    onDragOverZone={setOverZone}
                                    onDropZone={dropHandler(d)}
                                    className={cn(
                                        "min-h-[112px] p-1.5 border-slate-100 transition",
                                        i % 7 !== 6 && "border-r",
                                        i < days.length - 7 && "border-b",
                                        !inMonth && "bg-slate-50/70"
                                    )}
                                >
                                    <button
                                        onClick={() => { setAnchor(d); onViewChange("dia"); }}
                                        className={cn(
                                            "mb-1 inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-semibold hover:bg-slate-100",
                                            isToday ? "bg-indigo-600 text-white hover:bg-indigo-700" : inMonth ? "text-slate-700" : "text-slate-400"
                                        )}
                                        title="Abrir o dia"
                                    >
                                        {parts(d).d}
                                    </button>
                                    <div className="space-y-1">
                                        {list.slice(0, MAX).map((f) => (
                                            <Chip key={f.id} f={f} compact onOpen={openFollowup} onComplete={complete} />
                                        ))}
                                        {list.length > MAX && (
                                            <button
                                                onClick={() => { setAnchor(d); onViewChange("dia"); }}
                                                className="w-full text-left px-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                                            >
                                                + {list.length - MAX} {list.length - MAX === 1 ? "outro" : "outros"}
                                            </button>
                                        )}
                                    </div>
                                </DropZone>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
