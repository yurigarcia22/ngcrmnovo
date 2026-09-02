"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
    BrainCircuit, Sparkles, Settings2, Search, Clock, CalendarCheck2, AlertTriangle,
    Flame, MessageSquareText, RefreshCw, ChevronRight, Loader2, PhoneIncoming,
} from "lucide-react";
import { getAiPageData, getAiConversationDetail, updateAiSettings, getAiMappingData, saveAiStageMappings, applyClinicFunnel } from "./actions";

// ---------- vocabulario dos estados da IA ----------
const STAGE_META: Record<string, { label: string; cls: string; group: string }> = {
    NEW_LEAD:          { label: "Novo lead",          cls: "bg-indigo-50 text-indigo-700 border-indigo-200",   group: "aberto" },
    QUALIFYING:        { label: "Qualificando",       cls: "bg-blue-50 text-blue-700 border-blue-200",         group: "aberto" },
    QUALIFIED:         { label: "Qualificado",        cls: "bg-sky-50 text-sky-700 border-sky-200",            group: "aberto" },
    SCHEDULING:        { label: "Agendando",          cls: "bg-amber-50 text-amber-700 border-amber-200",      group: "aberto" },
    SCHEDULED:         { label: "Agendado",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200", group: "ganho" },
    AWAITING_CUSTOMER: { label: "Aguardando cliente", cls: "bg-slate-100 text-slate-600 border-slate-200",     group: "espera" },
    AWAITING_BUSINESS: { label: "Aguardando clínica", cls: "bg-rose-50 text-rose-700 border-rose-200",         group: "espera" },
    NO_RESPONSE:       { label: "Sem resposta",       cls: "bg-slate-100 text-slate-500 border-slate-200",     group: "espera" },
    LOST_PRICE:        { label: "Perda sugerida · preço",           cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_AVAILABILITY: { label: "Perda sugerida · disponibilidade", cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_NO_RESPONSE:  { label: "Perda sugerida · sem resposta",    cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_NOT_OFFERED:  { label: "Perda sugerida · sem oferta",      cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_SERVICE_UNAVAILABLE: { label: "Perda sugerida · serviço indisponível", cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_OTHER:        { label: "Perda sugerida",     cls: "bg-rose-50 text-rose-700 border-rose-200",         group: "perda" },
    EXISTING_PATIENT:  { label: "Paciente existente", cls: "bg-teal-50 text-teal-700 border-teal-200",         group: "outro" },
    NON_COMMERCIAL:    { label: "Não comercial",      cls: "bg-slate-100 text-slate-500 border-slate-200",     group: "outro" },
    COMPLETED:         { label: "Concluído",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200", group: "ganho" },
};
const stageMeta = (s?: string | null) => STAGE_META[s ?? ""] ?? { label: s ?? "—", cls: "bg-slate-100 text-slate-500 border-slate-200", group: "outro" };

const EVENT_LABEL: Record<string, string> = {
    ai_stage_changed: "Estágio atualizado pela IA",
    appointment_confirmed: "Agendamento confirmado detectado",
    ai_suggested_lost: "IA sugeriu perda",
    origin_declared: "Origem declarada na conversa",
    origin_detected: "Origem detectada (anúncio)",
};

function scoreCls(n?: number | null) {
    if (n == null) return "bg-slate-100 text-slate-500";
    if (n >= 80) return "bg-emerald-100 text-emerald-700";
    if (n >= 60) return "bg-amber-100 text-amber-700";
    if (n >= 40) return "bg-blue-100 text-blue-700";
    return "bg-slate-100 text-slate-500";
}

function waitingText(row: any): string | null {
    if (row.waiting_on !== "BUSINESS" || !row.waiting_since) return null;
    const min = Math.max(0, Math.round((Date.now() - new Date(row.waiting_since).getTime()) / 60000));
    if (min < 60) return `há ${min} min`;
    if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
    return `há ${Math.round(min / 1440)} d`;
}

const ORIGIN_LABEL: Record<string, string> = {
    meta_ads: "Meta Ads", google: "Google", site: "Site", indicacao: "Indicação",
    instagram: "Instagram", organico: "Orgânico", outro: "Outro",
};
function originOf(row: any): { label: string; cls: string } | null {
    const o = row.deal?.origin ?? row.origin_guess;
    if (!o || o === "desconhecido") return null;
    const label = ORIGIN_LABEL[o] ?? o;
    const cls = o === "meta_ads" ? "bg-blue-100 text-blue-700" : "bg-violet-50 text-violet-700";
    return { label, cls };
}

function fmtDay(d?: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function fmtDate(d?: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// =====================================================================
export default function InteligenciaPage() {
    const queryClient = useQueryClient();
    const pageQuery = useQuery({
        queryKey: ["ai", "page"],
        queryFn: async () => {
            const r = await getAiPageData();
            if (!r.success) throw new Error(r.error);
            return r;
        },
        refetchInterval: 60_000, // o motor roda a cada 2 min; manter fresco
    });

    const settings: any = pageQuery.data?.settings;
    const states: any[] = (pageQuery.data?.states as any[]) ?? [];
    const isAdmin = !!pageQuery.data?.isAdmin;

    // filtros
    const [search, setSearch] = useState("");
    const [stageFilter, setStageFilter] = useState("all");
    const [onlyHot, setOnlyHot] = useState(false);
    // Periodo: filtra pela ULTIMA ATIVIDADE analisada (updated_at do estado IA)
    const [period, setPeriod] = useState<"hoje" | "7d" | "30d" | "all" | "custom">("7d");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [detailDeal, setDetailDeal] = useState<any | null>(null);
    const [showConfig, setShowConfig] = useState(false);

    const inPeriod = useMemo(() => {
        const now = new Date();
        let from: Date | null = null;
        let to: Date | null = null;
        if (period === "hoje") { from = new Date(now); from.setHours(0, 0, 0, 0); }
        else if (period === "7d") from = new Date(now.getTime() - 7 * 86400_000);
        else if (period === "30d") from = new Date(now.getTime() - 30 * 86400_000);
        else if (period === "custom") {
            if (customFrom) from = new Date(customFrom + "T00:00:00");
            if (customTo) { to = new Date(customTo + "T23:59:59"); }
        }
        return (row: any) => {
            // Periodo = data da ultima MENSAGEM da conversa (last_analyzed_message_at),
            // nao da analise: a re-analise em massa re-toca updated_at e mentiria.
            const d = new Date(row.last_analyzed_message_at ?? row.updated_at ?? 0);
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        };
    }, [period, customFrom, customTo]);

    const periodStates = useMemo(() => states.filter(inPeriod), [states, inPeriod]);
    const open = periodStates.filter((s) => s.deal?.status === "open");
    const overview = useMemo(() => ({
        analisadas: periodStates.length,
        altaIntencao: open.filter((s) => (s.intent_score ?? 0) >= 70 && stageMeta(s.funnel_stage).group === "aberto").length,
        aguardandoClinica: open.filter((s) => s.waiting_on === "BUSINESS").length,
        agendamentos: periodStates.filter((s) => s.appointment?.confirmed).length,
        perdasSugeridas: open.filter((s) => !!s.lost_suggestion).length,
    }), [periodStates]);

    const pipeline = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of open) map.set(s.funnel_stage ?? "—", (map.get(s.funnel_stage ?? "—") ?? 0) + 1);
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [periodStates]);

    const list = useMemo(() => {
        let rows = [...open];
        if (stageFilter !== "all") rows = rows.filter((r) => r.funnel_stage === stageFilter);
        if (onlyHot) rows = rows.filter((r) => (r.intent_score ?? 0) >= 70);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            rows = rows.filter((r) =>
                (r.deal?.contact?.name ?? "").toLowerCase().includes(q) ||
                (r.deal?.title ?? "").toLowerCase().includes(q) ||
                (r.service_interest ?? []).join(" ").toLowerCase().includes(q));
        }
        return rows.sort((a, b) => (b.intent_score ?? 0) - (a.intent_score ?? 0));
    }, [periodStates, stageFilter, onlyHot, search]);

    // ---------- estados de carregamento / desativado ----------
    if (pageQuery.isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-slate-500 gap-2">
                <Loader2 className="animate-spin" size={18} /> Carregando inteligência...
            </div>
        );
    }

    const enabled = !!settings?.enabled;

    return (
        <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                            <BrainCircuit size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Inteligência</h1>
                            <p className="text-xs text-slate-500">
                                A IA observa as conversas do WhatsApp e transforma em dados — sem enviar nenhuma mensagem.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                            {enabled ? "● Observando" : "Desativada"}
                        </span>
                        <button
                            onClick={() => pageQuery.refetch()}
                            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            title="Atualizar" aria-label="Atualizar dados"
                        >
                            <RefreshCw size={15} className={pageQuery.isFetching ? "animate-spin" : ""} />
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setShowConfig(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50"
                            >
                                <Settings2 size={15} /> Configurar
                            </button>
                        )}
                    </div>
                </div>

                {!enabled ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                        <Sparkles className="mx-auto text-indigo-400 mb-3" size={32} />
                        <h2 className="text-lg font-bold text-slate-800 mb-1">A IA ainda não está ativa nesta conta</h2>
                        <p className="text-sm text-slate-500 max-w-md mx-auto">
                            Quando ativada, ela analisa cada conversa do WhatsApp: intenção de compra, serviço buscado,
                            agendamentos, esperas e oportunidades perdidas — tudo automático, sem mudar sua rotina.
                        </p>
                        {isAdmin && (
                            <button
                                onClick={() => setShowConfig(true)}
                                className="mt-5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                            >
                                Ativar agora
                            </button>
                        )}
                    </div>
                ) : (
                <>
                {/* Filtro de período */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        {([["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["all", "Tudo"], ["custom", "Período"]] as const).map(([k, l]) => (
                            <button
                                key={k}
                                onClick={() => setPeriod(k)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                    period === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                    {period === "custom" && (
                        <div className="flex items-center gap-1.5">
                            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                                aria-label="Data inicial"
                                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 bg-white" />
                            <span className="text-xs text-slate-400">até</span>
                            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                                aria-label="Data final"
                                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 bg-white" />
                        </div>
                    )}
                    <span className="ml-auto text-[11px] text-slate-400">
                        Filtra pela última mensagem de cada conversa
                    </span>
                </div>

                {/* Visão geral */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                    {[
                        { label: "Conversas analisadas", value: overview.analisadas, Icon: MessageSquareText, cls: "text-indigo-600" },
                        { label: "Alta intenção abertas", value: overview.altaIntencao, Icon: Flame, cls: "text-amber-600" },
                        { label: "Aguardando clínica", value: overview.aguardandoClinica, Icon: PhoneIncoming, cls: "text-rose-600" },
                        { label: "Agendamentos detectados", value: overview.agendamentos, Icon: CalendarCheck2, cls: "text-emerald-600" },
                        { label: "Perdas sugeridas", value: overview.perdasSugeridas, Icon: AlertTriangle, cls: "text-rose-500" },
                    ].map((c) => (
                        <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-1">
                                <c.Icon size={16} className={c.cls} />
                            </div>
                            <div className="text-2xl font-bold text-slate-800">{c.value}</div>
                            <div className="text-[11px] text-slate-500 font-medium">{c.label}</div>
                        </div>
                    ))}
                </div>

                {/* Pipeline IA */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                    <h2 className="text-sm font-bold text-slate-700 mb-3">Pipeline visto pela IA <span className="font-normal text-slate-400">(conversas abertas)</span></h2>
                    {pipeline.length === 0 ? (
                        <p className="text-sm text-slate-400">Nenhuma conversa aberta analisada ainda.</p>
                    ) : (
                        <div className="space-y-2">
                            {pipeline.map(([stage, n]) => {
                                const meta = stageMeta(stage);
                                const pct = Math.max(6, Math.round((n / open.length) * 100));
                                return (
                                    <button
                                        key={stage}
                                        onClick={() => setStageFilter(stageFilter === stage ? "all" : stage)}
                                        className="w-full flex items-center gap-3 group"
                                        title={`Filtrar por ${meta.label}`}
                                    >
                                        <span className={`w-52 shrink-0 text-left text-[11px] font-bold px-2 py-1 rounded-md border ${meta.cls} ${stageFilter === stage ? "ring-2 ring-indigo-300" : ""}`}>
                                            {meta.label}
                                        </span>
                                        <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                                            <div className="h-full bg-indigo-500/80 group-hover:bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-8 text-right text-sm font-bold text-slate-700">{n}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Origem dos contatos */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                    <h2 className="text-sm font-bold text-slate-700 mb-3">Origem dos contatos <span className="font-normal text-slate-400">(no período)</span></h2>
                    <div className="flex flex-wrap gap-2">
                        {(() => {
                            const counts = new Map<string, number>();
                            for (const r of periodStates) {
                                const o = (r as any).deal?.origin ?? (r as any).origin_guess ?? "nao_identificada";
                                counts.set(o, (counts.get(o) ?? 0) + 1);
                            }
                            const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
                            return entries.map(([o, n]) => (
                                <span key={o} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                    o === "meta_ads" ? "bg-blue-100 text-blue-700"
                                    : o === "nao_identificada" ? "bg-slate-100 text-slate-500"
                                    : "bg-violet-50 text-violet-700"}`}>
                                    {o === "nao_identificada" ? "Não identificada" : (ORIGIN_LABEL[o] ?? o)} · {n}
                                </span>
                            ));
                        })()}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                        Meta Ads vem do próprio anúncio clicado; as demais são declaradas pelo cliente na conversa.
                    </p>
                </div>

                {/* Lista de conversas */}
                <div className="bg-white border border-slate-200 rounded-xl">
                    <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por nome ou serviço..."
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                        </div>
                        <button
                            onClick={() => setOnlyHot(!onlyHot)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${onlyHot ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                        >
                            <Flame size={14} /> Alta intenção
                        </button>
                        {stageFilter !== "all" && (
                            <button onClick={() => setStageFilter("all")} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100">
                                {stageMeta(stageFilter).label} ✕
                            </button>
                        )}
                        <span className="ml-auto text-xs text-slate-400">{list.length} conversa(s)</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {list.length === 0 && (
                            <p className="p-8 text-center text-sm text-slate-400">Nada por aqui com esses filtros.</p>
                        )}
                        {list.map((row) => {
                            const meta = stageMeta(row.funnel_stage);
                            const wait = waitingText(row);
                            const contact = row.deal?.contact;
                            return (
                                <button
                                    key={row.deal_id}
                                    onClick={() => setDetailDeal(row)}
                                    className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-3"
                                >
                                    {contact?.photo_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={contact.photo_url} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                                    ) : (
                                        <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                                            {(contact?.name ?? "?").slice(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-800 text-sm truncate">{contact?.name ?? row.deal?.title ?? "—"}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${meta.cls}`}>{meta.label}</span>
                                            {(row.service_interest ?? []).slice(0, 2).map((s: string) => (
                                                <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{s}</span>
                                            ))}
                                            {wait && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                                                    <Clock size={10} /> clínica {wait}
                                                </span>
                                            )}
                                            {(() => { const o = originOf(row); return o ? (
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${o.cls}`}>{o.label}</span>
                                            ) : null; })()}
                                        </div>
                                        <p className="text-xs text-slate-500 truncate mt-0.5">
                                            {row.first_contact_at && <span className="text-slate-400">1º contato {fmtDay(row.first_contact_at)} · </span>}
                                            {row.summary ?? "Sem resumo ainda."}
                                        </p>
                                    </div>
                                    <div className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold ${scoreCls(row.intent_score)}`}
                                        title={`Intenção comercial: ${row.intent_score ?? "?"}/100`}>
                                        {row.intent_score ?? "–"}
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                </div>
                </>
                )}
            </div>

            {detailDeal && (
                <ConversationDetail row={detailDeal} onClose={() => setDetailDeal(null)} />
            )}
            {showConfig && (
                <ConfigDialog
                    settings={settings}
                    onClose={() => setShowConfig(false)}
                    onSaved={() => { setShowConfig(false); queryClient.invalidateQueries({ queryKey: ["ai", "page"] }); }}
                />
            )}
        </div>
    );
}

// =====================================================================
function ConversationDetail({ row, onClose }: { row: any; onClose: () => void }) {
    const detail = useQuery({
        queryKey: ["ai", "detail", row.deal_id],
        queryFn: async () => {
            const r = await getAiConversationDetail(row.deal_id);
            if (!r.success) throw new Error(r.error);
            return r;
        },
    });
    const meta = stageMeta(row.funnel_stage);
    const facts: any[] = detail.data?.analysis?.structured_output?.facts ?? [];
    const extracted = row.extracted ?? {};

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-4xl bg-white p-0 overflow-hidden max-h-[85vh] flex flex-col">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <DialogTitle className="text-lg font-bold text-slate-800">
                            {row.deal?.contact?.name ?? row.deal?.title}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${meta.cls}`}>{meta.label}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${scoreCls(row.intent_score)}`}>intenção {row.intent_score ?? "?"}/100</span>
                            {row.deal?.origin === "meta_ads" && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Meta Ads</span>}
                            {row.first_contact_at && <span className="text-slate-400">1º contato em {fmtDay(row.first_contact_at)}</span>}
                        </DialogDescription>
                    </div>
                    <a href={`/deals/${row.deal_id}`} className="text-xs font-semibold text-indigo-600 hover:underline shrink-0">
                        Abrir negócio →
                    </a>
                </div>

                <div className="grid md:grid-cols-2 gap-0 overflow-hidden flex-1 min-h-0">
                    {/* Conversa */}
                    <div className="border-r border-slate-100 overflow-y-auto p-4 bg-slate-50/60">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Conversa (últimas mensagens)</h3>
                        {detail.isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
                        <div className="space-y-1.5">
                            {(detail.data?.messages ?? []).map((m: any) => (
                                <div key={m.id} className={`max-w-[85%] px-3 py-1.5 rounded-lg text-[13px] leading-snug ${
                                    m.direction === "inbound"
                                        ? "bg-white border border-slate-200 text-slate-700"
                                        : "bg-indigo-600 text-white ml-auto"
                                }`}>
                                    {m.type && m.type !== "text" && !m.content
                                        ? <em className="opacity-70">[{m.type}]</em>
                                        : m.content}
                                    <div className={`text-[9px] mt-0.5 ${m.direction === "inbound" ? "text-slate-400" : "text-indigo-200"}`}>{fmtDate(m.created_at)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Analise */}
                    <div className="overflow-y-auto p-4 space-y-4">
                        <div>
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Resumo da IA</h3>
                            <p className="text-sm text-slate-700">{row.summary ?? "—"}</p>
                        </div>
                        {row.next_action && (
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                                <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-0.5">Próxima ação sugerida</h3>
                                <p className="text-sm text-indigo-900 font-medium">{row.next_action}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-center">
                            {[
                                { l: "Pediu preço", v: row.price?.requested }, { l: "Preço informado", v: row.price?.provided },
                                { l: "Pediu horário", v: row.appointment?.requested }, { l: "Agendou", v: row.appointment?.confirmed },
                            ].map((f) => (
                                <div key={f.l} className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${f.v ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                                    {f.v ? "✓ " : "· "}{f.l}
                                </div>
                            ))}
                        </div>
                        {row.lost_suggestion && (
                            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                                <h3 className="text-[11px] font-bold text-rose-600 uppercase tracking-wide mb-0.5">⚠ Possível oportunidade perdida</h3>
                                <p className="text-sm text-rose-800">{row.lost_suggestion.reason ?? "Motivo não especificado"} <span className="text-rose-500">(confiança {(Number(row.lost_suggestion.confidence ?? 0) * 100).toFixed(0)}%)</span></p>
                            </div>
                        )}
                        {facts.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fatos identificados</h3>
                                <ul className="space-y-1">
                                    {facts.map((f: any, i: number) => (
                                        <li key={i} className="text-[13px] text-slate-600 flex gap-1.5">
                                            <span className="text-indigo-400 shrink-0">•</span> {f.fact}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {(extracted.reported_symptoms?.length > 0 || extracted.animal_name) && (
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Dados extraídos</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {extracted.animal_name && <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 text-[11px] font-semibold">🐾 {extracted.animal_name}</span>}
                                    {extracted.species && <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 text-[11px] font-semibold">{extracted.species}</span>}
                                    {(extracted.reported_symptoms ?? []).map((s: string) => (
                                        <span key={s} className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold">{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(detail.data?.events ?? []).length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Linha do tempo</h3>
                                <div className="space-y-1.5">
                                    {(detail.data!.events as any[]).map((e) => (
                                        <div key={e.id} className="text-[12px] text-slate-600 flex items-start gap-2">
                                            <span className="text-slate-300 shrink-0 tabular-nums">{fmtDate(e.created_at)}</span>
                                            <span>
                                                {EVENT_LABEL[e.event_type] ?? e.event_type}
                                                {e.new_value && <b className="text-slate-700"> → {stageMeta(e.new_value).label !== "—" && STAGE_META[e.new_value] ? stageMeta(e.new_value).label : e.new_value}</b>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// =====================================================================
function ConfigDialog({ settings, onClose, onSaved }: { settings: any; onClose: () => void; onSaved: () => void }) {
    const [enabled, setEnabled] = useState(!!settings?.enabled);
    const [mode, setMode] = useState<string>(settings?.mode ?? "observer");
    const [vertical, setVertical] = useState(settings?.vertical ?? "generic");
    const [analyzeFrom, setAnalyzeFrom] = useState((settings?.analyze_from ?? "").slice(0, 10));
    const [alertsEnabled, setAlertsEnabled] = useState(settings?.alerts_enabled !== false);
    const [dailyDigest, setDailyDigest] = useState(settings?.daily_digest !== false);
    const [saving, setSaving] = useState(false);

    // Mapeamento estado IA -> etapa do funil (Piloto)
    const AI_STAGES = [
        { key: "NEW_LEAD", label: "Novo lead" },
        { key: "QUALIFYING", label: "Qualificando" },
        { key: "QUALIFIED", label: "Qualificado" },
        { key: "SCHEDULING", label: "Agendando" },
        { key: "SCHEDULED", label: "Agendado" },
    ];
    const mappingQuery = useQuery({
        queryKey: ["ai", "mapping"],
        queryFn: async () => {
            const r = await getAiMappingData();
            if (!r.success) throw new Error(r.error);
            return r;
        },
    });
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const stages: any[] = (mappingQuery.data?.stages as any[]) ?? [];
    const pipeline: any = mappingQuery.data?.pipeline;
    const savedMappings = mappingQuery.data?.mappings as any[] | undefined;
    const hydrated = useMemo(() => {
        const base: Record<string, string> = {};
        for (const m of savedMappings ?? []) base[m.ai_stage] = String(m.stage_id);
        return base;
    }, [savedMappings]);
    const effective: Record<string, string> = { ...hydrated, ...mapping };

    async function save() {
        setSaving(true);
        // 1. mapeamento primeiro (o piloto exige mapeamento existente)
        if (pipeline && (mode === "pilot" || Object.keys(mapping).length > 0)) {
            const rows = AI_STAGES.map((a) => ({
                ai_stage: a.key,
                stage_id: effective[a.key] ? Number(effective[a.key]) : null,
            }));
            const rm = await saveAiStageMappings(pipeline.id, rows);
            if (!rm.success) { toast.error("Erro no mapeamento", rm.error); setSaving(false); return; }
        }
        // 2. settings
        const r = await updateAiSettings({
            enabled, vertical, mode,
            analyze_from: analyzeFrom ? new Date(analyzeFrom).toISOString() : null,
            alerts_enabled: alertsEnabled, daily_digest: dailyDigest,
        });
        setSaving(false);
        if (r.success) {
            const moved = (r as any).movedNow ?? 0;
            toast.success("Configuração salva", moved > 0 ? `Piloto organizou ${moved} lead(s) no funil agora.` : undefined);
            onSaved();
        }
        else toast.error("Erro ao salvar", r.error);
    }

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg bg-white p-6 max-h-[88vh] overflow-y-auto">
                <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Settings2 className="text-indigo-600" size={18} /> IA Inteligência
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                    A IA nunca envia mensagem a nenhum contato — ela observa, analisa e (no modo Piloto) organiza o funil.
                </DialogDescription>

                <label className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 p-3 cursor-pointer">
                    <span className="text-sm font-semibold text-slate-700">Análise ativada</span>
                    <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                </label>

                {/* Modo */}
                <div className="mt-3 space-y-2">
                    <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${mode === "observer" ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200"}`}>
                        <input type="radio" name="ai-mode" checked={mode === "observer"} onChange={() => setMode("observer")} className="mt-0.5" />
                        <span>
                            <span className="block text-sm font-semibold text-slate-800">👁 Observador</span>
                            <span className="block text-xs text-slate-500">Analisa e mostra tudo aqui. Não toca no funil.</span>
                        </span>
                    </label>
                    <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${mode === "pilot" ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200"}`}>
                        <input type="radio" name="ai-mode" checked={mode === "pilot"} onChange={() => setMode("pilot")} className="mt-0.5" />
                        <span>
                            <span className="block text-sm font-semibold text-slate-800">🚀 Piloto</span>
                            <span className="block text-xs text-slate-500">
                                Tudo do Observador + move os cards no funil conforme o mapeamento abaixo.
                                Nunca marca ganho nem perda (isso continua humano), nunca volta card pra trás
                                e só age com confiança ≥ {Math.round((settings?.min_confidence_move ?? 0.85) * 100)}%.
                            </span>
                        </span>
                    </label>
                </div>

                {/* Mapeamento (Piloto) */}
                {mode === "pilot" && (
                    <div className="mt-3 rounded-lg border border-slate-200 p-3">
                        <h3 className="text-xs font-bold text-slate-600 mb-2">
                            Mapeamento de etapas {pipeline ? <span className="font-normal text-slate-400">· funil {pipeline.name}</span> : null}
                        </h3>
                        {mappingQuery.isLoading ? (
                            <p className="text-xs text-slate-400">Carregando funil...</p>
                        ) : (
                            <div className="space-y-2">
                                {AI_STAGES.map((a) => (
                                    <div key={a.key} className="flex items-center gap-2">
                                        <span className="w-32 shrink-0 text-xs font-semibold text-slate-600">{a.label}</span>
                                        <span className="text-slate-300">→</span>
                                        <select
                                            value={effective[a.key] ?? ""}
                                            onChange={(e) => setMapping((m) => ({ ...m, [a.key]: e.target.value }))}
                                            aria-label={`Etapa para ${a.label}`}
                                            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800"
                                        >
                                            <option value="">— não mover —</option>
                                            {stages.map((st) => (
                                                <option key={st.id} value={String(st.id)}>{st.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                                <p className="text-[11px] text-slate-400">Etapas de ganho e perda não aparecem: fechar negócio é sempre decisão humana.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Funil padrao de clinica */}
                <ClinicFunnelButton onApplied={() => mappingQuery.refetch()} />

                {/* Alertas / resumo diario */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 cursor-pointer">
                        <span className="text-xs font-semibold text-slate-700">🔔 Alertas</span>
                        <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 cursor-pointer">
                        <span className="text-xs font-semibold text-slate-700">🧠 Resumo diário</span>
                        <input type="checkbox" checked={dailyDigest} onChange={(e) => setDailyDigest(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                    </label>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                    Alertas chegam no sininho dos administradores: lead quente aguardando resposta, possível perda e agendamento detectado.
                </p>

                <div className="mt-3">
                    <label htmlFor="ai-vertical" className="block text-xs font-semibold text-slate-600 mb-1.5">Segmento</label>
                    <select id="ai-vertical" value={vertical} onChange={(e) => setVertical(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800">
                        <option value="veterinary">Clínica veterinária</option>
                        <option value="dentistry">Clínica odontológica</option>
                        <option value="generic">Geral</option>
                    </select>
                </div>

                <div className="mt-3">
                    <label htmlFor="ai-from" className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Analisar conversas a partir de
                    </label>
                    <input id="ai-from" type="date" value={analyzeFrom} onChange={(e) => setAnalyzeFrom(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-800" />
                    <p className="text-[11px] text-slate-400 mt-1">Conversas mais antigas que essa data não são analisadas (evita custo com histórico morto).</p>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={save} disabled={saving}
                        className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
                        {saving && <Loader2 size={13} className="animate-spin" />} Salvar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ClinicFunnelButton({ onApplied }: { onApplied: () => void }) {
    const [arm, setArm] = useState(false);
    const [busy, setBusy] = useState(false);
    async function run() {
        if (!arm) { setArm(true); setTimeout(() => setArm(false), 4000); return; }
        setBusy(true);
        const r = await applyClinicFunnel();
        setBusy(false); setArm(false);
        if (r.success) { toast.success("Funil de clínica aplicado", "Etapas renomeadas e mapeamento da IA configurado."); onApplied(); }
        else toast.error("Não foi possível aplicar", r.error);
    }
    return (
        <div className="mt-3 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
            <p className="text-xs text-slate-600 mb-2">
                <b>Funil padrão de clínica:</b> transforma o funil de vendas em
                <b> Novo contato → Em conversa → Quer agendar → Agendado → Atendido / Perdido</b> e
                já configura o mapeamento da IA. Os cards existentes ficam onde estão.
            </p>
            <button onClick={run} disabled={busy}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                    arm ? "bg-amber-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"} disabled:opacity-50`}>
                {busy && <Loader2 size={12} className="animate-spin" />}
                {arm ? "Clique de novo para confirmar" : "Aplicar funil de clínica"}
            </button>
        </div>
    );
}
