"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import confetti from "canvas-confetti";
import { markAsWon } from "../actions";

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
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// Conexão com Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LeadsPage() {
    const [stages, setStages] = useState<any[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
    const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<'active' | 'lost'>('active');
    const [tags, setTags] = useState<any[]>([]);
    const [filterTag, setFilterTag] = useState('all');
    const [filterDate, setFilterDate] = useState('all');

    // Busca dados ao carregar
    useEffect(() => {
        fetchData();

        // Assina atualizações em tempo real (Realtime) para novos leads
        const channel = supabase
            .channel('crm-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
                fetchData(); // Recarrega se algo mudar no banco
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); }
    }, []);

    async function fetchData() {
        // 1. Busca as Etapas (Colunas)
        const { data: stagesData } = await supabase
            .from("stages")
            .select("*")
            .order("position");

        // 2. Busca os Negócios (Cards) com dados do Contato e Tags
        const { data: dealsData } = await supabase
            .from("deals")
            .select("*, contacts(id, name, phone), deal_tags(tags(id, name, color))")
            .order("updated_at", { ascending: false });

        // 3. Busca todas as Tags para o filtro
        const { data: tagsData } = await supabase
            .from("tags")
            .select("*")
            .order("name");

        if (stagesData) setStages(stagesData);
        if (tagsData) setTags(tagsData);
        if (dealsData) {
            setDeals(dealsData);
            // Se tiver um deal selecionado (Modal aberto), atualiza ele também para refletir mudanças (ex: tags)
            if (selectedDeal) {
                const updatedSelectedDeal = dealsData.find((d: any) => d.id === selectedDeal.id);
                if (updatedSelectedDeal) {
                    setSelectedDeal(updatedSelectedDeal);
                }
            }
        }
        setLoading(false);
    }

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
        const newStageId = parseInt(destination.droppableId);

        // Optimistic UI: Atualiza estado local imediatamente
        const oldDeals = [...deals];
        const updatedDeals = deals.map((deal) => {
            if (deal.id === dealId) {
                return { ...deal, stage_id: newStageId };
            }
            return deal;
        });

        setDeals(updatedDeals);

        try {
            // Atualiza no Supabase (Stage)
            const { error } = await supabase
                .from("deals")
                .update({ stage_id: newStageId })
                .eq("id", dealId);

            if (error) throw error;

            // Lógica de GANHO (WIN)
            // Verifica se é a última etapa
            const lastStage = stages[stages.length - 1];
            if (lastStage && newStageId === lastStage.id) {
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
            console.error("Erro ao mover card:", error);
            alert("Erro ao salvar a movimentação: " + (error.message || "Erro desconhecido"));
            setDeals(oldDeals); // Rollback em caso de erro
        }
    };

    // Lógica de Filtro
    const filteredDeals = deals.filter(deal => {
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

    if (loading) return <div className="flex h-screen items-center justify-center bg-[#f0f2f5] text-gray-600">Carregando CRM...</div>;

    return (
        <div className="flex flex-col h-screen overflow-hidden">

            {/* HEADER */}
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-gray-800">Leads</h1>

                    <div className="flex items-center gap-2">
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
                            className="bg-gray-100 border border-gray-200 text-gray-700 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
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
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="flex h-full gap-4 min-w-max">
                        {stages.map((stage) => (
                            <Droppable key={stage.id} droppableId={String(stage.id)}>
                                {(provided) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className="w-[300px] flex flex-col h-full"
                                    >
                                        {/* Header da Coluna */}
                                        <div className="mb-3 pb-2 border-b border-gray-200 flex justify-between items-end px-1">
                                            <div className="flex flex-col w-full">
                                                {/* Barra colorida no topo */}
                                                <div className="h-1 w-full rounded-full mb-2" style={{ backgroundColor: stage.color }}></div>
                                                <div className="flex justify-between items-center">
                                                    <h3 className="font-bold text-gray-500 text-xs uppercase tracking-wider">{stage.name}</h3>
                                                    <span className="text-xs text-gray-400 font-medium">
                                                        {filteredDeals.filter(d => String(d.stage_id) === String(stage.id)).length} leads
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Área dos Cards */}
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                                            {filteredDeals
                                                .filter((deal) => String(deal.stage_id) === String(stage.id))
                                                .map((deal, index) => (
                                                    <Draggable key={deal.id} draggableId={String(deal.id)} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                onClick={() => setSelectedDeal(deal)}
                                                                className={`bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all group relative overflow-hidden ${snapshot.isDragging ? "shadow-2xl ring-2 ring-[#2d76f9] rotate-2 scale-105 z-50" : ""} ${deal.status === 'lost' ? 'opacity-75 grayscale-[0.5]' : ''}`}
                                                                style={{
                                                                    ...provided.draggableProps.style,
                                                                    zIndex: snapshot.isDragging ? 9999 : "auto"
                                                                }}
                                                            >
                                                                {/* Conteúdo do Card */}
                                                                <div className="flex gap-3">
                                                                    {/* Avatar */}
                                                                    <div className="flex-shrink-0">
                                                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-sm border border-gray-100">
                                                                            {deal.contacts?.name?.charAt(0).toUpperCase() || <User size={16} />}
                                                                        </div>
                                                                    </div>

                                                                    {/* Infos */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex justify-between items-start">
                                                                            <h4 className="font-semibold text-gray-800 text-sm truncate" title={deal.contacts?.name}>
                                                                                {deal.contacts?.name || 'Sem nome'}
                                                                            </h4>
                                                                            <MoreHorizontal size={14} className="text-gray-300 hover:text-gray-500" />
                                                                        </div>

                                                                        <p className="text-xs text-[#2d76f9] font-medium truncate mb-1">{deal.title}</p>

                                                                        {/* TAGS (NOVO) */}
                                                                        {deal.deal_tags && deal.deal_tags.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                                {deal.deal_tags.map((dt: any, i: number) => (
                                                                                    <span
                                                                                        key={i}
                                                                                        className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                                                                                        style={{ backgroundColor: dt.tags?.color || '#999' }}
                                                                                    >
                                                                                        {dt.tags?.name}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {/* Bolha de Mensagem (Simulação) */}
                                                                        <div className="bg-blue-50 p-2 rounded-md rounded-tl-none mb-2 relative">
                                                                            <p className="text-[10px] text-gray-600 line-clamp-2 leading-tight">
                                                                                Olá, gostaria de saber mais sobre o plano...
                                                                            </p>
                                                                        </div>

                                                                        {/* Footer do Card */}
                                                                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
                                                                            <div className="flex items-center gap-1">
                                                                                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">
                                                                                    <MessageCircle size={8} fill="white" />
                                                                                </div>
                                                                                <span className="text-[10px] text-gray-400">
                                                                                    {new Date(deal.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                                                                </span>
                                                                            </div>

                                                                            {deal.value > 0 && (
                                                                                <span className="text-xs font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                    R$ {deal.value.toLocaleString('pt-BR', { notation: "compact" })}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                            {provided.placeholder}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        ))}
                    </div>
                </DragDropContext>
            </div>

            {/* MODAL DE CHAT */}
            {selectedDeal && (
                <DealModal
                    isOpen={!!selectedDeal}
                    onClose={() => setSelectedDeal(null)}
                    deal={selectedDeal}
                    onUpdate={() => fetchData()}
                />
            )}

            {/* MODAL NOVO LEAD */}
            <NewLeadModal
                isOpen={isNewLeadModalOpen}
                onClose={() => setIsNewLeadModalOpen(false)}
                onSuccess={() => fetchData()} // Recarrega os dados ao criar
            />
        </div>
    );
}
