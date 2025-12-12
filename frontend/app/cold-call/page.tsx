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

export default function ColdCallPage() {
    const [leads, setLeads] = useState<ColdLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        nicho: 'all',
    });
    const [selectedLead, setSelectedLead] = useState<ColdLead | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const fetchLeads = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.append('search', filters.search);
            // We fetch ALL status to group them on frontend, unless filtering specifically, but ClickUp view implies seeing all groups.
            // If user filters by status, we might just show that group, but let's keep all for now to maintain the "Board/List" feel.
            if (filters.nicho !== 'all') params.append('nicho', filters.nicho);

            // Limit might need to be higher for this view or handled via "Load More" per group eventually.
            params.append('limit', '100');

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

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const handleCallClick = (lead: ColdLead) => {
        setSelectedLead(lead);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedLead(null);
        fetchLeads();
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

    // Group leads
    const groupedLeads: Record<ColdLeadStatus, ColdLead[]> = {
        'novo_lead': [],
        'lead_qualificado': [],
        'ligacao_feita': [],
        'contato_realizado': [],
        'contato_decisor': [],
        'reuniao_marcada': []
    };

    leads.forEach(lead => {
        if (groupedLeads[lead.status]) {
            groupedLeads[lead.status].push(lead);
        }
    });

    const statusConfig: { status: ColdLeadStatus; color: string }[] = [
        { status: 'novo_lead', color: 'bg-slate-500' },
        { status: 'lead_qualificado', color: 'bg-blue-400' },
        { status: 'ligacao_feita', color: 'bg-blue-600' },
        { status: 'contato_realizado', color: 'bg-indigo-500' },
        { status: 'contato_decisor', color: 'bg-purple-600' },
        { status: 'reuniao_marcada', color: 'bg-green-600' },
    ];

    return (
        <div className="p-6 space-y-6 bg-white min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Prospecção Ativa</h1>
                    <p className="text-muted-foreground text-sm">"Simplicidade em larga escala vence sofisticação procrastinadora."</p>
                </div>
                <div className="flex gap-2">
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

            <Card className="border-none shadow-none bg-transparent">
                <CardContent className="p-0">
                    <div className="flex gap-4 items-center mb-6">
                        <div className="relative w-64">
                            <Input
                                placeholder="Buscar..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                className="bg-white"
                            />
                        </div>
                        <div className="w-64">
                            <NichoSelector
                                value={filters.nicho === 'all' ? '' : filters.nicho}
                                onChange={(val) => setFilters({ ...filters, nicho: val || 'all' })}
                                placeholder="Filtrar por Nicho..."
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        {loading ? (
                            <div className="text-center py-10 text-muted-foreground">Carregando leads...</div>
                        ) : (
                            statusConfig.map((config) => (
                                <StatusGroup
                                    key={config.status}
                                    status={config.status}
                                    colorClass={config.color}
                                    leads={groupedLeads[config.status]}
                                    onCallClick={handleCallClick}
                                    onStatusChange={handleStatusChange}
                                />
                            ))
                        )}
                    </div>

                </CardContent>
            </Card>

            {selectedLead && (
                <ColdLeadModal
                    lead={selectedLead}
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
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
