"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, ChevronDown, X, Check } from "lucide-react";

/**
 * Filtro unico do quadro de leads, no estilo do Kommo.
 *
 * Antes eram 5 controles soltos na barra (etiqueta, periodo, responsavel,
 * sem contato hoje, ativas/perdidas), cada um aplicando na hora. Agora tudo
 * fica num painel: a pessoa monta o filtro com calma (varias etiquetas, varios
 * produtos) e so quando clica em Aplicar o quadro muda.
 */

export type DatePreset = "all" | "today" | "last7" | "last30" | "thisMonth" | "custom";

export type LeadFilterState = {
    status: "active" | "lost";
    owner: string; // "all" | id do usuario | "loading" (ainda descobrindo quem esta logado)
    noTouchToday: boolean;
    tags: string[];
    products: string[];
    date: DatePreset;
    dateStart: string;
    dateEnd: string;
};

export const EMPTY_FILTERS: Omit<LeadFilterState, "owner"> = {
    status: "active",
    noTouchToday: false,
    tags: [],
    products: [],
    date: "all",
    dateStart: "",
    dateEnd: "",
};

const DATE_LABEL: Record<DatePreset, string> = {
    all: "Todo o período",
    today: "Hoje",
    last7: "Últimos 7 dias",
    last30: "Últimos 30 dias",
    thisMonth: "Este mês",
    custom: "Personalizado",
};

const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");

function dateLabel(f: LeadFilterState) {
    if (f.date !== "custom") return DATE_LABEL[f.date];
    if (f.dateStart && f.dateEnd) return `${fmtDia(f.dateStart)} a ${fmtDia(f.dateEnd)}`;
    if (f.dateStart) return `Desde ${fmtDia(f.dateStart)}`;
    if (f.dateEnd) return `Até ${fmtDia(f.dateEnd)}`;
    return "Personalizado";
}

/** Quantos filtros estao mexendo no quadro (o padrao "ativas, todos" nao conta). */
export function countActiveFilters(f: LeadFilterState) {
    let n = 0;
    if (f.status === "lost") n++;
    if (f.owner !== "all" && f.owner !== "loading") n++;
    if (f.noTouchToday) n++;
    if (f.tags.length) n++;
    if (f.products.length) n++;
    if (f.date !== "all") n++;
    return n;
}

type Option = { id: string; name: string; color?: string | null };

interface Props {
    value: LeadFilterState;
    onApply: (next: LeadFilterState) => void;
    tags: Option[];
    products: Option[];
    teamMembers: { id: string; full_name: string }[];
    currentUserId: string;
}

