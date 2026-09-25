"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import confetti from "canvas-confetti";
import { markAsWon, markAsLost, recoverDeal, getTeamMembers, deleteDeals, updateDeals, addDealMember } from "@/app/actions";
import LossReasonDialog from "@/components/deal/LossReasonDialog";
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
import LeadFilters, { EMPTY_FILTERS, type LeadFilterState, type DatePreset } from "@/components/kanban/LeadFilters";
import { getProducts } from "@/app/(protected)/settings/products/actions";
import { DragDropContext, Draggable } from "@hello-pangea/dnd";
import { StrictModeDroppable } from "@/components/StrictModeDroppable";
import KanbanCard from "@/components/KanbanCard";
import InboxKanbanCard from "@/components/InboxKanbanCard";
import { Inbox } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useVocab } from "@/components/providers/VocabProvider";

export default function LeadsPage() {
    const vocab = useVocab();
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

    // Perda por arrasto: guarda o movimento pendente ate o usuario escolher o
    // MOTIVO no modal (obrigatorio). Cancelou -> rollback do card.
    const [pendingLost, setPendingLost] = useState<{ dealId: string; newStageId: number; snapshot: any[] } | null>(null);

    async function handleConfirmDragLost(payload: { lossReasonId?: string; reasonName?: string; details?: string }) {
        if (!pendingLost) return;
        const { dealId, newStageId, snapshot } = pendingLost;

        // OTIMISTA: o lead some da visao "Ativas" AGORA e o modal fecha na hora.
        // O servidor confirma em segundo plano (antes eram 3 idas encadeadas ao
        // servidor antes de qualquer feedback — ~5s de card parado na tela).
        patchBoardDeals((curr) => curr.map((d: any) =>
            String(d.id) === dealId ? { ...d, status: "lost", stage_id: newStageId, closed_at: new Date().toISOString() } : d
        ));
        setPendingLost(null);

        const res: any = await markAsLost(dealId, payload.reasonName, payload.details, payload.lossReasonId);
        if (res?.success === false) {
            toast.error("Erro ao marcar como perdido", res.error);
            patchBoardDeals(() => snapshot); // rollback
            return;
        }

        // Corrige a coluna SO se o funil tem mais de uma coluna de perda
        // (markAsLost move pra primeira; se foi solta em outra, ajusta).
        const firstLost = stages.find((s: any) => s.is_lost === true);
        if (firstLost && Number(firstLost.id) !== Number(newStageId)) {
            await supabase.from("deals").update({ stage_id: newStageId }).eq("id", dealId);
        }
        toast.success("Negócio marcado como perdido");
        invalidateBoard(); // consolida em background
    }

    function handleCancelDragLost(open: boolean) {
        if (!open && pendingLost) {
            patchBoardDeals(() => pendingLost.snapshot); // desfaz o movimento
            setPendingLost(null);
        }
    }

    // Helpers pra persistir filtros no localStorage (sobrevivem F5, navegação e volta de deal)
    const readLs = (k: string, fallback: string) => {
        if (typeof window === "undefined") return fallback;
        try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
    };

    const [searchTerm, setSearchTerm] = useState(() => readLs("filter_searchTerm", ""));
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
    // Produtos pro filtro (server action: ja filtra pelo tenant)
    const productsQuery = useQuery({
        queryKey: ["products", "list"],
        queryFn: async () => {
            const res = await getProducts();
            if (!res.success) throw new Error(res.error ?? "Falha ao carregar produtos");
            return (res.data ?? []).map((p: any) => ({ id: String(p.id), name: p.name }));
        },
        staleTime: 5 * 60_000,
    });
    const productOptions: any[] = productsQuery.data ?? [];

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
    const [currentUserId, setCurrentUserId] = useState<string>("");

    // Filtro APLICADO no quadro. O painel "Filtros" edita um rascunho e so troca
    // isto quando a pessoa clica em Aplicar. Salvo no navegador; na primeira vez
    // importa as chaves antigas (uma por controle, de quando eram 5 filtros soltos).
    const [filters, setFilters] = useState<LeadFilterState>(() => {
        try {
            const saved = readLs("lead_filters_v2", "");
            if (saved) return { ...EMPTY_FILTERS, owner: "loading", ...JSON.parse(saved) };
        } catch { /* cai no formato antigo */ }
        const oldTag = readLs("filter_tag", "all");
        return {
            status: readLs("filter_status", "active") === "lost" ? "lost" : "active",
            owner: readLs("filter_owner", "loading"),
            noTouchToday: readLs("filter_noTouchToday", "0") === "1",
            tags: oldTag !== "all" ? [oldTag] : [],
            products: [],
            date: readLs("filter_date", "all") as DatePreset,
            dateStart: readLs("filter_dateStart", ""),
            dateEnd: readLs("filter_dateEnd", ""),
        };
    });
    const filterStatus = filters.status;

    // Persiste busca e filtro automaticamente
    useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("filter_searchTerm", searchTerm); }, [searchTerm]);
    useEffect(() => {
        if (typeof window === "undefined" || filters.owner === "loading") return;
        try { localStorage.setItem("lead_filters_v2", JSON.stringify(filters)); } catch { /* modo privado */ }
    }, [filters]);

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
                setFilters((f) => (f.owner === 'loading' ? { ...f, owner: user.id } : f));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Quando pipelines carregam, escolhe um valido. IMPORTANTE: se o funil salvo
    // no localStorage foi EXCLUIDO, cai pro padrao — antes ficava preso no id
    // morto e o board aparecia vazio ("sumiu tudo").
    useEffect(() => {
        if (!pipelines.length) return;
        const exists = pipelines.some((p: any) => String(p.id) === String(selectedPipelineId));
        if (selectedPipelineId && exists) return;
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
        const def = pipelines.find((p: any) => p.is_default) ?? pipelines[0];
        setSelectedPipelineId(initialPipeline ?? String(def.id));
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

        // Coluna de PERDA: nao aplica direto — abre o modal de MOTIVO (obrigatorio).
        // A confirmacao chama markAsLost com o motivo; cancelar desfaz o movimento.
        if (newStage?.is_lost === true) {
            setPendingLost({ dealId, newStageId, snapshot: oldDeals });
            return;
        }

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
                // Coluna normal: se o deal vinha de won/lost, reabre para 'open'.
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
        } catch (err: any) {
            console.error(err);
            toast.error("A ação falhou", err?.message || "Tente novamente.");
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
        } catch (err: any) {
            console.error(err);
            toast.error("A ação falhou", err?.message || "Tente novamente.");
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
        } catch (err: any) {
            console.error(err);
            toast.error("A ação falhou", err?.message || "Tente novamente.");
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
        } catch (err: any) {
            console.error(err);
            toast.error("A ação falhou", err?.message || "Tente novamente.");
        }
    };

    // Lógica de Filtro
    const filteredDeals = deals.filter(deal => {
        // 0. Responsável: dono principal OU membro do negócio
        if (filters.owner !== 'all' && filters.owner !== 'loading') {
            const isMember = deal.deal_members?.some((m: any) => m.user_id === filters.owner);
            if (deal.owner_id !== filters.owner && !isMember) return false;
        }

        // 1. Situação (Ativas inclui ganhos; Perdidas só perdidos)
        if (filters.status === 'active') {
            if (deal.status === 'lost') return false;
        } else {
            if (deal.status !== 'lost') return false;
        }

        // 1.5 Modo "sem contato hoje": esconde quem JA recebeu cadencia hoje.
        if (filters.noTouchToday && deal.last_touch_at) {
            const t = new Date(deal.last_touch_at);
            const n = new Date();
            const touchedToday = t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
            if (touchedToday) return false;
        }

        // 2. Etiquetas: basta ter UMA das marcadas (id comparado como texto)
        if (filters.tags.length > 0) {
            const hasTag = deal.deal_tags?.some((dt: any) => filters.tags.includes(String(dt.tags?.id)));
            if (!hasTag) return false;
        }

        // 2.5 Produtos: basta ter UM dos marcados
        if (filters.products.length > 0) {
            const hasProduct = deal.deal_items?.some((it: any) => filters.products.includes(String(it.product_id)));
            if (!hasProduct) return false;
        }

        // 3. Período de entrada do lead
        if (filters.date !== 'all') {
            const dealDate = new Date(deal.created_at);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            if (filters.date === 'today') {
                if (dealDate < today) return false;
            } else if (filters.date === 'last7') {
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(today.getDate() - 7);
                if (dealDate < sevenDaysAgo) return false;
            } else if (filters.date === 'last30') {
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 30);
                if (dealDate < thirtyDaysAgo) return false;
            } else if (filters.date === 'thisMonth') {
                const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                if (dealDate < firstDayOfMonth) return false;
            } else if (filters.date === 'custom') {
                if (filters.dateStart) {
                    const start = new Date(filters.dateStart + 'T00:00:00');
                    if (dealDate < start) return false;
                }
                if (filters.dateEnd) {
                    const end = new Date(filters.dateEnd + 'T23:59:59');
                    if (dealDate > end) return false;
                }
            }
        }

        // 4. Filtro de Busca
        if (!searchTerm) return true;
        const lowerTerm = searchTerm.toLowerCase();
        // Telefone: compara so os digitos, pra achar mesmo digitando com mascara
        // ("(14) 99790" casa com "5514997900022").
        const termDigits = searchTerm.replace(/\D/g, "");
        const phoneDigits = String(deal.contacts?.phone || "").replace(/\D/g, "");
        return (
            deal.title?.toLowerCase().includes(lowerTerm) ||
            deal.contacts?.name?.toLowerCase().includes(lowerTerm) ||
            (termDigits.length >= 3 && phoneDigits.includes(termDigits))
        );
    });

    if (loading) return <div suppressHydrationWarning className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 font-medium">Carregando CRM...</div>;

    return (
        <div suppressHydrationWarning className="flex flex-col h-screen overflow-hidden bg-slate-50">

            {/* HEADER SUPERIOR - Branding e Ação Principal */}
            <header className="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">{vocab.pipeline}</h1>

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
                    {/* Busca continua fora do painel: ela filtra enquanto digita */}
                    <div className="w-72 max-w-full shrink-0 bg-white flex items-center px-3 py-2 rounded-lg border border-slate-200 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 transition-all shadow-sm">
                        <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                        <input
                            type="text"
                            placeholder="Buscar nome ou telefone..."
                            aria-label="Pesquisar leads"
                            className="bg-transparent border-none outline-none text-sm text-slate-700 w-full placeholder-slate-400 font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm("")} aria-label="Limpar busca" className="text-slate-400 hover:text-slate-600 text-xs font-bold ml-1">✕</button>
                        )}
                    </div>

                    <LeadFilters
                        value={filters}
                        onApply={setFilters}
                        tags={tags.map((t: any) => ({ id: String(t.id), name: t.name, color: t.color }))}
                        products={productOptions}
                        teamMembers={teamMembers}
                        currentUserId={currentUserId}
                    />
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {/* Bulk Selection Toggle */}
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
                                                        {vocab.newLeadsHint}
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

            {/* MODAL MOTIVO DE PERDA (arrasto pra coluna de perda) */}
            <LossReasonDialog
                open={!!pendingLost}
                onOpenChange={handleCancelDragLost}
                onConfirm={handleConfirmDragLost}
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
