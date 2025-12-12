'use client';

import { useState } from 'react';
import { ColdLead } from '@/types/cold-lead';
import { Button, Input, Textarea } from '@/components/ui/simple-ui';
import { Copy, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';

interface ColdLeadModalProps {
    lead: ColdLead;
    isOpen: boolean;
    onClose: () => void;
}

export function ColdLeadModal({ lead: initialLead, isOpen, onClose }: ColdLeadModalProps) {
    const [lead, setLead] = useState(initialLead);
    const [notes, setNotes] = useState('');
    const [nextCallDate, setNextCallDate] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência');
    };

    const handleResult = async (result: string) => {
        // Validation for date if result implies follow-up, though in new funnel 'reuniao_marcada' might need it or 'ligacao_feita' might not.
        // Let's keep it loose or add specific checks if requested. 
        // For now, no strict date required unless typically 'follow_up' (which isn't a direct status anymore, but maybe 'Ligação Feita' needs it?)
        // User didn't specify validation rules.

        setLoading(true);
        try {
            const res = await fetch(`/api/cold-leads/${lead.id}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resultado: result,
                    proximaLigacao: nextCallDate ? new Date(nextCallDate).toISOString() : null,
                    notas: notes,
                }),
            });

            if (!res.ok) throw new Error('Falha ao registrar resultado');

            const updatedLead = await res.json();

            toast.success('Resultado registrado com sucesso.');
            onClose();

        } catch (error) {
            toast.error('Não foi possível salvar o resultado.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative z-50 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl transition-all">

                {/* Header */}
                <div className="flex items-center justify-between border-b pb-4 mb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold">Ligando para: {lead.nome}</h2>
                        <span className="text-sm font-normal text-muted-foreground bg-slate-100 px-3 py-1 rounded-full border">
                            {lead.nicho}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Lead Info */}
                    <div className="lg:col-span-1 space-y-6 border-r pr-6">
                        <div className="space-y-4">
                            <div>
                                <label className="text-muted-foreground text-xs uppercase tracking-wide font-semibold block mb-1">Telefone</label>
                                <div className="flex items-center space-x-2">
                                    <span className="text-xl font-mono font-medium">{lead.telefone}</span>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(lead.telefone)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <label className="text-muted-foreground text-xs uppercase tracking-wide font-semibold block mb-1">Links</label>
                                <div className="flex flex-col space-y-2">
                                    {lead.google_meu_negocio_url && (
                                        <a href={lead.google_meu_negocio_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 hover:underline">
                                            <ExternalLink className="h-4 w-4 mr-2" /> Google Meu Negócio
                                        </a>
                                    )}
                                    {lead.site_url && (
                                        <a href={lead.site_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 hover:underline">
                                            <ExternalLink className="h-4 w-4 mr-2" /> Site Web
                                        </a>
                                    )}
                                    {lead.instagram_url && (
                                        <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-pink-600 hover:underline">
                                            <ExternalLink className="h-4 w-4 mr-2" /> Instagram
                                        </a>
                                    )}
                                    {!lead.google_meu_negocio_url && !lead.site_url && !lead.instagram_url && (
                                        <span className="text-sm text-muted-foreground">Nenhum link cadastrado.</span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                <div>
                                    <label className="text-muted-foreground text-xs font-semibold block">Tentativas</label>
                                    <div className="text-lg font-semibold">{lead.tentativas || 0}</div>
                                </div>
                                <div>
                                    <label className="text-muted-foreground text-xs font-semibold block">Último Resultado</label>
                                    <div className="text-sm text-slate-700">{lead.ultimo_resultado || '-'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Interaction */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="space-y-2">
                            <label htmlFor="notes" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Notas da Ligação</label>
                            <Textarea
                                id="notes"
                                placeholder="Digite aqui anotações sobre a conversa..."
                                className="min-h-[150px]"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">O histórico de notas anteriores não é exibido aqui (veja na lista), apenas adicione novas notas.</p>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="next-call" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Agendar Follow-up (data/hora)</label>
                            <Input
                                id="next-call"
                                type="datetime-local"
                                value={nextCallDate}
                                onChange={(e) => setNextCallDate(e.target.value)}
                            />
                        </div>

                        <div className="pt-6 border-t mt-6">
                            <label className="block mb-4 text-base font-semibold">Resultado da Ligação</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <Button
                                    variant="outline"
                                    className="justify-start border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                    onClick={() => handleResult('nao_atendeu')}
                                    disabled={loading}
                                >
                                    🚫 Não Atendeu
                                </Button>
                                <Button
                                    variant="outline"
                                    className="justify-start border-slate-200 hover:bg-blue-50 text-blue-700 hover:text-blue-800"
                                    onClick={() => handleResult('lead_qualificado')}
                                    disabled={loading}
                                >
                                    ✅ Lead Qualificado
                                </Button>
                                <Button
                                    variant="outline"
                                    className="justify-start border-slate-200 hover:bg-sky-50 text-sky-700 hover:text-sky-800"
                                    onClick={() => handleResult('ligacao_feita')}
                                    disabled={loading}
                                >
                                    📞 Ligação Feita
                                </Button>
                                <Button
                                    variant="outline"
                                    className="justify-start border-slate-200 hover:bg-indigo-50 text-indigo-700 hover:text-indigo-800"
                                    onClick={() => handleResult('contato_realizado')}
                                    disabled={loading}
                                >
                                    💬 Contato Realizado
                                </Button>
                                <Button
                                    variant="outline"
                                    className="justify-start border-slate-200 hover:bg-purple-50 text-purple-700 hover:text-purple-800"
                                    onClick={() => handleResult('contato_decisor')}
                                    disabled={loading}
                                >
                                    👔 Falou com Decisor
                                </Button>
                                <Button
                                    className="justify-start bg-green-600 hover:bg-green-700 text-white col-span-2 md:col-span-1"
                                    onClick={() => handleResult('reuniao_marcada')}
                                    disabled={loading}
                                >
                                    📅 Reunião Marcada
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
