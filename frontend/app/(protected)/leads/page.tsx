"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import confetti from "canvas-confetti";
import { markAsWon, recoverDeal, getTeamMembers, deleteDeals, updateDeals, addDealMember } from "@/app/actions";
import { getPipelines, getBoardData } from "./actions";
import { qk } from "@/lib/query-keys";
import { GitPullRequest, CheckSquare, Square } from "lucide-react";

import {
    MessageCircle,
    Search,
    Plus,
    User,
    MoreHorizontal
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import NewLeadModal from "@/components/NewLeadModal";
import FilterBar from "@/components/kanban/FilterBar";
import { DragDropContext, Draggable } from "@hello-pangea/dnd";
import { StrictModeDroppable } from "@/components/StrictModeDroppable";
import KanbanCard from "@/components/KanbanCard";
import InboxKanbanCard from "@/components/InboxKanbanCard";
import { Inbox } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function LeadsPage() {
    const supabase = createClient();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    const [selectedPipelineId, setSelectedPipelineId] = useState<string>(() => {
        if (typeof window === "undefined") return "";
        try { return localStorage.getItem("lastPipelineId") ?? ""; } catch { return ""; }
    });

    // === React Query ===
    const pipelinesQuery = useQuery({
        queryKey: qk.pipelines.list(),
        queryFn: async () => {
            const res = await getPipelines();
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar funis");
            return res.data ?? [];
        },
        staleTime: 5 * 60_000, // 5 min — funis nao mudam toda hora
    });
    const pipelines: any[] = pipelinesQuery.data ?? [];

    const boardQuery = useQuery({
        queryKey: qk.deals.board(selectedPipelineId),
        queryFn: async () => {
            const res = await getBoardData(selectedPipelineId);
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar board");
            return {
                stages: res.stages ?? [],
                deals: res.deals ?? [],
                fieldDefinitions: res.fieldDefinitions ?? [],
            };
        },
        enabled: !!selectedPipelineId,
        staleTime: 15_000,
    });
    const stages: any[] = boardQuery.data?.stages ?? [];
    const deals: any[] = boardQuery.data?.deals ?? [];
    const fields: any[] = boardQuery.data?.fieldDefinitions ?? [];
    const loading = boardQuery.isLoading && !boardQuery.data;

    // Helpers para update otimista do board
    const patchBoardDeals = (mutator: (deals: any[]) => any[]) => {
        queryClient.setQueryData(qk.deals.board(selectedPipelineId), (old: any) => {
            if (!old) return old;
            return { ...old, deals: mutator(old.deals ?? []) };
        });
    };
    const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: qk.deals.board(selectedPipelineId) });

    const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);

    // Helpers pra persistir filtros no localStorage (sobrevivem F5, navegação e volta de deal)
    const readLs = (k: string, fallback: string) => {
        if (typeof window === "undefined") return fallback;
        try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
    };

    const [searchTerm, setSearchTerm] = useState(() => readLs("filter_searchTerm", ""));
    const [filterStatus, setFilterStatus] = useState<'active' | 'lost'>(
        () => (readLs("filter_status", "active") as 'active' | 'lost'),
    );
    const tagsQuery = useQuery({
        queryKey: qk.tags.all(),
        queryFn: async () => {
            const { data, error } = await supabase.from("tags").select("*").order("name");
            if (error) throw error;
            return data ?? [];
        },
        staleTime: 5 * 60_000,
    });
    const tags: any[] = tagsQuery.data ?? [];
    const [filterTag, setFilterTag] = useState(() => readLs("filter_tag", "all"));
    const [filterDate, setFilterDate] = useState(() => readLs("filter_date", "all"));
    const [filterDateStart, setFilterDateStart] = useState(() => readLs("filter_dateStart", ""));
    const [filterDateEnd, setFilterDateEnd] = useState(() => readLs("filter_dateEnd", ""));

    // Owner Filter
    const teamQuery = useQuery({
        queryKey: qk.team.members(),
        queryFn: async () => {
            const res = await getTeamMembers();
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar time");
            return res.data ?? [];
        },
        staleTime: 5 * 60_000,
    });
    const teamMembers: any[] = teamQuery.data ?? [];
    const [filterOwner, setFilterOwner] = useState(() => readLs("filter_owner", "loading"));
    const [currentUserId, setCurrentUserId] = useState<string>("");

    // Persiste filtros automaticamente
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_searchTerm", searchTerm); }, [searchTerm]);
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_status", filterStatus); }, [filterStatus]);
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_tag", filterTag); }, [filterTag]);
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_date", filterDate); }, [filterDate]);
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_dateStart", filterDateStart); }, [filterDateStart]);
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_dateEnd", filterDateEnd); }, [filterDateEnd]);
    useEffect(() => {
        if (typeof window !== "undefined" && filterOwner !== "loading") {
            localStorage.setItem("filter_owner", filterOwner);
        }
    }, [filterOwner]);

    // Bulk Actions
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedDeals, setSelectedDeals] = useState<string[]>([]);

    // Bulk Change Owner
    const [showBulkOwnerSelect, setShowBulkOwnerSelect] = useState(false);
    const [bulkOwnerId, setBulkOwnerId] = useState("");

    // Bulk Add Member
    const [showBulkMemberSelect, setShowBulkMemberSelect] = useState(false);
    const [bulkMemberId, setBulkMemberId] = useState("");



    // Identifica usuario (so pra setar default do filter owner)
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUserId(user.id);
                if (filterOwner === 'loading') setFilterOwner(user.id);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Quando pipelines carregam pela primeira vez, escolhe um se nenhum esta selecionado
    useEffect(() => {
        if (!pipelines.length || selectedPipelineId) return;
        let initialPipeline: string | null = null;
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const fromUrl = params.get("pipeline");
            if (fromUrl && pipelines.some((p: any) => String(p.id) === fromUrl)) {
                initialPipeline = fromUrl;
            } else {
                const fromStorage = localStorage.getItem("lastPipelineId");
                if (fromStorage && pipelines.some((p: any) => String(p.id) === fromStorage)) {
                    initialPipeline = fromStorage;
                }
            }
        }
        setSelectedPipelineId(initialPipeline ?? String(pipelines[0].id));
    }, [pipelines, selectedPipelineId]);

    // Persiste pipeline selecionado
    useEffect(() => {
        if (selectedPipelineId && typeof window !== "undefined") {
            localStorage.setItem("lastPipelineId", String(selectedPipelineId));
        }
    }, [selectedPipelineId]);

    // Realtime — invalidacao debounced (React Query refaz a query)
    useEffect(() => {
        if (!selectedPipelineId) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const scheduleInvalidate = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { invalidateBoard(); }, 1200);
        };

        const channel = supabase
            .channel('crm-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, scheduleInvalidate)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleInvalidate)
            .subscribe();

        return () => {
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        }
    }, [selectedPipelineId]);

    // Alias para handlers que pediam refetch
    const fetchData = () => invalidateBoard();



    const onDragEnd = async (result: any) => {
        const { destination, source, draggableId } = result;

        // Se soltou fora ou na mesma posição, não faz nada
        if (!destination) return;
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        // IDs geralmente são números no banco, mas draggableId vem como string
        const dealId = draggableId; // UUID é string, não converter para int
        // CONVERSÃO CORRIGIDA: stage_id no banco é numérico (BigInt), então convertemos
        const newStageId = Number(destination.droppableId);
        const oldStageId = Number(source.droppableId);

        // Detecta se o deal saiu do INBOX para outra stage
        const oldStage = stages.find(s => Number(s.id) === oldStageId);
        const newStage = stages.find(s => Number(s.id) === newStageId);
        const isPromoting = oldStage?.is_inbox === true && newStage?.is_inbox === false;

        // Optimistic UI: atualiza cache do React Query imediatamente
        const oldDeals = [...deals];
        patchBoardDeals((curr) => curr.map((deal: any) => {
            if (String(deal.id) === dealId) {
                const next: any = { ...deal, stage_id: newStageId };
                if (isPromoting && !deal.promoted_at) {
                    next.promoted_at = new Date().toISOString();
                }
                return next;
            }
            return deal;
        }));

        try {
            // Monta update payload
            const updatePayload: any = { stage_id: newStageId };
            if (isPromoting) {
                // Marca timestamp da primeira saida do inbox (so se ainda nao marcado).
                // O check de deal.promoted_at e feito do lado do client porque
                // o RLS impede leitura cruzada — confiamos no estado em memoria.
                const currentDeal = oldDeals.find(d => String(d.id) === dealId);
                if (!currentDeal?.promoted_at) {
                    updatePayload.promoted_at = new Date().toISOString();
                }
            }

            // Atualiza no Supabase (Stage + promoted_at se aplicavel)
            const { data, error } = await supabase
                .from("deals")
                .update(updatePayload)
                .eq("id", dealId)
                .select();

            if (error) throw error;

            if (!data || data.length === 0) {
                throw new Error("Você não tem permissão para mover este lead (Tenant ID incorreto).");
            }

            // Lógica de GANHO (WIN)
            // Antes: "última stage = won" (frágil — quebrava se houvesse stage "No Show" no fim).
            // Agora: stage marcada explicitamente com is_won=true.
            if (newStage?.is_won === true) {
                // Dispara Confetes!
                const duration = 3 * 1000;
                const animationEnd = Date.now() + duration;
                const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

                const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

                const interval: any = setInterval(function () {
                    const timeLeft = animationEnd - Date.now();

                    if (timeLeft <= 0) {
                        return clearInterval(interval);
                    }

                    const particleCount = 50 * (timeLeft / duration);
                    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
                }, 250);

                // Marca como Ganho no Backend
                await markAsWon(dealId);
            } else {
                // Se NÃO for a última etapa, mas o deal estava como 'won' ou 'lost', reverte para 'open'
                // A gente não tem o status antigo fácil aqui sem buscar no 'deals' state antigo
                const oldDealStatus = oldDeals.find(d => String(d.id) === dealId)?.status;
                if (oldDealStatus === 'won' || oldDealStatus === 'lost') {
                    console.log('Revertendo status para OPEN...');
                    await recoverDeal(dealId);
                }
            }

        } catch (error: any) {
            console.error("Falha ao mover card:", error);
            toast.error("Erro ao mover", error.message || "Erro desconhecido");
            patchBoardDeals(() => oldDeals); // Rollback
        }
    };

    // Bulk Actions Handlers
    const toggleSelection = (dealId: string) => {
        setSelectedDeals(prev =>
            prev.includes(dealId) ? prev.filter(id => id !== dealId) : [...prev, dealId]
        );
    };

    const handleSelectAllInStage = (stageDeals: any[]) => {
        const stageDealIds = stageDeals.map(d => d.id);
        const allSelected = stageDealIds.every(id => selectedDeals.includes(id));

        if (allSelected) {
            // Unselect all in this stage
            setSelectedDeals(prev => prev.filter(id => !stageDealIds.includes(id)));
        } else {
            // Select all in this stage
            setSelectedDeals(prev => {
                const newSelection = new Set([...prev, ...stageDealIds]);
                return Array.from(newSelection);
            });
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedDeals.length) return;
        const ok = await confirm({
            title: "Excluir oportunidades?",
            description: `Tem certeza que deseja excluir ${selectedDeals.length} oportunidades? Esta acao e irreversivel.`,
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;

        try {
            const res = await deleteDeals(selectedDeals);
            if (res.success) {
                fetchData();
                setSelectedDeals([]);
                setIsSelectionMode(false);
            } else {
                toast.error("Erro ao excluir", res.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleBulkChangeOwner = async () => {
        if (!bulkOwnerId || !selectedDeals.length) return;

        try {
            const res = await updateDeals(selectedDeals, { owner_id: bulkOwnerId });
            if (res.success) {
                fetchData();
                setSelectedDeals([]);
                setIsSelectionMode(false);
                setShowBulkOwnerSelect(false);
            } else {
                toast.error("Erro ao alterar", res.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleBulkAddMember = async () => {
        if (!bulkMemberId || !selectedDeals.length) return;

        try {
            // Promise.all to add member to multiple deals in parallel
            const results = await Promise.all(
                selectedDeals.map(dealId => addDealMember(dealId, bulkMemberId))
            );

            // Check if any failed critically
            const failed = results.filter(r => !r.success);
            if (failed.length > 0) {
                toast.error("Erro parcial ao adicionar membro a alguns leads");
            }

            fetchData();
            setSelectedDeals([]);
            setIsSelectionMode(false);
            setShowBulkMemberSelect(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleBulkRecover = async () => {
        if (!selectedDeals.length) return;
        const ok = await confirm({
            title: "Reabrir leads?",
            description: `Tem certeza que deseja reabrir ${selectedDeals.length} leads perdidos?`,
            tone: "warning",
            confirmText: "Reabrir",
        });
        if (!ok) return;

        try {
            const res = await updateDeals(selectedDeals, {
                status: 'open',
                closed_at: null,
                lost_reason: null,
                lost_details: null
            });

            if (res.success) {
                fetchData();
                setSelectedDeals([]);
                setIsSelectionMode(false);
            } else {
                toast.error("Erro ao reabrir leads", res.error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Lógica de Filtro
    const filteredDeals = deals.filter(deal => {
        // 0. OWNER FILTER (Novo)
        if (filterOwner !== 'all' && filterOwner !== 'loading') {
            // Check primary owner OR if user is in deal_members
            const isMember = deal.deal_members?.some((m: any) => m.user_id === filterOwner);
            if (deal.owner_id !== filterOwner && !isMember) return false;
        }

        // 1. Filtro de Status (Ativos vs Perdidos)
        if (filterStatus === 'active') {
            // Mostra tudo que NÃO é perdido (inclui 'won' e 'open')
            if (deal.status === 'lost') return false;
        } else {
            // Mostra APENAS perdidos
            if (deal.status !== 'lost') return false;
        }

        // 2. Filtro de Tag (compara como string — select HTML sempre devolve string,
        //    mas tag.id no banco é number)
        if (filterTag !== 'all') {
            const hasTag = deal.deal_tags?.some(
                (dt: any) => String(dt.tags?.id) === String(filterTag),
            );
            if (!hasTag) return false;
        }

        // 3. Filtro de Data
        if (filterDate !== 'all') {
            const dealDate = new Date(deal.created_at);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            if (filterDate === 'today') {
                if (dealDate < today) return false;
            } else if (filterDate === 'last7') {
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(today.getDate() - 7);
                if (dealDate < sevenDaysAgo) return false;
            } else if (filterDate === 'last30') {
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 30);
                if (dealDate < thirtyDaysAgo) return false;
            } else if (filterDate === 'thisMonth') {
                const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                if (dealDate < firstDayOfMonth) return false;
            } else if (filterDate === 'custom') {
                if (filterDateStart) {
                    const start = new Date(filterDateStart + 'T00:00:00');
                    if (dealDate < start) return false;
                }
                if (filterDateEnd) {
                    const end = new Date(filterDateEnd + 'T23:59:59');
                    if (dealDate > end) return false;
                }
            }
        }

        // 4. Filtro de Busca
        if (!searchTerm) return true;
        const lowerTerm = searchTerm.toLowerCase();
        return (
            deal.title?.toLowerCase().includes(lowerTerm) ||
            deal.contacts?.name?.toLowerCase().includes(lowerTerm) ||
            deal.contacts?.phone?.includes(searchTerm)
        );
    });

    if (loading) return <div suppressHydrationWarning className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 font-medium">Carregando CRM...</div>;

    return (
        <div suppressHydrationWarning className="flex flex-col h-screen overflow-hidden bg-slate-50">

            {/* HEADER SUPERIOR - Branding e Ação Principal */}
            <header className="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">Pipeline de Vendas</h1>

                    {/* Pipeline Selector Redesigned */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm hover:border-slate-300 hover:bg-slate-100 transition-colors">
                        <GitPullRequest size={16} className="text-indigo-600" />
                        <select
                            value={selectedPipelineId}
                            onChange={(e) => setSelectedPipelineId(e.target.value)}
                            className="text-sm font-bold text-slate-700 bg-transparent focus:outline-none cursor-pointer min-w-[140px] appearance-none pr-4"
                        >
                            {pipelines.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <NotificationBell />
                    <button
                        onClick={() => setIsNewLeadModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Novo Lead
                    </button>
                </div>
            </header>

            {/* TOOLBAR INFERIOR - Filtros e Busca */}
            <div className="bg-white border-b border-slate-200/60 px-6 py-3 flex flex-wrap items-center justify-between shrink-0 z-10 gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FilterBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filterTag={filterTag}
                        setFilterTag={setFilterTag}
                        filterDate={filterDate}
                        setFilterDate={setFilterDate}
                        customStart={filterDateStart}
                        setCustomStart={setFilterDateStart}
                        customEnd={filterDateEnd}
                        setCustomEnd={setFilterDateEnd}
                        availableTags={tags}
                    />
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {/* Owner Filter Component Redesigned */}
                    <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
                        <User size={16} className="text-slate-400" />
                        <select
                            value={filterOwner}
                            onChange={(e) => setFilterOwner(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer appearance-none pr-4"
                        >
                            <option value="all">Todos Responsáveis</option>
                            <option disabled value="loading">Carregando...</option>
                            {teamMembers.map((member) => (
                                <option key={member.id} value={member.id}>
                                    {member.id === currentUserId ? 'Meus Leads' : member.full_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter Redesigned */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as 'active' | 'lost')}
                        className="bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer shadow-sm hover:border-slate-300"
                    >
                        <option value="active">Oportunidades Ativas</option>
                        <option value="lost">Oportunidades Perdidas</option>
                    </select>

                    {/* Bulk Selection Toggle */}
                    <div className="h-8 w-px bg-slate-200 mx-1"></div>
                    <button
                        onClick={() => {
                            setIsSelectionMode(!isSelectionMode);
                            setSelectedDeals([]);
                        }}
                        className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-bold
                            ${isSelectionMode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}
                        `}
                        title="Seleção Múltipla"
                    >
                        <div className="w-4 h-4 border-[2px] border-current rounded flex items-center justify-center pointer-events-none">
                            {isSelectionMode && <div className="w-2 h-2 bg-current rounded-[1px]" />}
                        </div>
                        {isSelectionMode ? "Seleção Ativa" : "Selecionar"}
                    </button>
                </div>
            </div>

            {/* KANBAN BOARD */}
            < div className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar-x" >
                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="flex h-full gap-6 min-w-max">
                        {stages.map((stage) => {
                            const stageDeals = filteredDeals.filter((deal) => String(deal.stage_id) === String(stage.id));
                            const stageValue = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);

                            const isInbox = stage.is_inbox === true;
                            return (
                                <StrictModeDroppable key={stage.id} droppableId={String(stage.id)}>
                                    {(provided, dropSnapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className="w-[320px] flex flex-col h-full max-h-full"
                                        >
                                            {/* Header da Coluna */}
                                            <div className="mb-3 px-1">
                                                {isInbox ? (
                                                    /* Header DESTACADO da Lead Entrada */
                                                    <div className="h-1 w-full rounded-full mb-3 bg-gradient-to-r from-indigo-500 to-indigo-400"></div>
                                                ) : (
                                                    <div className="h-1 w-full rounded-full mb-3 opacity-80" style={{ backgroundColor: stage.color }}></div>
                                                )}

                                                <div className="flex justify-between items-start">
                                                    <h3 className={`font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 ${isInbox ? 'text-indigo-700' : 'text-gray-700'}`}>
                                                        {isInbox && <Inbox className="w-3.5 h-3.5" />}
                                                        {stage.name}
                                                        {isInbox && (
                                                            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-indigo-100 text-indigo-700 font-bold">
                                                                ENTRADA
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] text-gray-400 font-medium flex items-center gap-2">
                                                            {stageDeals.length} leads

                                                            {isSelectionMode && stageDeals.length > 0 && (
                                                                <button
                                                                    onClick={() => handleSelectAllInStage(stageDeals)}
                                                                    className="text-gray-400 hover:text-blue-600 transition-colors ml-1"
                                                                    title="Selecionar Todos desta Etapa"
                                                                >
                                                                    {stageDeals.every(d => selectedDeals.includes(d.id)) ? (
                                                                        <CheckSquare size={14} className="text-blue-600" />
                                                                    ) : (
                                                                        <Square size={14} />
                                                                    )}
                                                                </button>
                                                            )}
                                                        </span>
                                                        {stageValue > 0 && (
                                                            <span className="text-[10px] text-gray-400 font-medium">
                                                                R$ {stageValue.toLocaleString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {isInbox && (
                                                    <p className="text-[10px] text-indigo-600/70 mt-1 leading-tight">
                                                        Conversas novas chegam aqui. Arraste para promover a deal.
                                                    </p>
                                                )}
                                            </div>

                                            {/* Área dos Cards (Background Container) */}
                                            <div className={`flex-1 overflow-y-auto rounded-xl p-2 border space-y-3 custom-scrollbar scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent transition-colors ${
                                                isInbox
                                                    ? 'bg-indigo-50/40 border-indigo-200/60'
                                                    : 'bg-gray-100/50 border-black/5'
                                            } ${dropSnapshot.isDraggingOver ? 'ring-2 ring-indigo-300' : ''}`}>
                                                {stageDeals.map((deal, index) =>
                                                    isInbox ? (
                                                        <InboxKanbanCard
                                                            key={deal.id}
                                                            deal={deal}
                                                            index={index}
                                                            isSelectionMode={isSelectionMode}
                                                            isSelected={selectedDeals.includes(deal.id)}
                                                            onToggleSelection={toggleSelection}
                                                        />
                                                    ) : (
                                                        <KanbanCard
                                                            key={deal.id}
                                                            deal={deal}
                                                            index={index}
                                                            fields={fields}
                                                            isSelectionMode={isSelectionMode}
                                                            isSelected={selectedDeals.includes(deal.id)}
                                                            onToggleSelection={toggleSelection}
                                                        />
                                                    )
                                                )}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </StrictModeDroppable>
                            )
                        })}
                    </div>
                </DragDropContext>
            </div >


            {/* MODAL NOVO LEAD */}
            <NewLeadModal
                isOpen={isNewLeadModalOpen}
                onClose={() => setIsNewLeadModalOpen(false)}
                onSuccess={() => fetchData()} // Recarrega os dados ao criar
            />

            {/* Floating Bulk Action Bar */}
            {
                selectedDeals.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-4 rounded-xl shadow-2xl z-40 flex items-center gap-4 animate-in slide-in-from-bottom-5 w-[90%] max-w-2xl border border-slate-700">
                        <div className="font-semibold whitespace-nowrap border-r border-slate-700 pr-4 mr-2">
                            {selectedDeals.length} selecionados
                        </div>

                        <div className="flex items-center gap-3 flex-1">
                            {showBulkOwnerSelect ? (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-5">
                                    <select
                                        value={bulkOwnerId}
                                        onChange={(e) => setBulkOwnerId(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white h-9 rounded-md text-sm px-3 focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    >
                                        <option value="">Selecione novo responsável...</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                        ))}
                                    </select>
                                    <button onClick={handleBulkChangeOwner} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-sm font-bold">Salvar</button>
                                    <button onClick={() => setShowBulkOwnerSelect(false)} className="px-3 py-1.5 hover:bg-slate-800 rounded-md text-sm">Cancelar</button>
                                </div>
                            ) : showBulkMemberSelect ? (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-5">
                                    <select
                                        value={bulkMemberId}
                                        onChange={(e) => setBulkMemberId(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white h-9 rounded-md text-sm px-3 focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    >
                                        <option value="">Selecione novo participante...</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                        ))}
                                    </select>
                                    <button onClick={handleBulkAddMember} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-sm font-bold">Adicionar</button>
                                    <button onClick={() => setShowBulkMemberSelect(false)} className="px-3 py-1.5 hover:bg-slate-800 rounded-md text-sm">Cancelar</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={() => setShowBulkOwnerSelect(true)}
                                        className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors border border-slate-700"
                                    >
                                        Alterar Responsável
                                    </button>
                                    <button
                                        onClick={() => setShowBulkMemberSelect(true)}
                                        className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors border border-slate-700"
                                    >
                                        Adicionar Participante
                                    </button>
                                    {filterStatus === 'lost' && (
                                        <button
                                            onClick={handleBulkRecover}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors border border-emerald-500 shadow-lg shadow-emerald-900/20"
                                        >
                                            Reabrir Leads
                                        </button>
                                    )}
                                </div>
                            )}

                            {!showBulkOwnerSelect && !showBulkMemberSelect && (
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors ml-auto shadow-lg shadow-red-900/20"
                                >
                                    Excluir
                                </button>
                            )}
                        </div>

                        <button className="text-slate-400 hover:text-white" onClick={() => setSelectedDeals([])}>
                            <MoreHorizontal size={16} className="rotate-90 hidden" /> {/* Just spacer or cancel icon? */}
                            <span className="text-xs underline ml-2">Cancelar</span>
                        </button>
                    </div>
                )
            }
        </div >
    );
}
