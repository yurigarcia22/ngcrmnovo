'use client';

import { useState, useEffect } from 'react';
import { ColdLead, ColdLeadStatus } from '@/types/cold-lead';
import { Button, Input, Textarea } from '@/components/ui/simple-ui';
import { Copy, ExternalLink, X, Calendar, Filter, ArrowRight, ChevronRight, User, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPipelines, getStages } from '@/app/(protected)/settings/pipelines/actions';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check } from 'lucide-react';

interface ColdLeadModalProps {
    lead: ColdLead;
    isOpen: boolean;
    onClose: () => void;
    teamMembers?: any[];
    onNext?: () => void;
    hasNext?: boolean;
    onActionComplete?: (updatedLead: ColdLead) => void;
}

export function ColdLeadModal({ lead: initialLead, isOpen, onClose, teamMembers = [], onNext, hasNext = false, onActionComplete }: ColdLeadModalProps) {
    const [lead, setLead] = useState(initialLead);
    const [notes, setNotes] = useState(initialLead.notas || '');
    const [nextCallDate, setNextCallDate] = useState(initialLead.proxima_ligacao ? new Date(initialLead.proxima_ligacao).toISOString().slice(0, 16) : '');
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Edit Form State
    const [editForm, setEditForm] = useState(initialLead);

    // Sync internal state with prop changes (for navigation)
    useEffect(() => {
        setLead(initialLead);
        setEditForm(initialLead);
        setNotes(initialLead.notas || '');
        setNextCallDate(initialLead.proxima_ligacao ? new Date(initialLead.proxima_ligacao).toISOString().slice(0, 16) : '');
        setIsEditing(false);
    }, [initialLead]);

    // Meeting Scheduler State
    const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [stages, setStages] = useState<any[]>([]);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
    const [selectedStageId, setSelectedStageId] = useState<string>('');
    const [schedulerLoading, setSchedulerLoading] = useState(false);

    if (!isOpen) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência');
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/cold-leads/${lead.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: editForm.nome,
                    nicho: editForm.nicho,
                    telefone: editForm.telefone,
                    google_meu_negocio_url: editForm.google_meu_negocio_url,
                    site_url: editForm.site_url,
                    instagram_url: editForm.instagram_url
                })
            });

            if (!res.ok) throw new Error('Falha ao salvar alterações');

            const updatedLead = await res.json();
            setLead(prev => ({ ...prev, ...editForm }));
            setIsEditing(false);
            toast.success('Lead atualizado com sucesso!');
        } catch (error) {
            toast.error('Erro ao atualizar lead');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.')) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/cold-leads/${lead.id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Falha ao excluir lead');

            toast.success('Lead excluído com sucesso!');
            onClose(); // Close modal
            // Ideally trigger a refresh in parent, but simple close works for now as user sees list
            // We might want to clear it from the list optimistically if we had the handler
            if (onActionComplete) {
                // Hack: Pass a special status or just close and let user refresh
                // Let's just reload page or let parent handle
                window.location.reload();
            }
        } catch (error) {
            toast.error('Erro ao excluir lead');
            setLoading(false);
        }
    };

    const handleResponsibleChange = async (userId: string) => {
        const promise = fetch(`/api/cold-leads/${lead.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responsavel_id: userId })
        });

        toast.promise(promise, {
            loading: 'Atualizando responsável...',
            success: 'Responsável atualizado!',
            error: 'Erro ao atualizar responsável'
        });

        const res = await promise;
        if (res.ok) {
            setLead(prev => ({ ...prev, responsavel_id: userId }));
        }
    };

    // --- Meeting Scheduler Logic ---
    const handleReuniaoMarcadaClick = async () => {
        setIsMeetingModalOpen(true);
        setSchedulerLoading(true);
        try {
            const res = await getPipelines();
            if (res.success && res.data) {
                setPipelines(res.data);
                // Select first by default if available
                if (res.data.length > 0) {
                    const firstPipelineId = res.data[0].id;
                    setSelectedPipelineId(firstPipelineId);

                    // Load stages for the first pipeline
                    const stageRes = await getStages(firstPipelineId);
                    if (stageRes.success && stageRes.data) {
                        setStages(stageRes.data);
                        // Auto-select first stage
                        if (stageRes.data.length > 0) {
                            setSelectedStageId(stageRes.data[0].id);
                        }
                    }
                }
            }
        } catch (error) {
            toast.error("Erro ao carregar funis.");
        } finally {
            setSchedulerLoading(false);
        }
    };

    // Load stages when pipeline changes
    const handlePipelineChange = async (pipelineId: string) => {
        setSelectedPipelineId(pipelineId);
        setSelectedStageId('');
        if (!pipelineId) {
            setStages([]);
            return;
        }

        setSchedulerLoading(true);
        try {
            const res = await getStages(pipelineId);
            if (res.success && res.data) {
                setStages(res.data);
                if (res.data.length > 0) {
                    setSelectedStageId(res.data[0].id);
                }
            }
        } catch (error) {
            toast.error("Erro ao carregar etapas.");
        } finally {
            setSchedulerLoading(false);
        }
    };

    const confirmMeeting = async () => {
        if (!selectedPipelineId || !selectedStageId) {
            toast.error("Selecione o funil e a etapa.");
            return;
        }

        // Call handleResult with extra params
        await handleResult('reuniao_marcada', { pipelineId: selectedPipelineId, stageId: selectedStageId });
        setIsMeetingModalOpen(false);
    };

    const handleResult = async (result: string, extraData?: { pipelineId: string, stageId: string }) => {
        setLoading(true);
        try {
            const payload: any = {
                resultado: result,
                proximaLigacao: nextCallDate ? new Date(nextCallDate).toISOString() : null,
                notas: notes,
            };

            if (extraData) {
                payload.pipeline_id = extraData.pipelineId;
                payload.stage_id = extraData.stageId;
            }

            const res = await fetch(`/api/cold-leads/${lead.id}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('Falha ao registrar resultado');

            const updatedLead = await res.json();

            toast.success('Resultado registrado com sucesso.');

            // TRIGGER PARENT ADVANCE instead of closing, if prop exists
            if (onActionComplete) {
                onActionComplete(updatedLead);
            } else {
                onClose();
            }

        } catch (error) {
            toast.error('Não foi possível salvar o resultado.');
            setLoading(false);
        } finally {
            // setLoading(false); // Handled in catch or kept true if advancing? 
            // Better to reset loading if we stay.
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                className={`relative z-50 w-full overflow-y-auto rounded-xl bg-white shadow-2xl transition-all ${isMeetingModalOpen ? 'max-w-lg' : 'max-w-4xl max-h-[90vh]'
                    }`}
            >
                {isMeetingModalOpen ? (
                    /* Meeting Scheduler View */
                    <div className="flex flex-col animate-in fade-in-0 zoom-in-95 duration-200">
                        {/* Beautiful Header */}
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white rounded-t-xl">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-blue-200 text-sm font-medium mb-1">
                                        <Calendar className="w-4 h-4" />
                                        <span>Agendamento</span>
                                    </div>
                                    <h2 className="text-2xl font-bold tracking-tight">Criar Oportunidade</h2>
                                    <p className="text-slate-300 text-sm">Selecione o destino deste lead no funil.</p>
                                </div>
                                <button
                                    onClick={() => setIsMeetingModalOpen(false)}
                                    className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Funil de Vendas</Label>
                                    <Select
                                        value={selectedPipelineId}
                                        onValueChange={handlePipelineChange}
                                        disabled={schedulerLoading}
                                    >
                                        <SelectTrigger className="bg-slate-50 border-slate-200 h-11 focus:ring-blue-500 focus:border-blue-500">
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <Filter className="w-4 h-4 text-slate-400" />
                                                <SelectValue placeholder="Selecione o funil..." />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent className="z-[70] bg-white border-slate-100 shadow-lg">
                                            {pipelines.map(p => (
                                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Etapa do Funil</Label>
                                    <Select
                                        value={selectedStageId}
                                        onValueChange={setSelectedStageId}
                                        disabled={!selectedPipelineId || schedulerLoading}
                                    >
                                        <SelectTrigger className="bg-slate-50 border-slate-200 h-11 focus:ring-blue-500 focus:border-blue-500">
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <ArrowRight className="w-4 h-4 text-slate-400" />
                                                <SelectValue placeholder="Selecione a etapa..." />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent className="z-[70] bg-white border-slate-100 shadow-lg">
                                            {stages.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Info Box */}
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                <div className="bg-blue-100 p-2 rounded-full h-fit">
                                    <Check className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="text-sm text-blue-900">
                                    <p className="font-semibold mb-1">O que acontece agora?</p>
                                    <p className="opacity-90">O lead será movido para o Kanban na etapa selecionada e um evento de "Reunião Marcada" será registrado.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-2 flex justify-end gap-3 bg-slate-50/50 rounded-b-xl border-t border-slate-100">
                            <Button variant="ghost" onClick={() => setIsMeetingModalOpen(false)} className="hover:bg-slate-100 text-slate-600">Cancelar</Button>
                            <Button
                                onClick={confirmMeeting}
                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 gap-2 px-6"
                            >
                                <Check className="w-4 h-4" />
                                Confirmar Agendamento
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Standard Lead View */
                    <div className="flex flex-col h-full bg-white">
                        {/* Header Gradient */}
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-t-xl text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1 flex-1 mr-4">
                                    <div className="flex items-center gap-3">
                                        {isEditing ? (
                                            <Input
                                                value={editForm.nome}
                                                onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                                className="text-xl font-bold text-slate-900 bg-white/90 border-transparent focus:border-blue-500 h-9"
                                            />
                                        ) : (
                                            <h2 className="text-2xl font-bold tracking-tight">{lead.nome}</h2>
                                        )}

                                        {isEditing ? (
                                            <Input
                                                value={editForm.nicho}
                                                onChange={e => setEditForm({ ...editForm, nicho: e.target.value })}
                                                className="w-32 text-xs font-bold bg-white/90 text-slate-900 h-7"
                                            />
                                        ) : (
                                            <span className="text-xs font-bold tracking-wider text-slate-900 bg-blue-200 px-2 py-0.5 rounded uppercase border border-blue-300">
                                                {lead.nicho}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-slate-400 text-sm flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                        Em prospecção ativa
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2 mr-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsEditing(false)}
                                                className="text-white/70 hover:text-white hover:bg-white/10"
                                            >
                                                Cancelar
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={handleSave}
                                                className="bg-green-500 hover:bg-green-600 text-white border-0"
                                                disabled={loading}
                                            >
                                                Salvar
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setIsEditing(true)}
                                                className="rounded-full text-white/70 hover:bg-white/10 hover:text-white mr-1"
                                                title="Editar Lead"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleDelete}
                                                className="rounded-full text-white/70 hover:bg-red-500/20 hover:text-red-200 mr-2"
                                                title="Excluir Lead"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}

                                    {onNext && !isEditing && (
                                        <Button
                                            variant="ghost"
                                            onClick={onNext}
                                            disabled={!hasNext}
                                            className={`text-white hover:bg-white/10 hover:text-white gap-2 transition-all ${!hasNext ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title="Próximo Lead (mesma etapa)"
                                        >
                                            <span className="text-sm font-medium hidden sm:inline">{hasNext ? 'Próximo' : 'Fim'}</span>
                                            <ChevronRight className="h-5 w-5" />
                                        </Button>
                                    )}
                                    <div className="w-px h-6 bg-white/20 mx-1"></div>
                                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Left Column: Lead Info */}
                            <div className="lg:col-span-1 space-y-6 lg:border-r lg:pr-6 border-slate-100">
                                <div className="space-y-6">
                                    {/* Responsible */}
                                    <div className="space-y-2">
                                        <Label className="text-slate-400 text-xs uppercase tracking-wider font-bold block">Responsável</Label>
                                        <Select
                                            value={lead.responsavel_id || 'unassigned'}
                                            onValueChange={(val) => handleResponsibleChange(val === 'unassigned' ? '' : val)}
                                        >
                                            <SelectTrigger className="bg-slate-50 border-slate-200 focus:ring-slate-400 text-slate-700 font-medium">
                                                <div className="flex items-center gap-2 text-slate-700">
                                                    <User className="w-4 h-4 text-slate-400" />
                                                    <SelectValue placeholder="Sem responsável" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent className="bg-white">
                                                <SelectItem value="unassigned">-- Sem Responsável --</SelectItem>
                                                {teamMembers.map(member => (
                                                    <SelectItem key={member.id} value={member.id}>
                                                        {member.full_name || member.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                        <label className="text-slate-400 text-xs uppercase tracking-wider font-bold block mb-2">Telefone</label>
                                        <div className="flex items-center justify-between group">
                                            {isEditing ? (
                                                <Input
                                                    value={editForm.telefone}
                                                    onChange={e => setEditForm({ ...editForm, telefone: e.target.value })}
                                                    className="font-mono bg-white"
                                                />
                                            ) : (
                                                <span className="text-xl font-mono font-medium text-slate-700">{lead.telefone}</span>
                                            )}
                                            {!isEditing && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                    onClick={() => copyToClipboard(lead.telefone)}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-slate-400 text-xs uppercase tracking-wider font-bold block mb-3">Links</label>
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-slate-500">Google Meu Negócio</Label>
                                                    <Input
                                                        value={editForm.google_meu_negocio_url || ''}
                                                        onChange={e => setEditForm({ ...editForm, google_meu_negocio_url: e.target.value })}
                                                        placeholder="URL do GMN"
                                                        className="h-8 bg-white"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-slate-500">Site</Label>
                                                    <Input
                                                        value={editForm.site_url || ''}
                                                        onChange={e => setEditForm({ ...editForm, site_url: e.target.value })}
                                                        placeholder="URL do Site"
                                                        className="h-8 bg-white"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-slate-500">Instagram</Label>
                                                    <Input
                                                        value={editForm.instagram_url || ''}
                                                        onChange={e => setEditForm({ ...editForm, instagram_url: e.target.value })}
                                                        placeholder="URL do Instagram"
                                                        className="h-8 bg-white"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col space-y-2">
                                                {lead.google_meu_negocio_url && (
                                                    <a href={lead.google_meu_negocio_url} target="_blank" rel="noopener noreferrer" className="flex items-center p-2 rounded-md hover:bg-slate-50 transition-colors group">
                                                        <div className="bg-blue-100 p-1.5 rounded mr-3 group-hover:bg-blue-600 transition-colors">
                                                            <ExternalLink className="h-3.5 w-3.5 text-blue-600 group-hover:text-white" />
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-600 group-hover:text-blue-700">Google Meu Negócio</span>
                                                    </a>
                                                )}
                                                {lead.site_url && (
                                                    <a href={lead.site_url} target="_blank" rel="noopener noreferrer" className="flex items-center p-2 rounded-md hover:bg-slate-50 transition-colors group">
                                                        <div className="bg-emerald-100 p-1.5 rounded mr-3 group-hover:bg-emerald-600 transition-colors">
                                                            <ExternalLink className="h-3.5 w-3.5 text-emerald-600 group-hover:text-white" />
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-600 group-hover:text-emerald-700">Site Web</span>
                                                    </a>
                                                )}
                                                {lead.instagram_url && (
                                                    <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center p-2 rounded-md hover:bg-slate-50 transition-colors group">
                                                        <div className="bg-pink-100 p-1.5 rounded mr-3 group-hover:bg-pink-600 transition-colors">
                                                            <ExternalLink className="h-3.5 w-3.5 text-pink-600 group-hover:text-white" />
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-600 group-hover:text-pink-700">Instagram</span>
                                                    </a>
                                                )}
                                                {!lead.google_meu_negocio_url && !lead.site_url && !lead.instagram_url && (
                                                    <div className="p-4 text-center border-2 border-dashed border-slate-100 rounded-lg">
                                                        <span className="text-sm text-slate-400">Nenhum link cadastrado.</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                        <div>
                                            <label className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tentativas</label>
                                            <div className="text-2xl font-bold text-slate-700">{lead.tentativas || 0}</div>
                                        </div>
                                        <div>
                                            <label className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Último Resultado</label>
                                            <div className="text-sm font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block">
                                                {lead.ultimo_resultado || '-'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Interaction */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="space-y-3">
                                    <label htmlFor="notes" className="text-sm font-semibold text-slate-700">Notas da Ligação</label>
                                    <Textarea
                                        id="notes"
                                        placeholder="Digite aqui anotações importantes sobre a conversa..."
                                        className="min-h-[150px] resize-none border-slate-200 focus:border-blue-500 focus:ring-blue-500 bg-slate-50/50"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                    />
                                    <p className="text-xs text-slate-400 flex items-center gap-1">
                                        <span className="w-1 h-1 bg-slate-400 rounded-full inline-block"></span>
                                        O histórico anterior não é exibido aqui.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label htmlFor="next-call" className="text-sm font-semibold text-slate-700">Agendar Follow-up</label>
                                    <Input
                                        id="next-call"
                                        type="datetime-local"
                                        className="border-slate-200 focus:border-blue-500 focus:ring-blue-500 bg-slate-50/50"
                                        value={nextCallDate}
                                        onChange={(e) => setNextCallDate(e.target.value)}
                                    />
                                </div>

                                <div className="pt-6 border-t border-slate-100 mt-8">
                                    <label className="block mb-4 text-base font-semibold text-slate-800">Resultado da Ligação</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        <Button
                                            variant="outline"
                                            className="justify-start border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 h-10"
                                            onClick={() => handleResult('numero_inexistente')}
                                            disabled={loading}
                                        >
                                            📵 Número Inexistente
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="justify-start border-slate-200 hover:bg-sky-50 hover:border-sky-200 text-sky-700 hover:text-sky-800 h-10"
                                            onClick={() => handleResult('ligacao_feita')}
                                            disabled={loading}
                                        >
                                            📞 Ligação Feita
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="justify-start border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-700 hover:text-indigo-800 h-10"
                                            onClick={() => handleResult('contato_realizado')}
                                            disabled={loading}
                                        >
                                            💬 Contato Realizado
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="justify-start border-slate-200 hover:bg-purple-50 hover:border-purple-200 text-purple-700 hover:text-purple-800 h-10"
                                            onClick={() => handleResult('contato_decisor')}
                                            disabled={loading}
                                        >
                                            👔 Contato com Decisor
                                        </Button>
                                        <Button
                                            className="justify-start bg-emerald-600 hover:bg-emerald-700 text-white col-span-2 md:col-span-1 shadow-md shadow-emerald-100 h-10"
                                            onClick={handleReuniaoMarcadaClick}
                                            disabled={loading}
                                        >
                                            📅 Reunião Marcada
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
