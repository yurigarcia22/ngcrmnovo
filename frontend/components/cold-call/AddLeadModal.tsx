'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Input } from '@/components/ui/simple-ui';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FileSpreadsheet, User, Mail, Phone, Layers, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { getColdCallPipelinesWithStages } from '@/app/(protected)/cold-call/actions';
import { getMembers } from '@/app/(protected)/settings/team/actions';

interface AddLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function AddLeadModal({ isOpen, onClose, onSuccess }: AddLeadModalProps) {
    const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');
    const [loading, setLoading] = useState(false);

    // Manual Form State — fluxo de captacao (webinar): NOME, EMAIL, TELEFONE
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [telefone, setTelefone] = useState('');
    const [stageId, setStageId] = useState('');
    const [responsavelId, setResponsavelId] = useState('');

    // Import State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Funis de cold_call + stages
    const pipelinesQuery = useQuery({
        queryKey: qk.coldCall.pipelines(),
        queryFn: async () => {
            const r = await getColdCallPipelinesWithStages();
            if (!r.success) throw new Error(r.error ?? 'Falha ao carregar funis');
            return (r.data ?? []) as any[];
        },
        enabled: isOpen,
        staleTime: 5 * 60_000,
    });
    const pipelines = pipelinesQuery.data ?? [];

    const teamQuery = useQuery({
        queryKey: qk.team.members(),
        queryFn: async () => {
            const r = await getMembers();
            if (!r.success) throw new Error(r.error ?? 'Falha ao carregar time');
            return (r.profiles ?? []) as any[];
        },
        enabled: isOpen,
        staleTime: 5 * 60_000,
    });
    const team = teamQuery.data ?? [];

    // Todas as stages dos funis cold_call (mostra com prefixo do funil se houver mais de 1)
    const stageOptions = useMemo(() => {
        const opts: { id: string; label: string }[] = [];
        for (const p of pipelines) {
            for (const s of (p.stages ?? [])) {
                const label = pipelines.length > 1 ? `${p.name} › ${s.name}` : s.name;
                opts.push({ id: String(s.id), label });
            }
        }
        return opts;
    }, [pipelines]);

    // Auto-seleciona a primeira stage de entrada do primeiro funil
    useEffect(() => {
        if (!stageId && pipelines.length > 0) {
            const first = pipelines[0];
            const inbox = (first.stages ?? []).find((s: any) => s.is_inbox) ?? (first.stages ?? [])[0];
            if (inbox) setStageId(String(inbox.id));
        }
    }, [pipelines, stageId]);

    function resetForm() {
        setNome('');
        setEmail('');
        setTelefone('');
        setResponsavelId('');
    }

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome.trim() || !telefone.trim()) {
            toast.error('Preencha Nome e Telefone');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/cold-leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: nome.trim(),
                    email: email.trim() || null,
                    telefone: telefone.trim(),
                    stageId: stageId || null,
                    responsavelId: responsavelId || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Erro ao criar lead');
            }

            toast.success('Lead adicionado!');
            resetForm();
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao salvar lead.');
        } finally {
            setLoading(false);
        }
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) {
            toast.error('Selecione um arquivo Excel (.xlsx)');
            return;
        }

        setLoading(true);
        const fd = new FormData();
        fd.append('file', selectedFile);

        try {
            const res = await fetch('/api/cold-leads/import', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Erro na importação');
                return;
            }
            toast.success(`Importação realizada! ${data.totalImported} leads adicionados.`);
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} linhas ignoradas com erros.`);
            }
            onSuccess();
            onClose();
        } catch {
            toast.error('Erro de conexão ao importar.');
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md bg-white p-6 rounded-xl">
                <div className="border-b pb-4 mb-4">
                    <DialogTitle className="text-xl font-bold text-slate-900">Adicionar Lead</DialogTitle>
                </div>

                <div className="flex space-x-2 mb-4 border-b">
                    <button
                        className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('manual')}
                    >
                        Manual
                    </button>
                    <a
                        href="/cold-call/import"
                        className="pb-2 px-4 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-2"
                    >
                        Importar Excel
                        <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full">BETA</span>
                    </a>
                </div>

                {activeTab === 'manual' ? (
                    <form onSubmit={handleManualSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                <User className="w-3.5 h-3.5" /> Nome <span className="text-rose-500">*</span>
                            </label>
                            <Input
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                placeholder="Nome do lead"
                                required
                                className="text-slate-900 placeholder:text-slate-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                <Mail className="w-3.5 h-3.5" /> E-mail
                            </label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="lead@exemplo.com"
                                className="text-slate-900 placeholder:text-slate-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                <Phone className="w-3.5 h-3.5" /> Telefone <span className="text-rose-500">*</span>
                            </label>
                            <Input
                                value={telefone}
                                onChange={(e) => setTelefone(e.target.value)}
                                placeholder="(31) 99999-9999"
                                required
                                className="text-slate-900 placeholder:text-slate-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                    <Layers className="w-3.5 h-3.5" /> Etapa
                                </label>
                                <select
                                    value={stageId}
                                    onChange={(e) => setStageId(e.target.value)}
                                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {stageOptions.length === 0 && <option value="">--</option>}
                                    {stageOptions.map((s) => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                    <UserCheck className="w-3.5 h-3.5" /> Responsável
                                </label>
                                <select
                                    value={responsavelId}
                                    onChange={(e) => setResponsavelId(e.target.value)}
                                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Sem responsável</option>
                                    {team.map((m: any) => (
                                        <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                                {loading ? 'Salvando...' : 'Adicionar Lead'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleImportSubmit} className="space-y-6">
                        <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                            <div className="text-sm text-slate-600">
                                {selectedFile ? (
                                    <span className="text-blue-600 font-medium">{selectedFile.name}</span>
                                ) : (
                                    <span>Clique para selecionar um arquivo Excel (.xlsx)</span>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                            />
                        </div>

                        <div className="bg-slate-50 p-4 rounded-md text-sm text-slate-700 space-y-2">
                            <p className="font-semibold text-slate-900">Instruções para a Tabela:</p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>O arquivo deve ser <strong>.xlsx</strong>.</li>
                                <li>A primeira linha deve conter os cabeçalhos.</li>
                                <li><strong>Obrigatórios:</strong> Nome, Telefone</li>
                                <li><strong>Opcionais:</strong> Email, Nicho, Site, Instagram, Google, Notas</li>
                            </ul>
                        </div>

                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={loading || !selectedFile}>
                            {loading ? 'Importando...' : 'Fazer Upload e Importar'}
                        </Button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
