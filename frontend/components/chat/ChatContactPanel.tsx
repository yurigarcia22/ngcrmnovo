"use client";

import { useEffect, useState } from "react";
import {
    Pencil, Check, X, User, Tag, Calendar, Trash2, Phone, Mail,
    MessageSquare, TrendingUp, Trophy, Frown, ExternalLink, Save,
    Clock, AlarmClock, Forward, CheckCircle2, StickyNote, ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
    updateContact, updateContactNotes, getContactStats, getContactDealHistory,
    snoozeDeal, setDealResolved, getTeamMembers, updateDeal, createTask,
} from "@/app/actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Props {
    deal: any;
    onContactUpdated?: (patch: any) => void;
    onDelete: () => void;
    onChange?: () => void;
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return "—";
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    const d = Math.floor(diff / 86400);
    if (d < 30) return `${d}d`;
    return new Date(iso).toLocaleDateString("pt-BR");
}

function formatCurrency(v: number): string {
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ChatContactPanel({ deal, onContactUpdated, onDelete, onChange }: Props) {
    const router = useRouter();
    const confirm = useConfirm();
    const contact = deal?.contacts;

    // Editing
    const [editingName, setEditingName] = useState(false);
    const [tempName, setTempName] = useState(contact?.name ?? "");
    const [editingEmail, setEditingEmail] = useState(false);
    const [tempEmail, setTempEmail] = useState(contact?.email ?? "");

    // Notes
    const [notes, setNotes] = useState<string>(contact?.notes ?? "");
    const [notesDirty, setNotesDirty] = useState(false);
    const [savingNotes, setSavingNotes] = useState(false);

    // Stats
    const [stats, setStats] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);

    // Forward modal
    const [showForward, setShowForward] = useState(false);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [forwardOwnerId, setForwardOwnerId] = useState("");
    const [forwarding, setForwarding] = useState(false);

    // Snooze
    const [showSnooze, setShowSnooze] = useState(false);

    // Schedule (Agendar)
    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduleDesc, setScheduleDesc] = useState("");
    const [scheduleAt, setScheduleAt] = useState("");
    const [scheduling, setScheduling] = useState(false);

    // Status menu
    const [showStatusMenu, setShowStatusMenu] = useState(false);

    useEffect(() => {
        if (!contact?.id) return;
        getContactStats(contact.id).then((res) => res.success && setStats(res.data));
        getContactDealHistory(contact.id, deal.id).then((res) => res.success && setHistory(res.data ?? []));
    }, [contact?.id, deal?.id]);

    useEffect(() => {
        setNotes(contact?.notes ?? "");
        setNotesDirty(false);
    }, [contact?.id]);

    async function saveName() {
        if (!tempName.trim() || tempName === contact?.name) {
            setEditingName(false);
            return;
        }
        const res = await updateContact(contact.id, { name: tempName.trim() });
        if (res.success) {
            onContactUpdated?.({ name: tempName.trim() });
            toast.success("Nome atualizado");
        } else {
            toast.error("Erro: " + res.error);
        }
        setEditingName(false);
    }

    async function saveEmail() {
        if (tempEmail === contact?.email) {
            setEditingEmail(false);
            return;
        }
        const res = await updateContact(contact.id, { email: tempEmail.trim() });
        if (res.success) {
            onContactUpdated?.({ email: tempEmail.trim() });
            toast.success("E-mail atualizado");
        } else {
            toast.error("Erro: " + res.error);
        }
        setEditingEmail(false);
    }

    async function saveNotes() {
        setSavingNotes(true);
        const res = await updateContactNotes(contact.id, notes);
        setSavingNotes(false);
        if (res.success) {
            onContactUpdated?.({ notes });
            setNotesDirty(false);
            toast.success("Notas salvas");
        } else {
            toast.error("Erro ao salvar notas");
        }
    }

    async function doSnooze(hours: number) {
        const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
        const res = await snoozeDeal(deal.id, until);
        if (res.success) {
            toast.success(`Conversa adiada por ${hours}h`);
            setShowSnooze(false);
            onChange?.();
        } else {
            toast.error(res.error ?? "Erro");
        }
    }

    async function doResolve(resolved: boolean) {
        const res = await setDealResolved(deal.id, resolved);
        if (res.success) {
            toast.success(resolved ? "Conversa marcada como resolvida" : "Conversa reaberta");
            setShowStatusMenu(false);
            onChange?.();
        } else {
            toast.error(res.error ?? "Erro");
        }
    }

    async function openSchedule(preset?: { desc: string; hoursAhead: number }) {
        const now = new Date();
        if (preset) {
            now.setHours(now.getHours() + preset.hoursAhead);
            setScheduleDesc(preset.desc);
        } else {
            // default: amanhã 9h
            now.setDate(now.getDate() + 1);
            now.setHours(9, 0, 0, 0);
            setScheduleDesc("");
        }
        const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setScheduleAt(iso);
        setShowSchedule(true);
        setShowStatusMenu(false);
    }

    async function doSchedule() {
        if (!scheduleAt) {
            toast.error("Defina uma data/hora");
            return;
        }
        if (!scheduleDesc.trim()) {
            toast.error("Descreva o que fazer");
            return;
        }
        setScheduling(true);
        const res = await createTask(deal.id, scheduleDesc.trim(), scheduleAt);
        setScheduling(false);
        if (res.success) {
            toast.success("Agendado!");
            setShowSchedule(false);
            setScheduleDesc("");
            setScheduleAt("");
            onChange?.();
        } else {
            toast.error(res.error ?? "Erro ao agendar");
        }
    }

    async function openForward() {
        if (teamMembers.length === 0) {
            const res = await getTeamMembers();
            if (res.success && res.data) setTeamMembers(res.data);
        }
        setShowForward(true);
    }

    async function doForward() {
        if (!forwardOwnerId) {
            toast.error("Selecione um responsável");
            return;
        }
        setForwarding(true);
        const res = await updateDeal(deal.id, { owner_id: forwardOwnerId });
        setForwarding(false);
        if (res.success) {
            const owner = teamMembers.find((t) => t.id === forwardOwnerId);
            toast.success(`Conversa atribuída a ${owner?.full_name ?? "vendedor"}`);
            setShowForward(false);
            onChange?.();
        } else {
            toast.error(res.error ?? "Erro");
        }
    }

    return (
        <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col animate-in slide-in-from-right-10 duration-200 shadow-xl z-10">
            <div className="h-16 px-5 bg-gray-50 flex items-center justify-between shrink-0 border-b border-gray-200">
                <span className="text-gray-700 font-semibold text-sm">Dados do Contato</span>
                {deal.resolved_at && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        Resolvida
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* IDENTITY */}
                <div className="px-5 py-6 flex flex-col items-center border-b border-gray-100 bg-gradient-to-b from-gray-50/60 to-white">
                    <div className="w-24 h-24 rounded-full overflow-hidden mb-3 ring-4 ring-white shadow-md bg-gray-100">
                        {contact?.photo_url ? (
                            <img src={contact.photo_url} className="w-full h-full object-cover" alt={contact.name} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <User size={40} className="text-gray-300" />
                            </div>
                        )}
                    </div>

                    {/* Name */}
                    {editingName ? (
                        <div className="flex items-center gap-1 w-full px-2 mb-1">
                            <input
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                                autoFocus
                                className="flex-1 px-2 py-1 border border-blue-300 rounded text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                            <button onMouseDown={saveName} className="p-1 bg-emerald-500 text-white rounded"><Check size={14} /></button>
                            <button onMouseDown={() => setEditingName(false)} className="p-1 bg-gray-200 text-gray-600 rounded"><X size={14} /></button>
                        </div>
                    ) : (
                        <button onClick={() => { setTempName(contact?.name ?? ""); setEditingName(true); }}
                            className="group flex items-center gap-1.5 hover:bg-white px-2 py-1 rounded transition-colors">
                            <h2 className="text-base font-bold text-gray-900">{contact?.name ?? "Sem Nome"}</h2>
                            <Pencil size={11} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    )}

                    {/* Phone */}
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <Phone size={11} />
                        <span className="font-mono">{contact?.phone ?? ""}</span>
                    </div>

                    {/* Email */}
                    <div className="mt-1.5 w-full px-2">
                        {editingEmail ? (
                            <div className="flex items-center gap-1">
                                <input
                                    value={tempEmail}
                                    onChange={(e) => setTempEmail(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveEmail(); if (e.key === "Escape") setEditingEmail(false); }}
                                    autoFocus
                                    type="email"
                                    placeholder="email@cliente.com"
                                    className="flex-1 px-2 py-1 border border-blue-300 rounded text-center text-xs focus:outline-none"
                                />
                                <button onMouseDown={saveEmail} className="p-1 bg-emerald-500 text-white rounded"><Check size={12} /></button>
                                <button onMouseDown={() => setEditingEmail(false)} className="p-1 bg-gray-200 rounded"><X size={12} /></button>
                            </div>
                        ) : (
                            <button onClick={() => { setTempEmail(contact?.email ?? ""); setEditingEmail(true); }}
                                className="w-full group flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                                <Mail size={11} />
                                <span>{contact?.email || "+ adicionar e-mail"}</span>
                                <Pencil size={9} className="text-gray-400 opacity-0 group-hover:opacity-100" />
                            </button>
                        )}
                    </div>
                </div>

                {/* STATS */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <SectionTitle label="Estatísticas" />
                    <div className="grid grid-cols-2 gap-2">
                        <StatCard
                            icon={<MessageSquare size={14} className="text-blue-500" />}
                            label="Mensagens"
                            value={stats ? `${stats.total_messages}` : "—"}
                            sub={stats ? `${stats.inbound} recebidas` : ""}
                        />
                        <StatCard
                            icon={<Clock size={14} className="text-amber-500" />}
                            label="Última resp."
                            value={stats ? formatRelativeTime(stats.last_inbound_at) : "—"}
                        />
                        <StatCard
                            icon={<Trophy size={14} className="text-emerald-500" />}
                            label="Total ganho"
                            value={stats && stats.total_won_value > 0 ? formatCurrency(stats.total_won_value) : "—"}
                            sub={stats?.won_deals ? `${stats.won_deals} ${stats.won_deals === 1 ? "deal" : "deals"}` : ""}
                        />
                        <StatCard
                            icon={<TrendingUp size={14} className="text-purple-500" />}
                            label="Negócios"
                            value={stats ? `${stats.total_deals}` : "—"}
                        />
                    </div>
                </div>

                {/* DEAL ATUAL */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <SectionTitle label="Negócio atual" />
                    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900 truncate flex-1">
                                {deal.title || "Sem título"}
                            </span>
                            <button
                                onClick={() => router.push(`/deals/${deal.id}`)}
                                className="text-indigo-600 hover:text-indigo-800 shrink-0"
                                title="Abrir oportunidade"
                            >
                                <ExternalLink size={14} />
                            </button>
                        </div>
                        <div className="text-xs text-gray-600 flex items-center justify-between">
                            <span>Valor: <strong className="text-gray-900">{formatCurrency(deal.value || 0)}</strong></span>
                            <span>{deal.created_at ? new Date(deal.created_at).toLocaleDateString("pt-BR") : ""}</span>
                        </div>
                        <button
                            onClick={() => router.push(`/deals/${deal.id}`)}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 mt-1 bg-white hover:bg-indigo-100 border border-indigo-200 rounded-md text-xs font-semibold text-indigo-700 transition-colors"
                        >
                            Abrir oportunidade
                            <ArrowRight size={12} />
                        </button>
                    </div>
                </div>

                {/* HISTORICO */}
                {history.length > 0 && (
                    <div className="px-5 py-4 border-b border-gray-100">
                        <SectionTitle label={`Histórico (${history.length})`} />
                        <div className="space-y-1.5">
                            {history.slice(0, 5).map((d) => {
                                const isWon = d.status === "won";
                                const isLost = d.status === "lost";
                                return (
                                    <button
                                        key={d.id}
                                        onClick={() => router.push(`/deals/${d.id}`)}
                                        className="w-full flex items-center justify-between p-2 rounded-md hover:bg-gray-50 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {isWon && <Trophy size={12} className="text-emerald-500 shrink-0" />}
                                            {isLost && <Frown size={12} className="text-rose-500 shrink-0" />}
                                            {!isWon && !isLost && <Tag size={12} className="text-gray-400 shrink-0" />}
                                            <span className="text-xs text-gray-700 truncate">{d.title || "Sem título"}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                                            {new Date(d.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* NOTAS */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <SectionTitle label="Notas sobre o contato" icon={<StickyNote size={11} />} />
                    <textarea
                        value={notes}
                        onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                        rows={3}
                        placeholder="Algo importante sobre este cliente..."
                        className="w-full px-2 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none bg-amber-50/40"
                    />
                    {notesDirty && (
                        <div className="flex justify-end gap-1 mt-1">
                            <button
                                onClick={() => { setNotes(contact?.notes ?? ""); setNotesDirty(false); }}
                                className="px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={saveNotes}
                                disabled={savingNotes}
                                className="px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded flex items-center gap-1"
                            >
                                <Save size={11} />
                                {savingNotes ? "Salvando..." : "Salvar"}
                            </button>
                        </div>
                    )}
                </div>

                {/* AÇÕES RAPIDAS */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <SectionTitle label="Ações rápidas" />
                    <div className="grid grid-cols-2 gap-1.5">
                        <QuickAction
                            icon={<Calendar size={13} />}
                            label="Agendar"
                            onClick={() => openSchedule()}
                        />
                        <QuickAction
                            icon={<Forward size={13} />}
                            label="Atribuir"
                            onClick={openForward}
                        />
                        <QuickAction
                            icon={<AlarmClock size={13} />}
                            label="Adiar"
                            onClick={() => setShowSnooze(true)}
                            active={!!deal.snoozed_until && new Date(deal.snoozed_until).getTime() > Date.now()}
                        />
                        <div className="relative">
                            <QuickAction
                                icon={<CheckCircle2 size={13} />}
                                label={deal.resolved_at ? "Status: ✓" : "Status"}
                                onClick={() => setShowStatusMenu(!showStatusMenu)}
                                active={!!deal.resolved_at || showStatusMenu}
                            />
                            {showStatusMenu && (
                                <>
                                    <button
                                        onClick={() => setShowStatusMenu(false)}
                                        className="fixed inset-0 z-30 cursor-default"
                                        tabIndex={-1}
                                        aria-label="Fechar menu"
                                    />
                                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-40 py-1 animate-in fade-in slide-in-from-top-1">
                                        {!deal.resolved_at ? (
                                            <>
                                                <button
                                                    onClick={() => openSchedule({ desc: "Retornar conversa", hoursAhead: 2 })}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-blue-50 text-gray-700"
                                                >
                                                    <Clock size={13} className="text-blue-500" />
                                                    Marcar para retornar
                                                </button>
                                                <button
                                                    onClick={() => openSchedule({ desc: "Follow-up", hoursAhead: 24 })}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-50 text-gray-700"
                                                >
                                                    <Calendar size={13} className="text-amber-500" />
                                                    Agendar follow-up
                                                </button>
                                                <div className="my-1 border-t border-gray-100" />
                                                <button
                                                    onClick={() => doResolve(true)}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-emerald-50 text-gray-700"
                                                >
                                                    <CheckCircle2 size={13} className="text-emerald-500" />
                                                    Marcar como resolvida
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => doResolve(false)}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-gray-700"
                                            >
                                                <CheckCircle2 size={13} className="text-gray-400" />
                                                Reabrir conversa
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* EXCLUIR */}
                <div className="px-5 py-4">
                    <button
                        onClick={onDelete}
                        className="w-full flex items-center justify-center gap-2 p-2 border border-rose-100 hover:border-rose-200 hover:bg-rose-50 rounded-lg text-rose-500 hover:text-rose-700 transition-all text-xs font-semibold"
                    >
                        <Trash2 size={13} />
                        Excluir contato
                    </button>
                </div>
            </div>

            {/* SCHEDULE MODAL */}
            {showSchedule && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-2xl">
                        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <Calendar className="text-blue-500" size={18} /> Agendar
                        </h3>

                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                            O que fazer?
                        </label>
                        <input
                            type="text"
                            value={scheduleDesc}
                            onChange={(e) => setScheduleDesc(e.target.value)}
                            placeholder="Ex: Retornar ligação, enviar proposta..."
                            autoFocus
                            className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        />

                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                            Quando?
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduleAt}
                            onChange={(e) => setScheduleAt(e.target.value)}
                            className="w-full px-3 py-2 mb-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        />

                        <div className="flex gap-1 flex-wrap mb-3">
                            {[
                                { label: "Em 1h", hours: 1 },
                                { label: "Em 4h", hours: 4 },
                                { label: "Amanhã 9h", hours: -1 },
                                { label: "Em 3 dias", hours: 72 },
                            ].map((preset) => (
                                <button
                                    key={preset.label}
                                    onClick={() => {
                                        const d = new Date();
                                        if (preset.hours === -1) {
                                            d.setDate(d.getDate() + 1);
                                            d.setHours(9, 0, 0, 0);
                                        } else {
                                            d.setHours(d.getHours() + preset.hours);
                                        }
                                        setScheduleAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                                    }}
                                    className="px-2 py-1 text-[10px] bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowSchedule(false)}
                                className="flex-1 px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={doSchedule}
                                disabled={scheduling}
                                className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                            >
                                {scheduling ? "..." : "Agendar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SNOOZE MODAL */}
            {showSnooze && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-xs p-5 shadow-2xl">
                        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <AlarmClock className="text-amber-500" size={18} /> Adiar conversa
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">
                            A conversa ficará oculta da lista até a hora escolhida.
                        </p>
                        <div className="space-y-1.5">
                            {[
                                { h: 1, label: "Em 1 hora" },
                                { h: 4, label: "Em 4 horas" },
                                { h: 24, label: "Amanhã" },
                                { h: 168, label: "Próxima semana" },
                            ].map((o) => (
                                <button
                                    key={o.h}
                                    onClick={() => doSnooze(o.h)}
                                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-blue-50 hover:text-blue-700 border border-gray-100"
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowSnooze(false)}
                            className="w-full mt-3 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* FORWARD MODAL */}
            {showForward && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-xs p-5 shadow-2xl">
                        <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <Forward className="text-blue-500" size={18} /> Atribuir conversa
                        </h3>
                        <p className="text-xs text-gray-500 mb-3">
                            Escolha o vendedor que vai assumir.
                        </p>
                        <select
                            value={forwardOwnerId}
                            onChange={(e) => setForwardOwnerId(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                            <option value="">— Selecione —</option>
                            {teamMembers.map((t) => (
                                <option key={t.id} value={t.id}>{t.full_name}</option>
                            ))}
                        </select>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => setShowForward(false)}
                                className="flex-1 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={doForward}
                                disabled={forwarding}
                                className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                            >
                                {forwarding ? "..." : "Confirmar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionTitle({ label, icon }: { label: string; icon?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5 mb-2.5 px-0.5">
            {icon && <span className="text-gray-400">{icon}</span>}
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
        </div>
    );
}

function StatCard({ icon, label, value, sub }: {
    icon: React.ReactNode; label: string; value: string; sub?: string;
}) {
    return (
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-1">
                {icon}
                {label}
            </div>
            <div className="text-sm font-bold text-gray-900 truncate">{value}</div>
            {sub && <div className="text-[10px] text-gray-400 truncate">{sub}</div>}
        </div>
    );
}

function QuickAction({ icon, label, onClick, active }: {
    icon: React.ReactNode; label: string; onClick: () => void; active?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-semibold rounded-md border transition-colors ${active
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-white hover:bg-gray-50 text-gray-600 border-gray-200"
                }`}
        >
            {icon}
            {label}
        </button>
    );
}
