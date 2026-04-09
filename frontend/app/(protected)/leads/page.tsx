"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import confetti from "canvas-confetti";
import { markAsWon, recoverDeal, getTeamMembers, deleteDeals, updateDeals, addDealMember } from "@/app/actions";
import { getPipelines, getBoardData } from "./actions";
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
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function LeadsPage() {
    // Inicializa o cliente Supabase usando o utilitário do projeto (@supabase/ssr)
    const supabase = createClient();
    const confirm = useConfirm();
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

    const [stages, setStages] = useState<any[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);

    // Custom Fields
    const [fields, setFields] = useState<any[]>([]); // All fields definitions

    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<'active' | 'lost'>('active');
    const [tags, setTags] = useState<any[]>([]);
    const [filterTag, setFilterTag] = useState('all');
    const [filterDate, setFilterDate] = useState('all');

    // Owner Filter (New)
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [filterOwner, setFilterOwner] = useState('loading'); // Começa loading para não mostrar 'todos' antes de saber quem sou
    const [currentUserId, setCurrentUserId] = useState<string>("");

    // Bulk Actions
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedDeals, setSelectedDeals] = useState<string[]>([]);

    // Bulk Change Owner
    const [showBulkOwnerSelect, setShowBulkOwnerSelect] = useState(false);
    const [bulkOwnerId, setBulkOwnerId] = useState("");

    // Bulk Add Member
    const [showBulkMemberSelect, setShowBulkMemberSelect] = useState(false);
    const [bulkMemberId, setBulkMemberId] = useState("");



    // Busca dados ao carregar
    // Busca dados ao carregar (Pipelines, Tags, Team)
    useEffect(() => {
        loadInitialData();
    }, []);

    // Atualiza board quando pipeline muda
    useEffect(() => {
        if (selectedPipelineId) {
            loadBoard(selectedPipelineId);
        }
    }, [selectedPipelineId]);

    // Realtime (polling removido - redundante com subscription)
    useEffect(() => {
        const channel = supabase
            .channel('crm-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, (payload) => {
                console.log('Realtime DEAL update:', payload);
                if (selectedPipelineId) loadBoard(selectedPipelineId);
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                console.log('Realtime MESSAGE update:', payload);
                if (selectedPipelineId) loadBoard(selectedPipelineId);
            })
            .subscribe((status) => {
                console.log("Status da conexão Realtime (Leads):", status);
            });

        return () => {
            supabase.removeChannel(channel);
        }
    }, [selectedPipelineId]);

    async function loadInitialData() {
        // 0. Identifica usuário - IMPORTANTE para o filtro default
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
            if (filterOwner === 'loading') {
                setFilterOwner(user.id);
            }
        }

        // 1. Load Pipelines
        const pipeRes = await getPipelines();
        if (pipeRes.success && pipeRes.data && pipeRes.data.length > 0) {
            setPipelines(pipeRes.data);

            // If no selected pipeline, select first
            if (!selectedPipelineId) {
                setSelectedPipelineId(pipeRes.data[0].id);
                // loadBoard will be triggered by useEffect [selectedPipelineId]
            }
        }

        // 2. Busca tags e time e produtos
        const [tagsResult, teamResult] = await Promise.all([
            supabase.from("tags").select("*").order("name"),
            getTeamMembers()
        ]);

        if (teamResult.success) setTeamMembers(teamResult.data || []);
        if (tagsResult.data) setTags(tagsResult.data);
    }

    async function loadBoard(pipelineId: string) {
        // setLoading(true); // Maybe don't full screen load on switch to be smoother?

        const res = await getBoardData(pipelineId);
        if (res.success) {
            setStages(res.stages || []);
            setDeals(res.deals || []);
            if (res.fieldDefinitions) setFields(res.fieldDefinitions);


        }
        setLoading(false);
    }

    // Alias for compatibility with other calls like onSuccess
    const fetchData = () => {
        if (selectedPipelineId) loadBoard(selectedPipelineId);
    };



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

        console.log('Movendo Deal:', dealId, 'Para Estágio:', newStageId);

        // Optimistic UI: Atualiza estado local imediatamente
        const oldDeals = [...deals];
        const updatedDeals = deals.map((deal) => {
            // Comparação segura convertendo ambos para string
            if (String(deal.id) === dealId) {
                return { ...deal, stage_id: newStageId };
            }
            return deal;
        });

        setDeals(updatedDeals);

        try {
            const { data: session } = await supabase.auth.getSession();
            console.log('DEBUG RLS:', {
                user_id: session.session?.user.id,
                deal_id: dealId,
                new_stage: newStageId
            });

            // Atualiza no Supabase (Stage)
            const { data, error } = await supabase
                .from("deals")
                .update({ stage_id: newStageId })
                .eq("id", dealId)
                .select();

            if (error) console.error('ERRO SUPABASE PURO:', error);
            console.log('LINHAS AFETADAS:', data?.length);

            if (error) throw error;

            if (!data || data.length === 0) {
                throw new Error("Você não tem permissão para mover este lead (Tenant ID incorreto).");
            }

            // Lógica de GANHO (WIN)
            // Verifica se é a última etapa
            const lastStage = stages[stages.length - 1];
            // Comparação solta (==) para garantir que string "1" == number 1
            if (lastStage && newStageId == lastStage.id) {
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
            setDeals(oldDeals); // Rollback em caso de erro
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

        // 2. Filtro de Tag
        if (filterTag !== 'all') {
            const hasTag = deal.deal_tags?.some((dt: any) => dt.tags?.id === filterTag);
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

                            return (
                                <StrictModeDroppable key={stage.id} droppableId={String(stage.id)}>
                                    {(provided) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className="w-[320px] flex flex-col h-full max-h-full"
                                        >
                                            {/* Header da Coluna */}
                                            <div className="mb-3 px-1">
                                                {/* Color Line (Top Border Effect) */}
                                                <div className="h-1 w-full rounded-full mb-3 opacity-80" style={{ backgroundColor: stage.color }}></div>

                                                <div className="flex justify-between items-start">
                                                    <h3 className="font-bold text-gray-700 text-xs uppercase tracking-wider">{stage.name}</h3>
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
                                            </div>

                                            {/* Área dos Cards (Background Container) */}
                                            <div className="flex-1 overflow-y-auto bg-gray-100/50 rounded-xl p-2 border border-black/5 space-y-3 custom-scrollbar scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                                                {stageDeals.map((deal, index) => (
                                                    <KanbanCard
                                                        key={deal.id}
                                                        deal={deal}
                                                        index={index}
                                                        fields={fields}
                                                        // onClick={() => { }} // Navigation handled internally by KanbanCard
                                                        isSelectionMode={isSelectionMode}
                                                        isSelected={selectedDeals.includes(deal.id)}
                                                        onToggleSelection={toggleSelection}
                                                    />
                                                ))}
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
