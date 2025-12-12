"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import confetti from "canvas-confetti";
import { markAsWon, getTeamMembers } from "@/app/actions";
import { getPipelines, getBoardData } from "./actions";
// Removed standalone getFields import as it is now in getBoardData
import { GitPullRequest, Link as LinkIcon } from "lucide-react";

import {
    MessageCircle,
    Search,
    Plus,
    User,
    Bell,
    MoreHorizontal
} from "lucide-react";
import DealModal from "@/components/DealModal";
import NewLeadModal from "@/components/NewLeadModal";
import FilterBar from "@/components/kanban/FilterBar";
import { DragDropContext, Draggable } from "@hello-pangea/dnd";
import { StrictModeDroppable } from "@/components/StrictModeDroppable";
import KanbanCard from "@/components/KanbanCard";

export default function LeadsPage() {
    // Inicializa o cliente Supabase usando o utilitário do projeto (@supabase/ssr)
    const supabase = createClient();
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

    const [stages, setStages] = useState<any[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
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

    // Realtime & Polling
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

        const interval = setInterval(() => {
            if (selectedPipelineId) loadBoard(selectedPipelineId);
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
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

        // 2. Busca tags e time
        const { data: tagsData } = await supabase.from("tags").select("*").order("name");
        const teamResult = await getTeamMembers();

        if (teamResult.success) setTeamMembers(teamResult.data || []);
        if (tagsData) setTags(tagsData);
    }

    async function loadBoard(pipelineId: string) {
        // setLoading(true); // Maybe don't full screen load on switch to be smoother?

        const res = await getBoardData(pipelineId);
        if (res.success) {
            setStages(res.stages || []);
            setDeals(res.deals || []);
            if (res.fieldDefinitions) setFields(res.fieldDefinitions);

            // Update selectedDeal if open
            if (selectedDeal && res.deals) {
                const updatedSelectedDeal = res.deals.find((d: any) => d.id === selectedDeal.id);
                if (updatedSelectedDeal) setSelectedDeal(updatedSelectedDeal);
            }
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
            }

        } catch (error: any) {
            console.error("Falha ao mover card:", error);
            alert("Erro ao mover: " + (error.message || "Erro desconhecido"));
            setDeals(oldDeals); // Rollback em caso de erro
        }
    };

    // Lógica de Filtro
    const filteredDeals = deals.filter(deal => {
        // 0. OWNER FILTER (Novo)
        if (filterOwner !== 'all' && filterOwner !== 'loading') {
            if (deal.owner_id !== filterOwner) return false;
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

    if (loading) return <div suppressHydrationWarning className="flex h-screen items-center justify-center bg-[#f5f7f8] text-gray-600">Carregando CRM...</div>;

    return (
        <div suppressHydrationWarning className="flex flex-col h-screen overflow-hidden bg-[#f5f7f8]">

            {/* HEADER */}
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-gray-800">Leads</h1>

                    {/* Pipeline Selector */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-1.5 shadow-sm hover:border-gray-300 transition-colors">
                        <GitPullRequest size={16} className="text-blue-600" />
                        <select
                            value={selectedPipelineId}
                            onChange={(e) => setSelectedPipelineId(e.target.value)}
                            className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer min-w-[120px]"
                        >
                            {pipelines.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Owner Filter Component (Inline for now) */}
                        <div className="flex items-center gap-2 bg-white rounded-md px-2 py-1.5 border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
                            <User size={14} className="text-gray-500" />
                            <select
                                value={filterOwner}
                                onChange={(e) => setFilterOwner(e.target.value)}
                                className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                            >
                                <option value="all">Todos</option>
                                <option disabled value="loading">Carregando user...</option>
                                {teamMembers.map((member) => (
                                    <option key={member.id} value={member.id}>
                                        {/* Mostra 'Meus Leads' apenas se o membro for o usuário logado */}
                                        {member.id === currentUserId ? 'Meus Leads' : member.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Filter Bar Component */}
                        <FilterBar
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            filterTag={filterTag}
                            setFilterTag={setFilterTag}
                            filterDate={filterDate}
                            setFilterDate={setFilterDate}
                            availableTags={tags}
                        />

                        {/* Status Filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as 'active' | 'lost')}
                            className="bg-white border border-gray-200 text-gray-700 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer shadow-sm"
                        >
                            <option value="active">Ativos</option>
                            <option value="lost">Perdidos</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button className="text-gray-500 hover:text-gray-700 relative">
                        <Bell size={20} />
                        <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                    </button>
                    <button
                        onClick={() => setIsNewLeadModalOpen(true)}
                        className="bg-[#2d76f9] hover:bg-[#2363d6] text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                    >
                        <Plus size={16} />
                        Novo Lead
                    </button>
                </div>
            </header>

            {/* KANBAN BOARD */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar-x">
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
                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                            {stageDeals.length} leads
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
                                                        onClick={setSelectedDeal}
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
            </div>


            {/* MODAL DE CHAT */}
            {
                selectedDeal && (
                    <DealModal
                        isOpen={!!selectedDeal}
                        onClose={() => setSelectedDeal(null)}
                        deal={selectedDeal}
                        onUpdate={() => fetchData()}
                    />
                )
            }

            {/* MODAL NOVO LEAD */}
            <NewLeadModal
                isOpen={isNewLeadModalOpen}
                onClose={() => setIsNewLeadModalOpen(false)}
                onSuccess={() => fetchData()} // Recarrega os dados ao criar
            />
        </div >
    );
}
