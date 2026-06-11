"use client";
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { getConversations, getTeamMembers, getWhatsappInstances, promoteToLead, checkOngoingDeals, updateContact, deleteContact, markDealMessagesRead } from '@/app/actions';
import ChatWindow from '@/components/ChatWindow';
import ChatContactPanel from '@/components/chat/ChatContactPanel';
import { createClient } from '@/utils/supabase/client';
import { Search, MessageSquare, User, Tag, Calendar, ChevronRight, Filter, Phone, Plus, AlertTriangle, Trash2, Pencil, X, Check } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

function getInitials(name?: string | null): string | null {
    if (!name) return null;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const ini = (parts[0][0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '');
    return ini.toUpperCase() || null;
}

function ChatAvatar({ photoUrl, name }: { photoUrl?: string | null; name?: string | null }) {
    const [failed, setFailed] = useState(false);
    const initials = getInitials(name);
    const showImg = !!photoUrl && !failed;
    return (
        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 ring-2 ring-transparent group-hover:ring-blue-100 transition-all">
            {showImg ? (
                <img
                    src={photoUrl ?? ''}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={() => setFailed(true)}
                />
            ) : initials ? (
                <div className="flex items-center justify-center w-full h-full text-gray-600 font-semibold text-sm">
                    {initials}
                </div>
            ) : (
                <div className="flex items-center justify-center w-full h-full text-gray-400">
                    <User size={24} />
                </div>
            )}
        </div>
    );
}

export default function ChatPage() {
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
    const [search, setSearch] = useState("");
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlDealId = searchParams.get('dealId');

    const [supabase] = useState(() => createClient());

    // ============ React Query ============
    // Para "filterOwner" precisa ler o estado abaixo — usamos useState normal
    // e cria a query depois. Aqui declaramos placeholder e logo abaixo a query.

    // Filter State
    const [filterOwner, setFilterOwner] = useState<string>("all");
    const [filterInstance, setFilterInstance] = useState<string>("all");
    const [quickFilter, setQuickFilter] = useState<"all" | "unanswered" | "mine" | "today">("all");
    const [currentUserId, setCurrentUserId] = useState<string>("");

    // Debounce search (300ms) — declarado aqui pra disponibilizar pra queryKey
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Conversas: query reativa a debouncedSearch/filterOwner
    // refetchInterval = rede de seguranca caso o realtime perca eventos.
    const conversationsQuery = useQuery({
        queryKey: [...qk.conversations.list(), debouncedSearch, filterOwner],
        queryFn: async () => {
            const res = await getConversations(debouncedSearch, filterOwner);
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar conversas");
            return (res.data ?? []) as any[];
        },
        staleTime: 10_000,
        refetchInterval: 20_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });
    const rawConversations: any[] = conversationsQuery.data ?? [];
    // Aplica filtro client-side (mensagens vazias, urlDealId, selecionado)
    const conversations = rawConversations.filter((conv: any) => {
        const hasMessages = conv.messages && conv.messages.length > 0;
        const isSearched = search && search.trim().length > 0;
        const isFromUrl = urlDealId && conv.id === urlDealId;
        const isSelectedNow = selectedDeal && conv.id === selectedDeal.id;
        return hasMessages || isSearched || isFromUrl || isSelectedNow;
    });
    const loading = conversationsQuery.isLoading && !conversationsQuery.data;

    const teamMembersQuery = useQuery({
        queryKey: qk.team.members(),
        queryFn: async () => {
            const r = await getTeamMembers();
            if (!r.success) throw new Error(r.error ?? "Falha ao carregar time");
            return r.data ?? [];
        },
        staleTime: 5 * 60_000,
    });
    const teamMembers: any[] = teamMembersQuery.data ?? [];

    const instancesQuery = useQuery({
        queryKey: ["whatsappInstances"],
        queryFn: async () => {
            const r = await getWhatsappInstances();
            if (!r.success) throw new Error(r.error ?? "Falha ao carregar instancias");
            return r.data ?? [];
        },
        staleTime: 5 * 60_000,
    });
    const instances: any[] = instancesQuery.data ?? [];

    const loadConversations = () => {
        queryClient.invalidateQueries({ queryKey: qk.conversations.list() });
    };

    // Promote Lead State
    const [isPromoting, setIsPromoting] = useState(false);
    const [promoteTitle, setPromoteTitle] = useState("");
    const [promoteValue, setPromoteValue] = useState(0);
    const [promoteDate, setPromoteDate] = useState("");

    // Edit Contact State
    const [isEditingContact, setIsEditingContact] = useState(false);
    const [editContactName, setEditContactName] = useState("");

    // Delete Contact State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteWithDeal, setDeleteWithDeal] = useState(true);

    // Carrega user atual
    useEffect(() => {
        supabase.auth.getSession().then(({ data: session }) => {
            if (session?.session?.user?.id) setCurrentUserId(session.session.user.id);
        });
    }, [supabase]);


    // Update Selected Deal when Conversations refresh (Fix Button state issue)
    useEffect(() => {
        if (!selectedDeal || conversations.length === 0) return;

        const updated = conversations.find(c => c.id === selectedDeal.id);
        if (updated) {
            // Check for meaningful changes to avoid loop
            const hasChanged =
                updated.stage_id !== selectedDeal.stage_id ||
                updated.contacts?.name !== selectedDeal.contacts?.name ||
                updated.updated_at !== selectedDeal.updated_at;

            if (hasChanged) {
                console.log("Updating selected deal from list version");
                setSelectedDeal(updated);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversations]); // Only run when list changes, not when selectedDeal changes (to break loop)

    // Handle URL Deep Link
    useEffect(() => {
        if (urlDealId && conversations.length > 0 && !selectedDeal) {
            const found = conversations.find(c => c.id === urlDealId);
            if (found) setSelectedDeal(found);
        }
    }, [urlDealId, conversations, selectedDeal]);

    // Realtime Subscription + notificacao sonora ao receber inbound
    useEffect(() => {
        console.log("Subscribing to global messages for list updates...");

        // Pre-carrega audio uma vez
        let audio: HTMLAudioElement | null = null;
        try {
            audio = new Audio("/sounds/notification.mp3");
            audio.volume = 0.4;
        } catch { /* ignore */ }

        const playSound = () => {
            if (!audio) return;
            audio.currentTime = 0;
            audio.play().catch(() => { /* autoplay block — ignora */ });
        };

        const channel = supabase
            .channel('chat_list_updates')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload: any) => {
                    const msg = payload.new;
                    // Toca som apenas se for inbound (cliente respondeu)
                    if (msg?.direction === "inbound") {
                        playSound();
                    }
                    loadConversations();
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'deals' },
                () => {
                    loadConversations();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Marca msgs como lidas quando seleciona conversa
    useEffect(() => {
        if (selectedDeal?.id) {
            markDealMessagesRead(selectedDeal.id).then(() => {
                // Atualiza badge da sidebar (atraves do realtime de UPDATE em messages)
            });
        }
    }, [selectedDeal?.id]);

    // loadConversations agora invalida a queryKey (definido acima, antes do return).

    async function handlePromoteToLead() {
        if (!selectedDeal) return;

        const res = await promoteToLead(selectedDeal.id, promoteTitle || selectedDeal.title || "Novo Lead", promoteValue, promoteDate);
        if (res.success) {
            toast.success("Lead criado com sucesso!");
            loadConversations();
            router.refresh();
        } else {
            toast.error("Erro ao criar lead", res.error);
        }
        setIsPromoting(false);
        setPromoteTitle("");
        setPromoteValue(0);
        setPromoteDate("");
    }

    async function openPromoteModal() {
        if (!selectedDeal) return;

        // 1. Check for Ongoing Deals (Duplicate Prevention)
        const check = await checkOngoingDeals(selectedDeal.contacts?.phone || "", selectedDeal.id);

        if (check.success && check.deals && check.deals.length > 0) {
            const dealNames = check.deals.map((d: any) => `• ${d.title} (${d.stages?.name || 'Sem Etapa'})`).join('\n');
            const confirmMsg = `Este contato ja possui negocio(s) em aberto:\n\n${dealNames}\n\nDeseja criar um NOVO lead mesmo assim?`;

            const ok = await confirm({
                title: "Contato ja possui negocios",
                description: confirmMsg,
                tone: "warning",
                confirmText: "Criar novo lead",
            });
            if (!ok) {
                return;
            }
        }

        // Show modal instead of inline form
        setIsPromoting(true);
    }

    async function handleUpdateContactName() {
        if (!selectedDeal?.contacts?.id || !editContactName.trim()) return;

        const res = await updateContact(selectedDeal.contacts.id, { name: editContactName });
        if (res.success) {
            setIsEditingContact(false);
            loadConversations(); // Refresh list to show new name immediately
        } else {
            toast.error("Erro ao atualizar nome", res.error);
        }
    }

    async function handleDeleteContact() {
        if (!selectedDeal?.contacts?.id) return;

        const res = await deleteContact(selectedDeal.contacts.id, deleteWithDeal);
        if (res.success) {
            toast.success("Contato excluido com sucesso");
            setSelectedDeal(null);
            setShowDeleteModal(false);
            loadConversations();
        } else {
            toast.error("Erro ao excluir contato", res.error);
        }
    }

    function formatTime(dateString: string) {
        if (!dateString) return "";
        const date = new Date(dateString);
        const now = new Date();
        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }

    // Tempo que o lead espera resposta: so quando a ultima msg foi do lead (inbound).
    function waitingInfo(conv: any): { label: string; mins: number; level: 'ok' | 'warn' | 'late' } | null {
        const last = conv.last_message;
        if (!last || last.direction !== 'inbound') return null;
        const mins = Math.floor((Date.now() - new Date(last.created_at).getTime()) / 60000);
        const label = mins < 1 ? 'agora' : mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
        const level: 'ok' | 'warn' | 'late' = mins >= 60 ? 'late' : mins >= 15 ? 'warn' : 'ok';
        return { label, mins, level };
    }

    // Numero (instancia) selecionado no filtro -> instance_name para comparar.
    const selectedInstanceName = filterInstance === 'all'
        ? null
        : (instances.find((i: any) => String(i.id) === String(filterInstance))?.instance_name ?? null);

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden text-gray-800 font-sans">
            {/* Promote Lead Modal */}
            {isPromoting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden">
                        <div className="bg-[#00a86b] p-6 text-white">
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar size={20} className="text-white/80" />
                                <span className="text-sm font-medium text-white/90">Agendamento</span>
                            </div>
                            <h2 className="text-2xl font-bold">Criar Oportunidade</h2>
                            <p className="text-white/80 text-sm mt-1">Selecione o destino deste lead no funil.</p>
                            <button onClick={() => setIsPromoting(false)} className="absolute top-4 right-4 text-white/70 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Título do Negócio</label>
                                <input
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#00a86b] focus:border-transparent outline-none bg-gray-50"
                                    placeholder="Ex: Novo Cliente VIP"
                                    value={promoteTitle}
                                    onChange={e => setPromoteTitle(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Valor (R$)</label>
                                    <input
                                        type="number"
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#00a86b] focus:border-transparent outline-none bg-gray-50"
                                        value={promoteValue}
                                        onChange={e => setPromoteValue(Number(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Data Reunião</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#00a86b] focus:border-transparent outline-none bg-gray-50 text-sm"
                                        value={promoteDate}
                                        onChange={e => setPromoteDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="bg-[#e6f4ea] p-4 rounded-lg flex gap-3 items-start">
                                <div className="p-1 bg-[#00a86b] rounded-full text-white mt-0.5"><Check size={12} strokeWidth={3} /></div>
                                <div className="text-sm text-[#004d33]">
                                    <p className="font-bold">O que acontece agora?</p>
                                    <p className="opacity-80">O lead será movido para primeira etapa do funil e um evento de "Reunião Marcada" será registrado.</p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setIsPromoting(false)}
                                    className="flex-1 py-3 text-gray-600 font-bold hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handlePromoteToLead}
                                    className="flex-1 py-3 bg-[#00a86b] text-white font-bold rounded-lg hover:bg-[#008f5b] shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <Check size={18} strokeWidth={3} />
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-[400px] space-y-4">
                        <div className="flex items-center gap-3 text-red-600">
                            <div className="p-3 bg-red-100 rounded-full"><Trash2 size={24} /></div>
                            <h3 className="text-lg font-bold">Excluir Contato</h3>
                        </div>
                        <p className="text-gray-600 text-sm">
                            Tem certeza que deseja excluir <b>{selectedDeal?.contacts?.name}</b>? Esta ação não pode ser desfeita.
                        </p>

                        {/* Checkbox for Deal */}
                        <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <input
                                type="checkbox"
                                id="deleteDealCheck"
                                checked={deleteWithDeal}
                                onChange={e => setDeleteWithDeal(e.target.checked)}
                                className="mt-0.5"
                            />
                            <div className="flex flex-col text-sm">
                                <label htmlFor="deleteDealCheck" className="font-medium text-gray-800 cursor-pointer">
                                    Excluir também negociações?
                                </label>
                                <span className="text-xs text-gray-500">Se marcado, também apagará deals e mensagens.</span>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteContact}
                                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium shadow-md shadow-red-200 transition-colors"
                            >
                                Confirmar Exclusão
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LEFT SIDEBAR: Conversations List */}
            <div className="w-[400px] border-r border-gray-200 flex flex-col bg-white transition-all">
                {/* Header */}
                <div className="h-16 px-4 bg-gray-50 flex items-center justify-between shrink-0 border-b border-gray-200">
                    <h1 className="text-xl font-bold text-gray-700">Conversas</h1>
                    <div className="flex gap-3 text-gray-500">
                        <MessageSquare className="cursor-pointer hover:text-blue-600 transition-colors" />
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="p-3 bg-white border-b border-gray-100 space-y-3">
                    <div className="flex gap-2">
                        {/* Owner Filter */}
                        <div className="relative flex-1">
                            <select
                                value={filterOwner}
                                onChange={(e) => setFilterOwner(e.target.value)}
                                className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none cursor-pointer transition-all"
                            >
                                <option value="all">Responsável: Todos</option>
                                {teamMembers.map(member => (
                                    <option key={member.id} value={member.id}>{member.full_name}</option>
                                ))}
                            </select>
                            <Filter size={12} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
                        </div>

                        {/* Instance Filter (Placeholder logic for now) */}
                        <div className="relative flex-1">
                            <select
                                value={filterInstance}
                                onChange={(e) => setFilterInstance(e.target.value)}
                                className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none cursor-pointer transition-all"
                            >
                                <option value="all">Número: Todos</option>
                                {instances.map(inst => (
                                    <option key={inst.id} value={inst.id}>{inst.custom_name || inst.instance_name}</option>
                                ))}
                            </select>
                            <Phone size={12} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Quick filter chips */}
                    <div className="flex gap-1 flex-wrap">
                        {([
                            { key: "all", label: "Todas" },
                            { key: "unanswered", label: "Sem resposta" },
                            { key: "mine", label: "Minhas" },
                            { key: "today", label: "Hoje" },
                        ] as const).map((f) => {
                            const active = quickFilter === f.key;
                            return (
                                <button
                                    key={f.key}
                                    onClick={() => setQuickFilter(f.key)}
                                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                                        active
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Search Bar */}
                    <div className="bg-gray-50 rounded-lg flex items-center px-3 py-1.5 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-blue-400 transition-all">
                        <Search size={18} className="text-gray-400 mr-3" />
                        <input
                            className="bg-transparent border-none text-gray-700 w-full focus:outline-none placeholder-gray-400 text-sm py-1"
                            placeholder="Pesquisar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading && conversations.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm animate-pulse">Carregando conversas...</div>
                    ) : (
                        conversations.filter((conv) => {
                            if (selectedInstanceName && conv.last_message?.instance_name !== selectedInstanceName) return false;
                            if (quickFilter === "all") return true;
                            if (quickFilter === "mine") {
                                return currentUserId && conv.owner_id === currentUserId;
                            }
                            if (quickFilter === "unanswered") {
                                // Ultima msg inbound = aguardando resposta
                                return conv.last_message?.direction === "inbound";
                            }
                            if (quickFilter === "today") {
                                const last = conv.last_message?.created_at || conv.updated_at;
                                if (!last) return false;
                                const d = new Date(last);
                                const today = new Date();
                                return d.toDateString() === today.toDateString();
                            }
                            return true;
                        }).sort((a, b) => {
                            // Na aba "Sem resposta", os que esperam ha mais tempo vem primeiro.
                            if (quickFilter !== "unanswered") return 0;
                            const wa = waitingInfo(a)?.mins ?? -1;
                            const wb = waitingInfo(b)?.mins ?? -1;
                            return wb - wa;
                        }).map(conv => {
                            const active = selectedDeal?.id === conv.id;
                            const wait = waitingInfo(conv);
                            const personName = conv.contacts?.name || conv.title || "Desconhecido";
                            const lastMsgTime = formatTime(conv.last_message?.created_at || conv.updated_at);
                            const lastMsgContent = conv.last_message?.content || (conv.last_message?.type === 'image' ? '📸 Imagem' : 'Nenhuma mensagem');

                            return (
                                <div
                                    key={conv.id}
                                    onClick={() => setSelectedDeal(conv)}
                                    className={`flex items-center gap-3 p-3 px-4 cursor-pointer transition-all border-b border-gray-50 group hover:bg-gray-50 ${active ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                                >
                                    <div className="relative shrink-0">
                                        <ChatAvatar photoUrl={conv.contacts?.photo_url} name={personName} />
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className={`font-medium text-base truncate transition-colors ${active ? 'text-blue-700' : 'text-gray-800'}`}>{personName}</span>
                                            <span className={`text-xs ${active ? 'text-blue-600' : 'text-gray-400'}`}>{lastMsgTime}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-2">
                                            <p className={`text-sm truncate transition-colors ${active ? 'text-blue-600/80' : 'text-gray-500 group-hover:text-gray-600'}`}>
                                                {lastMsgContent}
                                            </p>
                                            {wait && (
                                                <span
                                                    title="Aguardando sua resposta"
                                                    className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${wait.level === 'late' ? 'bg-red-100 text-red-600' : wait.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}
                                                >
                                                    ⏱ {wait.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    {!loading && conversations.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            Nenhum contato encontrado.
                        </div>
                    )}
                </div>
            </div>

            {/* CENTER: Chat Window */}
            <div className="flex-1 bg-[#efeae2] relative flex flex-col min-w-[500px] border-r border-gray-200 pattern-isometric pattern-gray-100 pattern-bg-white pattern-size-4 pattern-opacity-10">
                {selectedDeal ? (
                    <div className="flex-1 flex flex-col h-full bg-[#efeae2] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed">
                        <ChatWindow deal={selectedDeal} theme="light" />
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-6 bg-gray-50">
                        <div className="relative p-6 bg-white rounded-full shadow-sm">
                            <MessageSquare size={64} className="text-gray-300" />
                            <div className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                        </div>
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-light text-gray-600">Selecione uma conversa</h2>
                            <p className="text-sm text-gray-500">Escolha um contato na lista para iniciar o atendimento.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT: Contact Panel (redesigned) */}
            {selectedDeal && (
                <ChatContactPanel
                    deal={selectedDeal}
                    onContactUpdated={(patch) => {
                        setSelectedDeal((s: any) => s ? ({ ...s, contacts: { ...s.contacts, ...patch } }) : s);
                    }}
                    onDelete={() => { setDeleteWithDeal(true); setShowDeleteModal(true); }}
                    onChange={() => { /* refresh conversas if needed */ }}
                />
            )}
        </div>
    );
}
