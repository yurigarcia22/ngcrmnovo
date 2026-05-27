'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ColdLead, ColdLeadStatus } from '@/types/cold-lead';
import { Button, Input, Badge } from '@/components/ui/simple-ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Plus, GitPullRequest, Settings } from 'lucide-react';
import Link from 'next/link';
import { ColdLeadModal } from '@/components/cold-call/ColdLeadModal';
import { AddLeadModal } from '@/components/cold-call/AddLeadModal';
import { StageGroup } from '@/components/cold-call/StageGroup';
import { NichoSelector } from '@/components/cold-call/NichoSelector';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getMembers } from '@/app/(protected)/settings/team/actions';
import { getColdCallPipelinesWithStages, moveColdLeadToStage } from './actions';
import { readCache, writeCache } from '@/lib/board-cache';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AutoDialToggle } from '@/components/cold-call/AutoDialToggle';
import { useAutoDial } from '@/hooks/useAutoDial';
import { FollowUpMetrics } from '@/components/cold-call/FollowUpMetrics';
import { FollowUpBoard } from '@/components/cold-call/FollowUpBoard';
import { getColdCallFollowups, updateColdCallFollowup } from '@/app/actions';

export default function ColdCallPage() {
    const confirm = useConfirm();
    // Top-level Navigation State
    const [activeTab, setActiveTab] = useState<'cold-call' | 'follow-ups'>('cold-call');
    const [filters, setFilters] = useState({
        search: '',
        nicho: 'all',
        status: 'all',
        responsavelId: 'meus_leads',
    });
    // Cache key precisa estar disponivel para os inicializadores abaixo
    const initialCacheKey = `coldcall:leads:meus_leads:all:all:`;
    const [leads, setLeads] = useState<ColdLead[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            return readCache<ColdLead[]>(initialCacheKey) ?? [];
        } catch { return []; }
    });
    const [followups, setFollowups] = useState<any[]>([]);
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [loading, setLoading] = useState(() => {
        if (typeof window === 'undefined') return true;
        try {
            return !(readCache<ColdLead[]>(initialCacheKey)?.length);
        } catch { return true; }
    });
    const [selectedLead, setSelectedLead] = useState<ColdLead | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    // Auto Dial State
    const [isAutoDialEnabled, setIsAutoDialEnabled] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('autoDialEnabled');
        if (saved) setIsAutoDialEnabled(saved === 'true');
    }, []);

    const handleAutoDialToggle = (enabled: boolean) => {
        setIsAutoDialEnabled(enabled);
        localStorage.setItem('autoDialEnabled', String(enabled));
    };

    useAutoDial({ enabled: isAutoDialEnabled, lead: selectedLead });

    // Bulk selection state
    const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
    const [bulkNicho, setBulkNicho] = useState('');
    const [bulkResponsible, setBulkResponsible] = useState('');

    // Cold Call Pipelines (funis customizaveis) — hidrata sincronamente do cache
    const [coldPipelines, setColdPipelines] = useState<any[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            return readCache<any[]>("coldcall:pipelines") ?? [];
        } catch { return []; }
    });
    const [coldPipelinesLoaded, setColdPipelinesLoaded] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return (readCache<any[]>("coldcall:pipelines")?.length ?? 0) > 0;
        } catch { return false; }
    });
    const [selectedColdPipelineId, setSelectedColdPipelineId] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const saved = Number(localStorage.getItem("coldcall:selectedPipelineId") || "");
            return saved || null;
        } catch { return null; }
    });

    const selectedColdPipeline = useMemo(
        () => coldPipelines.find((p: any) => String(p.id) === String(selectedColdPipelineId)) ?? null,
        [coldPipelines, selectedColdPipelineId],
    );
    const coldStages = selectedColdPipeline?.stages ?? [];

    const cacheKey = useMemo(() => {
        const f = filters;
        return `coldcall:leads:${f.responsavelId}:${f.nicho}:${f.status}:${f.search}`;
    }, [filters]);

    const fetchLeads = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.append('search', filters.search);
            if (filters.nicho !== 'all') params.append('nicho', filters.nicho);
            if (filters.status !== 'all') params.append('status', filters.status);
            if (filters.responsavelId) params.append('responsavelId', filters.responsavelId);
            params.append('limit', '1000');

            const res = await fetch(`/api/cold-leads?${params.toString()}`);
            const data = await res.json();
            if (data.data) {
                setLeads(data.data);
                writeCache(cacheKey, data.data);
            }
        } catch (error) {
            console.error('Failed to fetch leads', error);
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    }, [filters, cacheKey]);

    const fetchFollowupsData = useCallback(async () => {
        try {
            // Fetch ALL non-completed followups (pendente + atrasado)
            const [res, resAtrasados] = await Promise.all([
                getColdCallFollowups({ status: 'pendente' }),
                getColdCallFollowups({ status: 'atrasado' }),
            ]);

            let allFollowups: any[] = [];
            if (res.success && res.data) {
                allFollowups.push(...res.data);
            } else {
                console.error('Erro ao buscar followups pendentes:', res.error);
            }
            if (resAtrasados.success && resAtrasados.data) {
                allFollowups.push(...resAtrasados.data);
            } else {
                console.error('Erro ao buscar followups atrasados:', resAtrasados.error);
            }

            console.log('[FollowUps] Loaded:', allFollowups.length, 'followups');
            setFollowups(allFollowups);
        } catch (err) {
            console.error('[FollowUps] Fetch error:', err);
        }
    }, []);

    const fetchMembers = useCallback(async () => {
        const res = await getMembers();
        if (res.success && res.profiles) {
            setTeamMembers(res.profiles);
        }
    }, []);

    const fetchPipelinesOnce = useCallback(async () => {
        try {
            const res = await fetch('/api/crm/pipelines');
            if (res.ok) {
                const data = await res.json();
                setPipelines(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error('Failed to fetch pipelines', e);
        }
    }, []);

    const fetchColdPipelines = useCallback(async () => {
        try {
            const res = await getColdCallPipelinesWithStages();
            if (res.success && res.data) {
                setColdPipelines(res.data);
                writeCache("coldcall:pipelines", res.data);
                // Seleciona o default na primeira carga
                if (!selectedColdPipelineId) {
                    const def = res.data.find((p: any) => p.is_default) ?? res.data[0];
                    if (def) setSelectedColdPipelineId(def.id);
                }
            }
        } finally {
            setColdPipelinesLoaded(true);
        }
    }, [selectedColdPipelineId]);

    // Persiste o pipeline selecionado pra restaurar entre navegacoes
    useEffect(() => {
        if (selectedColdPipelineId) {
            try { localStorage.setItem("coldcall:selectedPipelineId", String(selectedColdPipelineId)); } catch {}
        }
    }, [selectedColdPipelineId]);

    const handleMoveStage = async (leadId: string, newStageId: number | string) => {
        const stageIdNum = Number(newStageId);
        // Optimistic update
        setLeads((current) =>
            current.map((l) => (l.id === leadId ? { ...l, stage_id: stageIdNum } as any : l))
        );

        const res = await moveColdLeadToStage(leadId, stageIdNum);
        if (!res.success) {
            toast.error('Erro ao mover lead');
            fetchLeads();
        } else {
            toast.success('Lead movido');
        }
    };

    useEffect(() => {
        // Se ja tem cache pintado, faz refresh em background (silent=true,
        // sem trocar loading state). Caso contrario, primeira carga normal.
        const hasCachedLeads = (readCache<any[]>(cacheKey)?.length ?? 0) > 0;
        (async () => {
            await Promise.all([
                fetchLeads(hasCachedLeads ? { silent: true } : undefined),
                fetchMembers(),
                fetchFollowupsData(),
                fetchPipelinesOnce(),
                fetchColdPipelines(),
            ]);
        })();
    }, [fetchLeads, fetchMembers, fetchFollowupsData, fetchPipelinesOnce, fetchColdPipelines, cacheKey]);

    const handleCallClick = (lead: ColdLead) => {
        setSelectedLead(lead);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedLead(null);
        fetchLeads();
        fetchFollowupsData(); // Refresh followups after modal close
    };

    const handleNextLead = () => {
        if (!selectedLead) return;
        const currentStatus = selectedLead.status;
        const leadsInStatus = leads.filter(l => l.status === currentStatus);
        const currentIndex = leadsInStatus.findIndex(l => l.id === selectedLead.id);

        if (currentIndex !== -1 && currentIndex < leadsInStatus.length - 1) {
            setSelectedLead(leadsInStatus[currentIndex + 1]);
        }
    };

    const hasNext = () => {
        if (!selectedLead) return false;
        const currentStatus = selectedLead.status;
        const leadsInStatus = leads.filter(l => l.status === currentStatus);
        const currentIndex = leadsInStatus.findIndex(l => l.id === selectedLead.id);
        return currentIndex !== -1 && currentIndex < leadsInStatus.length - 1;
    };

    // Bulk Actions
    const toggleSelection = useCallback((id: string) => {
        setSelectedLeads(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    }, []);

    const handleBulkUpdate = async () => {
        if (!selectedLeads.length) return;
        if (!bulkNicho && !bulkResponsible) {
            toast.error("Selecione um nicho ou responsável para aplicar.");
            return;
        }

        const updates: any = {};
        if (bulkNicho) updates.nicho = bulkNicho;
        if (bulkResponsible) updates.responsavel_id = bulkResponsible;

        const toastId = toast.loading('Aplicando alterações em massa...');

        try {
            const res = await fetch('/api/cold-leads/bulk', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: selectedLeads,
                    updates
                })
            });

            if (!res.ok) throw new Error('Falha ao atualizar em massa');

            const data = await res.json();
            toast.success(`${data.count || selectedLeads.length} leads atualizados!`, { id: toastId });

            // Clear selection and inputs
            setSelectedLeads([]);
            setBulkNicho('');
            setBulkResponsible('');

            // Refresh
            fetchLeads();

        } catch (error) {
            console.error(error);
            toast.error('Erro ao processar atualização em massa', { id: toastId });
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedLeads.length) return;
        const ok = await confirm({
            title: "Excluir leads?",
            description: `Tem certeza que deseja excluir ${selectedLeads.length} leads permanentemente?`,
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;

        const toastId = toast.loading('Excluindo leads...');

        try {
            const res = await fetch('/api/cold-leads/bulk', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedLeads })
            });

            if (!res.ok) throw new Error('Falha ao excluir em massa');

            const data = await res.json();
            toast.success(`${data.count || selectedLeads.length} leads excluídos!`, { id: toastId });

            // Clear selection
            setSelectedLeads([]);

            // Refresh
            fetchLeads();

        } catch (error) {
            console.error(error);
            toast.error('Erro ao excluir leads', { id: toastId });
        }
    };

    const handleDeleteLead = useCallback(async (leadId: string) => {
        const ok = await confirm({
            title: "Excluir lead?",
            description: "Excluir este lead permanentemente?",
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;

        // Optimistic update
        setLeads(prev => prev.filter(l => l.id !== leadId));

        try {
            const res = await fetch(`/api/cold-leads/${leadId}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Falha ao excluir lead');
            toast.success('Lead excluído');
        } catch (error) {
            toast.error('Erro ao excluir lead');
            fetchLeads(); // Revert
        }
    }, [fetchLeads, confirm]);

    // --- Optimized Navigation Logic ---
    const handleLeadUpdate = useCallback((updatedLead: ColdLead) => {
        setLeads(currentLeads => 
            currentLeads.map(l => l.id === updatedLead.id ? updatedLead : l)
        );
        setSelectedLead(current => current?.id === updatedLead.id ? updatedLead : current);
    }, []);

    const handleActionComplete = useCallback((updatedLead: ColdLead) => {
        setLeads(currentLeads => {
            const currentLeadIndex = currentLeads.findIndex(l => l.id === updatedLead.id);
            if (currentLeadIndex === -1) return currentLeads;

            const oldStatus = currentLeads[currentLeadIndex].status;
            const newStatus = updatedLead.status;
            const updatedLeadId = updatedLead.id;

            // Find next lead logic based on OLD status grouping (usually we stay in same group or move)
            // If status changed, we still want to move to next lead in the OLD status list usually?
            // User flow: I am calling "João" in "Novo Lead". I mark/move him to "Qualificado".
            // I want to see the NEXT "Novo Lead", not follow João.
            // So we look for neighbors in the oldStatus group.

            // Filter leads that matched the OLD status (before this update)
            // Note: currentLeads still has the old status for this lead.
            const leadsInSameStatus = currentLeads.filter(l => l.status === oldStatus);
            const indexInGroup = leadsInSameStatus.findIndex(l => l.id === updatedLeadId);

            let nextLead = null;
            if (indexInGroup !== -1 && indexInGroup < leadsInSameStatus.length - 1) {
                nextLead = leadsInSameStatus[indexInGroup + 1];
            }

            const updatedLeads = [...currentLeads];
            updatedLeads[currentLeadIndex] = updatedLead;

            if (nextLead) {
                setSelectedLead(nextLead);
            } else {
                // If no next lead in this group, maybe close or just clear selection
                setIsModalOpen(false);
                setSelectedLead(null);
                toast('Fim da lista para esta etapa!');
            }

            return updatedLeads;
        });
        fetchFollowupsData(); // Refresh followups after action
    }, [fetchFollowupsData]);

    return (
        <div className="p-6 space-y-6 bg-white min-h-screen relative pb-24">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Prospecção Ativa</h1>
                    <p className="text-muted-foreground text-sm">"Simplicidade em larga escala vence sofisticação procrastinadora."</p>
                </div>
                <div className="flex gap-2 items-center">
                    <AutoDialToggle enabled={isAutoDialEnabled} onChange={handleAutoDialToggle} />
                    <NotificationBell />
                    <Button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Lead
                    </Button>
                    <Button onClick={() => fetchLeads()} variant="outline" size="sm">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Recarregar
                    </Button>
                </div>
            </div>

            {/* Metrics Dashboard */}
            <FollowUpMetrics
                metrics={{
                    totalHoje: followups.filter(f => {
                        const today = new Date().toISOString().split('T')[0];
                        return f.data_agendada === today && f.status !== 'concluido';
                    }).length,
                    manha: followups.filter(f => f.periodo === 'manha' && f.status !== 'concluido' && f.status !== 'atrasado').length,
                    tarde: followups.filter(f => (f.periodo === 'tarde' || f.periodo === 'noite' || f.periodo === 'qualquer') && f.status !== 'concluido' && f.status !== 'atrasado').length,
                    atrasados: followups.filter(f => f.status === 'atrasado').length,
                    concluidosHoje: followups.filter(f => f.status === 'concluido').length,
                    semFollowup: leads.filter(l => !['convertido', 'perdido', 'sem_interesse', 'numero_inexistente'].includes(l.status)).length - followups.filter(f => f.status === 'pendente').length,
                }}
            />

            {/* View Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-lg w-fit mb-6">
                <button
                    onClick={() => setActiveTab('cold-call')}
                    className={`px-6 py-2 rounded-md font-semibold text-sm transition-all ${activeTab === 'cold-call' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Fila de Cold Call
                </button>
                <button
                    onClick={() => setActiveTab('follow-ups')}
                    className={`px-6 py-2 rounded-md font-semibold text-sm transition-all flex items-center gap-2 ${activeTab === 'follow-ups' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Follow-ups do Dia
                    <span className="bg-red-500 text-white text-[10px] uppercase px-2 py-0.5 rounded-full font-bold">Hoje</span>
                </button>
            </div>

            {activeTab === 'cold-call' && (
                <Card className="border-none shadow-none bg-transparent animate-in fade-in zoom-in-95 duration-200">
                    <CardContent className="p-0">
                        <div className="flex gap-4 items-center mb-6">
                            <div className="relative w-64 flex gap-2">
                                <Input
                                    placeholder="Buscar..."
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                    className="bg-white"
                                />
                                <Button
                                    variant={isSelectionMode ? "default" : "outline"}
                                    className={isSelectionMode ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white text-slate-600 border-slate-200"}
                                    onClick={() => {
                                        if (isSelectionMode) setSelectedLeads([]);
                                        setIsSelectionMode(!isSelectionMode);
                                    }}
                                >
                                    {isSelectionMode ? "Cancelar" : "Selecionar"}
                                </Button>
                            </div>
                            <div className="w-56">
                                <NichoSelector
                                    value={filters.nicho === 'all' ? '' : filters.nicho}
                                    onChange={(val) => setFilters({ ...filters, nicho: val || 'all' })}
                                    placeholder="Filtrar por Nicho..."
                                />
                            </div>
                            {/* SELETOR DE FUNIL DE COLD CALL */}
                            <div className="w-64 flex items-center gap-1">
                                <GitPullRequest className="w-4 h-4 text-indigo-500 shrink-0" />
                                <select
                                    className="flex-1 h-10 rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={selectedColdPipelineId ?? ""}
                                    onChange={(e) => setSelectedColdPipelineId(Number(e.target.value))}
                                    title="Funil de prospecção"
                                >
                                    {coldPipelines.length === 0 && (
                                        <option value="">Sem funis...</option>
                                    )}
                                    {coldPipelines.map((p: any) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} {p.is_default ? "★" : ""}
                                        </option>
                                    ))}
                                </select>
                                <Link
                                    href="/settings/pipelines"
                                    className="p-1 text-slate-400 hover:text-indigo-600"
                                    title="Gerenciar funis"
                                >
                                    <Settings className="w-4 h-4" />
                                </Link>
                            </div>
                            <div className="w-56">
                                <select
                                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                                    value={filters.responsavelId}
                                    onChange={(e) => setFilters({ ...filters, responsavelId: e.target.value })}
                                >
                                    <option value="meus_leads">Meus Leads</option>
                                    <option value="all">Todos Responsáveis</option>
                                    {teamMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                    ))}
                                </select>
                            </div>

                            {(filters.status !== 'all' || filters.nicho !== 'all' || filters.responsavelId !== 'meus_leads' || filters.search) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFilters({ search: '', nicho: 'all', status: 'all', responsavelId: 'meus_leads' })}
                                    className="text-slate-500 hover:text-slate-900"
                                >
                                    Limpar
                                </Button>
                            )}

                            {selectedLeads.length > 0 && (
                                <div className="ml-auto text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-2">
                                    <span className="bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{selectedLeads.length}</span>
                                    selecionados
                                    <button className="ml-2 text-slate-400 hover:text-slate-600 text-xs underline" onClick={() => setSelectedLeads([])}>Limpar</button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            {loading || !coldPipelinesLoaded ? (
                                <div className="text-center py-10 text-muted-foreground">Carregando funil...</div>
                            ) : coldStages.length > 0 ? (
                                // Kanban dinamico: agrupa por stage_id do funil selecionado
                                (() => {
                                    const followupLeadIds = new Set(followups.map(f => f.cold_lead_id));
                                    return coldStages.map((stage: any) => {
                                        const stageLeads = leads.filter((l: any) => Number(l.stage_id) === Number(stage.id));
                                        return (
                                            <StageGroup
                                                key={stage.id}
                                                stage={stage}
                                                allStages={coldStages}
                                                leads={stageLeads}
                                                onCallClick={handleCallClick}
                                                onMoveStage={handleMoveStage}
                                                selectedLeads={selectedLeads}
                                                onToggleSelection={isSelectionMode ? toggleSelection : undefined}
                                                isSelectionMode={isSelectionMode}
                                                onDeleteClick={handleDeleteLead}
                                                followupLeadIds={followupLeadIds}
                                            />
                                        );
                                    });
                                })()
                            ) : (
                                <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-3 border border-dashed border-slate-200 rounded-xl">
                                    <p className="font-medium">Nenhum funil de Cold Call configurado.</p>
                                    <Link
                                        href="/settings/pipelines?kind=cold_call"
                                        className="text-sm text-indigo-600 hover:text-indigo-700 underline"
                                    >
                                        Criar funil em Configurações &gt; Funis
                                    </Link>
                                </div>
                            )}
                            {coldStages.length > 0 && leads.length === 0 && !loading && (
                                <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2">
                                    <p>Nenhum lead encontrado com estes filtros.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'follow-ups' && (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                    <FollowUpBoard
                        followups={followups}
                        onRowClick={(followup) => {
                            // Find the lead from our leads list that matches this followup's cold_lead_id
                            const lead = leads.find(l => l.id === followup.cold_lead_id);
                            if (lead) {
                                setSelectedLead(lead);
                                setIsModalOpen(true);
                            } else {
                                toast.error('Lead não encontrado na lista atual.');
                            }
                        }}
                        onActionClick={async (id, action) => {
                            if (action === 'complete') {
                                // Mark followup as completed
                                const res = await updateColdCallFollowup(id, { status: 'concluido' });
                                if (res.success) {
                                    toast.success('Follow-up concluído!');
                                    // Find the current followup index and advance to next
                                    const currentIndex = followups.findIndex(f => f.id === id);
                                    const nextFollowup = followups[currentIndex + 1];
                                    if (nextFollowup) {
                                        const nextLead = leads.find(l => l.id === nextFollowup.cold_lead_id);
                                        if (nextLead) {
                                            setSelectedLead(nextLead);
                                            setIsModalOpen(true);
                                        }
                                    }
                                    fetchFollowupsData();
                                } else {
                                    toast.error('Erro ao concluir follow-up.');
                                }
                            } else if (action === 'call') {
                                // Find lead and trigger SIP call
                                const followup = followups.find(f => f.id === id);
                                if (followup?.cold_leads?.telefone) {
                                    const cleanPhone = followup.cold_leads.telefone.replace(/\D/g, "");
                                    let sipPhone = cleanPhone;
                                    if (cleanPhone.length === 10 || cleanPhone.length === 11) sipPhone = "+55" + cleanPhone;
                                    window.location.href = `sip:${sipPhone}`;
                                }
                                // Also open the modal
                                const lead = leads.find(l => l.id === followup?.cold_lead_id);
                                if (lead) {
                                    setSelectedLead(lead);
                                    setIsModalOpen(true);
                                }
                            } else if (action === 'whatsapp') {
                                const followup = followups.find(f => f.id === id);
                                if (followup?.cold_leads?.telefone) {
                                    const cleanPhone = followup.cold_leads.telefone.replace(/\D/g, "");
                                    window.open(`https://wa.me/55${cleanPhone}`, '_blank');
                                }
                            }
                        }}
                    />
                </div>
            )}

            {/* Floating Bulk Action Bar */}
            {selectedLeads.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-4 rounded-xl shadow-2xl z-40 flex items-center gap-4 animate-in slide-in-from-bottom-5 w-[90%] max-w-4xl border border-slate-700">
                    <div className="font-semibold whitespace-nowrap border-r border-slate-700 pr-4 mr-2">
                        {selectedLeads.length} leads
                    </div>

                    <div className="flex items-center gap-3 flex-1 overflow-x-auto">
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Novo Nicho..."
                                className="bg-slate-800 border-slate-700 text-white w-40 h-10 placeholder:text-slate-500 focus:ring-slate-500"
                                value={bulkNicho}
                                onChange={(e) => setBulkNicho(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <select
                                className="bg-slate-800 border-slate-700 text-white h-10 rounded-md text-sm px-3 focus:outline-none focus:ring-2 focus:ring-slate-500"
                                value={bulkResponsible}
                                onChange={(e) => setBulkResponsible(e.target.value)}
                            >
                                <option value="">Alterar Responsável...</option>
                                {teamMembers.map(m => (
                                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pl-4 border-l border-slate-700">
                        <Button onClick={() => setSelectedLeads([])} variant="ghost" className="text-slate-400 hover:text-white hover:bg-slate-800">
                            Cancelar
                        </Button>
                        <Button onClick={handleBulkUpdate} className="bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/50">
                            Aplicar Alterações
                        </Button>
                        <Button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-900/20 ml-2">
                            Excluir
                        </Button>
                    </div>
                </div>
            )}

            {selectedLead && (
                <ColdLeadModal
                    lead={selectedLead}
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                    teamMembers={teamMembers}
                    pipelines={pipelines}
                    onNext={handleNextLead}
                    hasNext={hasNext()}
                    onActionComplete={handleActionComplete}
                    onLeadUpdate={handleLeadUpdate}
                />
            )}

            <AddLeadModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={fetchLeads}
            />
        </div>
    );
}
