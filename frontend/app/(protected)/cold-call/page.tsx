'use client';

import { useState, useEffect, useCallback } from 'react';
import { ColdLead, ColdLeadStatus } from '@/types/cold-lead';
import { Button, Input, Badge } from '@/components/ui/simple-ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Plus } from 'lucide-react';
import { ColdLeadModal } from '@/components/cold-call/ColdLeadModal';
import { AddLeadModal } from '@/components/cold-call/AddLeadModal';
import { StatusGroup } from '@/components/cold-call/StatusGroup';
import { NichoSelector } from '@/components/cold-call/NichoSelector';
import { toast } from 'sonner';
import { getMembers } from '@/app/(protected)/settings/team/actions';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AutoDialToggle } from '@/components/cold-call/AutoDialToggle';
import { useAutoDial } from '@/hooks/useAutoDial';
import { FollowUpMetrics } from '@/components/cold-call/FollowUpMetrics';
import { FollowUpBoard } from '@/components/cold-call/FollowUpBoard';
import { getColdCallFollowups, updateColdCallFollowup } from '@/app/actions';

export default function ColdCallPage() {
    // Top-level Navigation State
    const [activeTab, setActiveTab] = useState<'cold-call' | 'follow-ups'>('cold-call');
    const [leads, setLeads] = useState<ColdLead[]>([]);
    const [followups, setFollowups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        nicho: 'all',
        status: 'all',
        responsavelId: 'meus_leads',
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

    const fetchLeads = useCallback(async () => {
        setLoading(true);
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
            }
        } catch (error) {
            console.error('Failed to fetch leads', error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const fetchFollowupsData = useCallback(async () => {
        try {
            // Fetch ALL non-completed followups (pendente + atrasado)
            const res = await getColdCallFollowups({ status: 'pendente' });
            const resAtrasados = await getColdCallFollowups({ status: 'atrasado' });

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

    useEffect(() => {
        fetchLeads();
        fetchMembers();
        fetchFollowupsData();
    }, [fetchLeads, fetchMembers, fetchFollowupsData]);

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

    const handleStatusChange = async (leadId: string, newStatus: ColdLeadStatus) => {
        // Optimistic update
        setLeads(current =>
            current.map(l => l.id === leadId ? { ...l, status: newStatus } : l)
        );

        try {
            const res = await fetch(`/api/cold-leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error('Falha ao atualizar status');
            toast.success('Status atualizado');
        } catch (error) {
            toast.error('Erro ao atualizar status');
            fetchLeads(); // Revert on error
        }
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
        if (!confirm(`Tem certeza que deseja excluir ${selectedLeads.length} leads permanentemente?`)) return;

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
        if (!confirm('Excluir este lead permanentemente?')) return;

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
    }, [fetchLeads]);

    // Group leads
    const groupedLeads: Record<ColdLeadStatus, ColdLead[]> = {
        'novo_lead': [],
        'ligacao_feita': [],
        'contato_realizado': [],
        'contato_decisor': [],
        'reuniao_marcada': [],
        'numero_inexistente': []
    };

    leads.forEach(lead => {
        if (groupedLeads[lead.status]) {
            groupedLeads[lead.status].push(lead);
        }
    });

    const statusConfig: { status: ColdLeadStatus; color: string; label: string }[] = [
        { status: 'novo_lead', color: 'bg-slate-500', label: 'Novo Lead' },
        { status: 'ligacao_feita', color: 'bg-blue-600', label: 'Ligação Feita' },
        { status: 'contato_realizado', color: 'bg-indigo-500', label: 'Contato Realizado' },
        { status: 'contato_decisor', color: 'bg-purple-600', label: 'Contato Decisor' },
        { status: 'reuniao_marcada', color: 'bg-green-600', label: 'Reunião Marcada' },
        { status: 'numero_inexistente', color: 'bg-red-500', label: 'Número Inexistente' },
    ];

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
                    <Button onClick={fetchLeads} variant="outline" size="sm">
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
                            <div className="w-56">
                                <select
                                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                                    value={filters.status}
                                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                >
                                    <option value="all">Todas as Etapas</option>
                                    {statusConfig.map(s => (
                                        <option key={s.status} value={s.status}>{s.label}</option>
                                    ))}
                                </select>
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
                            {loading ? (
                                <div className="text-center py-10 text-muted-foreground">Carregando leads...</div>
                            ) : (
                                statusConfig
                                    .filter(config => filters.status === 'all' || config.status === filters.status)
                                    .map((config) => {
                                        const followupLeadIds = new Set(followups.map(f => f.cold_lead_id));
                                        return (
                                            <StatusGroup
                                                key={config.status}
                                                status={config.status}
                                                colorClass={config.color}
                                                leads={groupedLeads[config.status]}
                                                onCallClick={handleCallClick}
                                                onStatusChange={handleStatusChange}
                                                selectedLeads={selectedLeads}
                                                onToggleSelection={isSelectionMode ? toggleSelection : undefined}
                                                isSelectionMode={isSelectionMode}
                                                onDeleteClick={handleDeleteLead}
                                                followupLeadIds={followupLeadIds}
                                            />
                                        )
                                    })
                            )}
                            {leads.length === 0 && !loading && (
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
