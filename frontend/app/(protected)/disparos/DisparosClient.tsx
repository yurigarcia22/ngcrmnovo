"use client";

import { useState, useEffect, useRef } from "react";
import {
    Send, Plus, Play, Pause, Trash2, Users, Upload, Clock, ArrowLeft,
    Loader2, Check, Megaphone, AlertTriangle, Smartphone, CheckCircle2, XCircle, WifiOff, Pencil, X, Search,
} from "lucide-react";
import { createCampaign, setCampaignStatus, deleteCampaign, getDispatchLive, updateCampaign, getCampaignRecipients } from "./actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Instance { instance_name: string; custom_name?: string; phone_number?: string; status: string; }
interface Campaign {
    id: string; name: string; instance_name: string; status: string;
    interval_min_sec: number; interval_max_sec: number; daily_cap: number;
    total: number; sent: number; failed: number; pending: number;
    instanceConnected?: boolean; last_sent_at?: string | null;
    messages?: string[]; business_hours_only?: boolean; pause_reason?: string | null;
}

// Numero com contagem animada (sobe suavemente ao mudar).
function CountUp({ value }: { value: number }) {
    const [display, setDisplay] = useState(value);
    const fromRef = useRef(value);
    useEffect(() => {
        const from = fromRef.current;
        const to = value;
        if (from === to) return;
        const start = performance.now();
        const dur = 600;
        let raf = 0;
        const tick = (t: number) => {
            const p = Math.min(1, (t - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
            setDisplay(Math.round(from + (to - from) * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
            else fromRef.current = to;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return <>{display.toLocaleString("pt-BR")}</>;
}

function relTime(iso?: string | null): string {
    if (!iso) return "—";
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 10) return "agora";
    if (s < 60) return `há ${s}s`;
    if (s < 3600) return `há ${Math.floor(s / 60)}min`;
    return `há ${Math.floor(s / 3600)}h`;
}

function etaLabel(c: Campaign): string {
    if (c.pending <= 0) return "";
    const avg = Math.max(60, (c.interval_min_sec + c.interval_max_sec) / 2); // cron ~1/min
    const secs = c.pending * avg;
    const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    return h > 0 ? `~${h}h ${m}min restantes` : `~${m}min restantes`;
}

const STATUS: Record<string, { t: string; cls: string }> = {
    draft: { t: "Rascunho", cls: "bg-slate-100 text-slate-600" },
    running: { t: "Disparando", cls: "bg-emerald-50 text-emerald-700" },
    paused: { t: "Pausada", cls: "bg-amber-50 text-amber-700" },
    done: { t: "Concluída", cls: "bg-sky-50 text-sky-700" },
};

export default function DisparosClient({ initialCampaigns, instances }: { initialCampaigns: Campaign[]; instances: Instance[] }) {
    const confirm = useConfirm();
    const [view, setView] = useState<"list" | "new">(initialCampaigns.length ? "list" : "new");
    const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
    const [editing, setEditing] = useState<Campaign | null>(null);
    const [detail, setDetail] = useState<Campaign | null>(null);

    const connected = instances.filter((i) => i.status === "connected");

    // Polling em tempo real enquanto houver campanha disparando.
    const hasRunning = campaigns.some((c) => c.status === "running");
    useEffect(() => {
        if (view !== "list" || !hasRunning) return;
        let active = true;
        const id = setInterval(async () => {
            const res = await getDispatchLive();
            if (active && res.success) setCampaigns(res.campaigns as Campaign[]);
        }, 4000);
        return () => { active = false; clearInterval(id); };
    }, [view, hasRunning]);

    async function toggle(c: Campaign) {
        const next = c.status === "running" ? "paused" : "running";
        setCampaigns((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
        const res = await setCampaignStatus(c.id, next as any);
        if (!res.success) { toast.error(res.error ?? "Erro"); window.location.reload(); }
        else toast.success(next === "running" ? "Disparo iniciado" : "Disparo pausado");
    }

    async function remove(c: Campaign) {
        const ok = await confirm({ title: "Excluir campanha?", description: "Os destinatários e o progresso serão apagados.", tone: "danger", confirmText: "Excluir" });
        if (!ok) return;
        setCampaigns((cs) => cs.filter((x) => x.id !== c.id));
        await deleteCampaign(c.id);
    }

    return (
        <div className="mx-auto max-w-5xl px-5 py-7 md:px-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Megaphone className="text-indigo-600" />
                    <h1 className="text-2xl font-bold text-slate-800">Disparos</h1>
                </div>
                {view === "list" ? (
                    <button onClick={() => setView("new")} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                        <Plus size={17} /> Nova campanha
                    </button>
                ) : (
                    <button onClick={() => setView("list")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800">
                        <ArrowLeft size={16} /> Voltar
                    </button>
                )}
            </div>

            {view === "new" ? (
                <NewCampaign connected={connected} onCreated={() => window.location.reload()} />
            ) : campaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center">
                    <Send className="mx-auto mb-3 text-slate-300" size={32} />
                    <p className="font-semibold text-slate-700">Nenhuma campanha ainda</p>
                    <button onClick={() => setView("new")} className="mt-3 text-indigo-600 font-semibold hover:underline">Criar a primeira</button>
                </div>
            ) : (
                <div className="space-y-3">
                    {campaigns.map((c) => {
                        const st = STATUS[c.status] ?? STATUS.draft;
                        const running = c.status === "running";
                        const sentPct = c.total ? (c.sent / c.total) * 100 : 0;
                        const failPct = c.total ? (c.failed / c.total) * 100 : 0;
                        const processed = c.sent + c.failed;
                        const successRate = processed ? Math.round((c.sent / processed) * 100) : null;
                        const disconnected = running && c.instanceConnected === false;
                        const pausedByDisconnect = c.status === "paused" && c.pause_reason === "numero_desconectado";
                        return (
                            <div key={c.id} onClick={() => setDetail(c)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer hover:border-indigo-300 hover:shadow transition-all">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-800 truncate">{c.name}</h3>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                                                {running && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>}
                                                {st.t}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                                            <Smartphone size={12} /> {c.instance_name} · intervalo {c.interval_min_sec}-{c.interval_max_sec}s · cap {c.daily_cap}/dia
                                            {running && c.last_sent_at && <span className="text-slate-400">· último envio {relTime(c.last_sent_at)}</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {(running || c.status === "paused" || c.status === "draft") && c.pending > 0 && (
                                            <button onClick={(e) => { e.stopPropagation(); toggle(c); }} aria-label={running ? "Pausar" : "Iniciar"}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${running ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                                                {running ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Iniciar</>}
                                            </button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); setEditing(c); }} aria-label="Editar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={15} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); remove(c); }} aria-label="Excluir" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                                    </div>
                                </div>

                                {/* Aviso: numero desconectou */}
                                {(disconnected || pausedByDisconnect) && (
                                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] font-medium text-rose-700">
                                        <WifiOff size={15} />
                                        {pausedByDisconnect
                                            ? "Pausada automaticamente: o número desconectou. Reconecte em Configurações → Conexões e clique Iniciar (os contatos pendentes foram preservados)."
                                            : "Número desconectado — o disparo não envia até reconectar em Configurações → Conexões."}
                                    </div>
                                )}

                                {/* Barra de progresso (2 cores: enviado + falha) */}
                                <div className="mt-3">
                                    <div className="flex h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: `${sentPct}%` }} />
                                        <div className="h-full bg-rose-400 transition-[width] duration-700 ease-out" style={{ width: `${failPct}%` }} />
                                    </div>

                                    {/* Stats animadas */}
                                    <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
                                        <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                                            <CheckCircle2 size={14} /> <span className="tabular-nums"><CountUp value={c.sent} /></span> enviados
                                            {successRate !== null && <span className="font-normal text-slate-400">({successRate}%)</span>}
                                        </span>
                                        {c.failed > 0 && (
                                            <span className="flex items-center gap-1.5 font-semibold text-rose-600">
                                                <XCircle size={14} /> <span className="tabular-nums"><CountUp value={c.failed} /></span> falhas
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1.5 text-slate-500">
                                            <Clock size={14} /> <span className="tabular-nums"><CountUp value={c.pending} /></span> pendentes
                                        </span>
                                        <span className="text-slate-400">de <span className="tabular-nums">{c.total.toLocaleString("pt-BR")}</span></span>
                                        {running && c.pending > 0 && <span className="ml-auto text-slate-400">{etaLabel(c)}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {editing && (
                <EditCampaignModal
                    campaign={editing}
                    onClose={() => setEditing(null)}
                    onSaved={(patch) => {
                        setCampaigns((cs) => cs.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)));
                        setEditing(null);
                    }}
                />
            )}

            {detail && (
                <CampaignDetailModal
                    campaign={detail}
                    onClose={() => setDetail(null)}
                    onEdit={() => { const c = detail; setDetail(null); setEditing(c); }}
                />
            )}
        </div>
    );
}

const DET_STATUS: Record<string, { t: string; dot: string; text: string }> = {
    sent: { t: "Enviado", dot: "bg-emerald-500", text: "text-emerald-700" },
    failed: { t: "Falhou", dot: "bg-rose-500", text: "text-rose-600" },
    pending: { t: "Pendente", dot: "bg-slate-300", text: "text-slate-500" },
    skipped: { t: "Pulado", dot: "bg-amber-400", text: "text-amber-600" },
};

function CampaignDetailModal({ campaign, onClose, onEdit }: { campaign: Campaign; onClose: () => void; onEdit: () => void }) {
    const [filter, setFilter] = useState<string>("all");
    const [recipients, setRecipients] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        getCampaignRecipients(campaign.id, filter).then((res) => {
            if (!active) return;
            setRecipients(res.recipients ?? []);
            setTotal(res.total ?? 0);
            setLoading(false);
        });
        return () => { active = false; };
    }, [campaign.id, filter]);

    const sentPct = campaign.total ? (campaign.sent / campaign.total) * 100 : 0;
    const failPct = campaign.total ? (campaign.failed / campaign.total) * 100 : 0;
    const successRate = campaign.sent + campaign.failed ? Math.round((campaign.sent / (campaign.sent + campaign.failed)) * 100) : null;
    const q = search.trim().toLowerCase();
    const shown = q ? recipients.filter((r) => (r.name || "").toLowerCase().includes(q) || (r.phone || "").includes(q)) : recipients;

    const tabs = [
        { k: "all", label: `Todos (${campaign.total})` },
        { k: "sent", label: `Enviados (${campaign.sent})` },
        { k: "failed", label: `Falhas (${campaign.failed})` },
        { k: "pending", label: `Pendentes (${campaign.pending})` },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Detalhe da campanha" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="flex w-full max-w-2xl max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-800 truncate">{campaign.name}</h2>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                            <Smartphone size={12} /> {campaign.instance_name} · intervalo {campaign.interval_min_sec}-{campaign.interval_max_sec}s · cap {campaign.daily_cap}/dia
                            {campaign.instanceConnected === false && <span className="text-rose-600 font-semibold flex items-center gap-1"><WifiOff size={12} /> desconectado</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={onEdit} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 flex items-center gap-1"><Pencil size={13} /> Editar</button>
                        <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
                    </div>
                </div>

                {/* Resumo + barra */}
                <div className="px-5 pt-4">
                    <div className="flex h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${sentPct}%` }} />
                        <div className="h-full bg-rose-400 transition-[width] duration-700" style={{ width: `${failPct}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
                        <span className="font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> {campaign.sent} enviados {successRate !== null && <span className="font-normal text-slate-400">({successRate}%)</span>}</span>
                        {campaign.failed > 0 && <span className="font-semibold text-rose-600 flex items-center gap-1"><XCircle size={14} /> {campaign.failed} falhas</span>}
                        <span className="text-slate-500 flex items-center gap-1"><Clock size={14} /> {campaign.pending} pendentes</span>
                    </div>
                </div>

                {/* Mensagens usadas */}
                {campaign.messages && campaign.messages.length > 0 && (
                    <div className="px-5 pt-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Mensagens ({campaign.messages.length} {campaign.messages.length === 1 ? "variação" : "variações"})</p>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto">
                            {campaign.messages.map((m, i) => (
                                <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-[12px] text-slate-600 whitespace-pre-wrap line-clamp-3">{m}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabs de status */}
                <div className="px-5 pt-4 flex items-center gap-1.5 flex-wrap">
                    {tabs.map((t) => (
                        <button key={t.k} onClick={() => setFilter(t.k)}
                            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${filter === t.k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Busca */}
                <div className="px-5 pt-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou telefone..." className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                </div>

                {/* Lista de destinatarios */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-300" size={22} /></div>
                    ) : shown.length === 0 ? (
                        <p className="text-center text-sm text-slate-400 py-8">Nenhum contato {filter !== "all" ? "nesse status" : ""}.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {shown.map((r) => {
                                const ds = DET_STATUS[r.status] ?? DET_STATUS.pending;
                                return (
                                    <li key={r.id} className="flex items-center gap-3 py-2">
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${ds.dot}`} />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium text-slate-800 truncate">{r.name || "—"}</div>
                                            <div className="text-[12px] text-slate-500 font-mono">{r.phone}{r.error ? <span className="ml-2 font-sans text-rose-500">· {String(r.error).slice(0, 60)}</span> : ""}</div>
                                        </div>
                                        <span className={`text-[11px] font-semibold shrink-0 ${ds.text}`}>{ds.t}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {!loading && total > shown.length && q === "" && (
                        <p className="text-center text-[12px] text-slate-400 pt-2">mostrando {shown.length} de {total}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function EditCampaignModal({ campaign, onClose, onSaved }: { campaign: Campaign; onClose: () => void; onSaved: (patch: Partial<Campaign>) => void }) {
    const [name, setName] = useState(campaign.name);
    const [messages, setMessages] = useState<string[]>(campaign.messages?.length ? campaign.messages : [""]);
    const [intervalMin, setIntervalMin] = useState(campaign.interval_min_sec);
    const [intervalMax, setIntervalMax] = useState(campaign.interval_max_sec);
    const [dailyCap, setDailyCap] = useState(campaign.daily_cap);
    const [businessHours, setBusinessHours] = useState(campaign.business_hours_only !== false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function save() {
        const msgs = messages.map((m) => m.trim()).filter(Boolean);
        if (msgs.length === 0) { toast.error("Escreva ao menos uma mensagem."); return; }
        setSaving(true);
        const res = await updateCampaign(campaign.id, {
            name, messages: msgs, intervalMinSec: intervalMin, intervalMaxSec: intervalMax,
            dailyCap, businessHoursOnly: businessHours,
        });
        setSaving(false);
        if (res.success) {
            toast.success("Campanha atualizada!");
            onSaved({ name, messages: msgs, interval_min_sec: intervalMin, interval_max_sec: intervalMax, daily_cap: dailyCap, business_hours_only: businessHours });
        } else {
            toast.error(res.error ?? "Erro ao salvar.");
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Editar campanha" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Editar campanha</h2>
                    <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
                </div>

                {campaign.status === "running" && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-800">
                        <AlertTriangle size={15} /> A campanha está disparando — as alterações valem para os próximos envios.
                    </div>
                )}

                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="ed-inp mb-4" />

                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mensagens (use {"{nome}"}; até 3 variações)</label>
                <div className="space-y-2 mb-4">
                    {messages.map((m, i) => (
                        <textarea key={i} value={m} onChange={(e) => setMessages((ms) => ms.map((x, j) => (j === i ? e.target.value : x)))} rows={4} className="ed-inp resize-y font-mono text-[13px]" placeholder={i === 0 ? "Oi {nome}! ..." : "Variação " + (i + 1)} />
                    ))}
                    {messages.length < 3 && (
                        <button onClick={() => setMessages((ms) => [...ms, ""])} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"><Plus size={13} /> Adicionar variação</button>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Intervalo mín (s)</label><input type="number" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} className="ed-inp" /></div>
                    <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Intervalo máx (s)</label><input type="number" value={intervalMax} onChange={(e) => setIntervalMax(Number(e.target.value))} className="ed-inp" /></div>
                    <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Cap diário</label><input type="number" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} className="ed-inp" /></div>
                    <label className="flex items-end gap-2 text-sm text-slate-600 pb-2"><input type="checkbox" checked={businessHours} onChange={(e) => setBusinessHours(e.target.checked)} /> Só 8h-20h</label>
                </div>

                <div className="flex gap-2">
                    <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar alterações
                    </button>
                    <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                </div>

                <style jsx>{`.ed-inp{width:100%;padding:0.55rem 0.7rem;border:1px solid #e2e8f0;border-radius:0.6rem;font-size:0.875rem;color:#1e293b;outline:none}.ed-inp:focus{box-shadow:0 0 0 2px #c7d2fe}`}</style>
            </div>
        </div>
    );
}

function NewCampaign({ connected, onCreated }: { connected: Instance[]; onCreated: () => void }) {
    const [name, setName] = useState("");
    const [instanceName, setInstanceName] = useState(connected[0]?.instance_name ?? "");
    const [recipients, setRecipients] = useState("");
    const [messages, setMessages] = useState<string[]>([""]);
    const [intervalMin, setIntervalMin] = useState(40);
    const [intervalMax, setIntervalMax] = useState(120);
    const [dailyCap, setDailyCap] = useState(200);
    const [businessHours, setBusinessHours] = useState(true);
    const [saving, setSaving] = useState(false);

    const lineCount = recipients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;

    function loadFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => setRecipients((prev) => (prev ? prev + "\n" : "") + String(reader.result || ""));
        reader.readAsText(file);
    }

    async function submit() {
        if (connected.length === 0) { toast.error("Nenhum número conectado. Conecte um WhatsApp em Configurações."); return; }
        setSaving(true);
        const res = await createCampaign({
            name, instanceName, messages, intervalMinSec: intervalMin, intervalMaxSec: intervalMax,
            dailyCap, businessHoursOnly: businessHours, recipientsRaw: recipients,
        });
        setSaving(false);
        if (res.success) {
            toast.success(`Campanha criada: ${res.total} contatos${res.invalid ? `, ${res.invalid} inválidos` : ""}${res.duplicates ? `, ${res.duplicates} duplicados` : ""}`);
            onCreated();
        } else {
            toast.error(res.error ?? "Erro ao criar campanha.");
        }
    }

    return (
        <div className="space-y-5">
            {connected.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle size={16} /> Nenhum número conectado. Conecte um WhatsApp em Configurações → Conexões antes de disparar.
                </div>
            )}

            <Field label="Nome da campanha">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promoção vacinação junho" className="inp" />
            </Field>

            <Field label="Número que vai disparar">
                <select value={instanceName} onChange={(e) => setInstanceName(e.target.value)} className="inp bg-white">
                    {connected.length === 0 && <option value="">— nenhum conectado —</option>}
                    {connected.map((i) => (
                        <option key={i.instance_name} value={i.instance_name}>{i.custom_name || i.instance_name} {i.phone_number ? `(+${i.phone_number})` : ""}</option>
                    ))}
                </select>
            </Field>

            <Field label={`Contatos (um por linha: nome;telefone) — ${lineCount} linha(s)`}>
                <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={6}
                    placeholder={"Maria;5531999990000\nJoão;5531988887777\n5531977776666"}
                    className="inp font-mono text-[13px] resize-y" />
                <label className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 cursor-pointer hover:text-indigo-800">
                    <Upload size={14} /> Importar CSV / TXT
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
                </label>
            </Field>

            <Field label="Mensagens (use {nome}; até 3 variações — o sistema sorteia uma, reduz bloqueio)">
                <div className="space-y-2">
                    {messages.map((m, i) => (
                        <textarea key={i} value={m} onChange={(e) => setMessages((ms) => ms.map((x, j) => (j === i ? e.target.value : x)))} rows={2}
                            placeholder={i === 0 ? "Oi {nome}! Tudo bem? ..." : "Variação " + (i + 1)} className="inp resize-y" />
                    ))}
                    {messages.length < 3 && (
                        <button onClick={() => setMessages((ms) => [...ms, ""])} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"><Plus size={13} /> Adicionar variação</button>
                    )}
                </div>
            </Field>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Intervalo mín (s)"><input type="number" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} className="inp" /></Field>
                <Field label="Intervalo máx (s)"><input type="number" value={intervalMax} onChange={(e) => setIntervalMax(Number(e.target.value))} className="inp" /></Field>
                <Field label="Cap diário"><input type="number" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} className="inp" /></Field>
                <label className="flex items-end gap-2 text-sm text-slate-600 pb-2">
                    <input type="checkbox" checked={businessHours} onChange={(e) => setBusinessHours(e.target.checked)} /> Só 8h-20h
                </label>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-500">
                <Clock size={14} /> A campanha é criada como rascunho. Clique em <b className="text-slate-700">Iniciar</b> na lista pra começar a disparar (precisa do cron de disparo agendado).
            </div>

            <button onClick={submit} disabled={saving || connected.length === 0} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Criar campanha
            </button>

            <style jsx>{`.inp{width:100%;padding:0.55rem 0.7rem;border:1px solid #e2e8f0;border-radius:0.6rem;font-size:0.875rem;color:#1e293b;outline:none}.inp:focus{box-shadow:0 0 0 2px #c7d2fe}`}</style>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
            {children}
        </div>
    );
}