export default function LeadFilters({ value, onApply, tags, products, teamMembers, currentUserId }: Props) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<LeadFilterState>(value);
    const [section, setSection] = useState<null | "tags" | "date" | "products">(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Toda vez que abre, o rascunho parte do filtro que esta valendo
    useEffect(() => {
        if (open) { setDraft(value); setSection(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Fecha ao clicar fora ou apertar Esc (descarta o rascunho)
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const toggleIn = (key: "tags" | "products", id: string) =>
        setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }));

    const apply = () => { onApply(draft); setOpen(false); };
    const clearDraft = () => setDraft({ ...EMPTY_FILTERS, owner: "all" });

    const active = countActiveFilters(value);
    const nome = (list: Option[], id: string) => list.find((o) => String(o.id) === id)?.name ?? "?";

    // Resumo do que esta aplicado, com X pra tirar um item sem abrir o painel
    const chips: { key: string; label: string; remove: () => void }[] = [];
    if (value.status === "lost") chips.push({ key: "status", label: "Perdidas", remove: () => onApply({ ...value, status: "active" }) });
    if (value.owner !== "all" && value.owner !== "loading") {
        const label = value.owner === currentUserId ? "Meus leads" : teamMembers.find((m) => m.id === value.owner)?.full_name ?? "Responsável";
        chips.push({ key: "owner", label, remove: () => onApply({ ...value, owner: "all" }) });
    }
    if (value.noTouchToday) chips.push({ key: "touch", label: "Sem contato hoje", remove: () => onApply({ ...value, noTouchToday: false }) });
    value.tags.forEach((id) => chips.push({ key: `t${id}`, label: nome(tags, id), remove: () => onApply({ ...value, tags: value.tags.filter((x) => x !== id) }) }));
    value.products.forEach((id) => chips.push({ key: `p${id}`, label: nome(products, id), remove: () => onApply({ ...value, products: value.products.filter((x) => x !== id) }) }));
    if (value.date !== "all") chips.push({ key: "date", label: dateLabel(value), remove: () => onApply({ ...value, date: "all", dateStart: "", dateEnd: "" }) });

    return (
        <div className="flex items-center gap-2 min-w-0">
            <div ref={wrapRef} className="relative shrink-0">
                <button
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all shadow-sm ${
                        active > 0 || open
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                >
                    <SlidersHorizontal size={15} strokeWidth={2.5} />
                    Filtros
                    {active > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{active}</span>
                    )}
                </button>

                {open && (
                    <div className="absolute left-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 flex flex-col max-h-[75vh] animate-in fade-in slide-in-from-top-1">
                        <div className="overflow-y-auto p-4 space-y-4">
                            {/* Situação */}
                            <div className="space-y-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Situação</span>
                                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                                    {(["active", "lost"] as const).map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setDraft((d) => ({ ...d, status: s }))}
                                            className={`py-1.5 rounded-md text-xs font-bold transition-colors ${draft.status === s ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                        >
                                            {s === "active" ? "Ativas" : "Perdidas"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Responsável */}
                            <div className="space-y-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Responsável</span>
                                <select
                                    value={draft.owner === "loading" ? currentUserId || "all" : draft.owner}
                                    onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:border-indigo-400"
                                >
                                    <option value="all">Todos</option>
                                    {teamMembers.map((m) => (
                                        <option key={m.id} value={m.id}>{m.id === currentUserId ? "Meus leads" : m.full_name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Cadência */}
                            <label className="flex items-center justify-between gap-3 cursor-pointer">
                                <span>
                                    <span className="block text-sm font-semibold text-slate-700">Só sem contato hoje</span>
                                    <span className="block text-[11px] text-slate-500">Fila de cadência: o lead some ao registrar o contato</span>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={draft.noTouchToday}
                                    onChange={(e) => setDraft((d) => ({ ...d, noTouchToday: e.target.checked }))}
                                    className="w-4 h-4 accent-indigo-600 shrink-0"
                                />
                            </label>

                            <div className="border-t border-slate-100" />

                            {/* Etiquetas */}
                            <Section
                                title="Etiquetas"
                                summary={draft.tags.length ? `${draft.tags.length} selecionada${draft.tags.length > 1 ? "s" : ""}` : "Todas"}
                                open={section === "tags"}
                                onToggle={() => setSection((s) => (s === "tags" ? null : "tags"))}
                            >
                                <CheckList options={tags} selected={draft.tags} onToggle={(id) => toggleIn("tags", id)} empty="Nenhuma etiqueta criada." />
                            </Section>

                            {/* Período */}
                            <Section
                                title="Período de entrada"
                                summary={dateLabel(draft)}
                                open={section === "date"}
                                onToggle={() => setSection((s) => (s === "date" ? null : "date"))}
                            >
                                <div className="grid grid-cols-2 gap-1.5">
                                    {(Object.keys(DATE_LABEL) as DatePreset[]).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setDraft((d) => ({ ...d, date: p }))}
                                            className={`px-2 py-1.5 rounded-md border text-xs font-semibold text-left transition-colors ${draft.date === p ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                        >
                                            {DATE_LABEL[p]}
                                        </button>
                                    ))}
                                </div>
                                {draft.date === "custom" && (
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <label className="text-[11px] font-semibold text-slate-500">
                                            De
                                            <input type="date" value={draft.dateStart} max={draft.dateEnd || undefined}
                                                onChange={(e) => setDraft((d) => ({ ...d, dateStart: e.target.value }))}
                                                className="mt-0.5 w-full min-w-0 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700" />
                                        </label>
                                        <label className="text-[11px] font-semibold text-slate-500">
                                            Até
                                            <input type="date" value={draft.dateEnd} min={draft.dateStart || undefined}
                                                onChange={(e) => setDraft((d) => ({ ...d, dateEnd: e.target.value }))}
                                                className="mt-0.5 w-full min-w-0 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700" />
                                        </label>
                                    </div>
                                )}
                            </Section>

                            {/* Produtos */}
                            <Section
                                title="Produtos"
                                summary={draft.products.length ? `${draft.products.length} selecionado${draft.products.length > 1 ? "s" : ""}` : "Todos"}
                                open={section === "products"}
                                onToggle={() => setSection((s) => (s === "products" ? null : "products"))}
                            >
                                <CheckList options={products} selected={draft.products} onToggle={(id) => toggleIn("products", id)} empty="Nenhum produto cadastrado." />
                            </Section>
                        </div>

                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                            <button onClick={clearDraft} className="text-xs font-semibold text-slate-500 hover:text-rose-600 px-2 py-1.5">
                                Limpar tudo
                            </button>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setOpen(false)} className="text-xs font-bold text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100">
                                    Cancelar
                                </button>
                                <button onClick={apply} className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg shadow-sm">
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {chips.length > 0 && (
                <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                    {chips.map((c) => (
                        <span key={c.key} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                            {c.label}
                            <button onClick={c.remove} aria-label={`Tirar filtro ${c.label}`} className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700">
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                    {chips.length > 1 && (
                        <button
                            onClick={() => onApply({ ...EMPTY_FILTERS, owner: "all" })}
                            className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 whitespace-nowrap px-1"
                        >
                            Limpar
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function Section({ title, summary, open, onToggle, children }: { title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <div className="border border-slate-200 rounded-lg">
            <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="text-sm font-semibold text-slate-700">{title}</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                    <span className="truncate">{summary}</span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                </span>
            </button>
            {open && <div className="px-3 pb-3">{children}</div>}
        </div>
    );
}

function CheckList({ options, selected, onToggle, empty }: { options: Option[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
    if (!options.length) return <p className="text-xs text-slate-500 italic">{empty}</p>;
    return (
        <div className="max-h-48 overflow-y-auto space-y-0.5 -mx-1">
            {options.map((o) => {
                const id = String(o.id);
                const on = selected.includes(id);
                return (
                    <button
                        key={id}
                        onClick={() => onToggle(id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${on ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"}`}
                    >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white"}`}>
                            {on && <Check size={11} strokeWidth={3} className="text-white" />}
                        </span>
                        {o.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />}
                        <span className="truncate">{o.name}</span>
                    </button>
                );
            })}
        </div>
    );
}
