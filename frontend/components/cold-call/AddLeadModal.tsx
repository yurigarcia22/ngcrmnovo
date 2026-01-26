'use client';

import { useState, useRef } from 'react';
import { Button, Input, Textarea } from '@/components/ui/simple-ui';
import { X, Upload, FileSpreadsheet, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { NichoSelector } from '@/components/cold-call/NichoSelector';

interface AddLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function AddLeadModal({ isOpen, onClose, onSuccess }: AddLeadModalProps) {
    const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');
    const [loading, setLoading] = useState(false);

    // Manual Form State
    const [formData, setFormData] = useState({
        nome: '',
        telefone: '',
        nicho: '',
        siteUrl: '',
        instagramUrl: '',
        googleMeuNegocioUrl: '',
        notas: ''
    });

    // Import State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    if (!isOpen) return null;

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nome || !formData.telefone || !formData.nicho) {
            toast.error('Preencha os campos obrigatórios: Nome, Telefone e Nicho');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/cold-leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error('Erro ao criar lead');

            toast.success('Lead criado com sucesso!');
            onSuccess();
            onClose();
        } catch (error) {
            toast.error('Erro ao salvar lead.');
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
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await fetch('/api/cold-leads/import', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.details && Array.isArray(data.details)) {
                    console.error(data.details);
                    toast.error(`Erro na importação. Veja o console para detalhes dos ${data.details.length} erros.`);
                } else {
                    toast.error(data.error || 'Erro na importação');
                }
                return;
            }

            toast.success(`Importação realizada! ${data.totalImported} leads adicionados.`);
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} linhas ignoradas com erros.`);
            }

            onSuccess();
            onClose();
        } catch (error) {
            toast.error('Erro de conexão ao importar.');
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        // Generate a simple CSV blob for template
        const headers = ['Nome,Telefone,Nicho,Site,Instagram,Google,Notas'];
        const example = ['Empresa Exemplo,11999999999,Tecnologia,www.exemplo.com.br,@exemplo,https://g.page/exemplo,Lead interessado em software'];
        const csvContent = headers.concat(example).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'modelo_importacao_leads.csv'); // Using CSV for simplicity as template, but accepting xlsx implies logic handles both or user converts. 
        // Actually, API uses xlsx, which reads CSV too usually. Let's keep it simple.
        // Better to just describe it in text as requested "mensagem falando sobre o modelo".
        link.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

            <div className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-all">
                <div className="flex items-center justify-between border-b pb-4 mb-4">
                    <h2 className="text-xl font-bold">Adicionar Lead</h2>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X className="h-4 w-4" />
                    </Button>
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
                        Importar Excel (Novo)
                        <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full">BETA</span>
                    </a>
                </div>

                {activeTab === 'manual' ? (
                    <form onSubmit={handleManualSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Nome *</label>
                            <Input
                                value={formData.nome}
                                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                placeholder="Nome da empresa ou contato"
                                required
                                className="text-slate-900 placeholder:text-slate-400"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Telefone *</label>
                                <Input
                                    value={formData.telefone}
                                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                                    placeholder="11999999999"
                                    required
                                    className="text-slate-900 placeholder:text-slate-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Nicho *</label>
                                <NichoSelector
                                    value={formData.nicho}
                                    onChange={(val) => setFormData({ ...formData, nicho: val })}
                                    placeholder="Ex: Clínica, Academia"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Links (Opcionais)</label>
                            <Input
                                value={formData.siteUrl}
                                onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                                placeholder="Site URL"
                                className="mb-2 text-slate-900 placeholder:text-slate-400"
                            />
                            <Input
                                value={formData.instagramUrl}
                                onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                                placeholder="Instagram URL"
                                className="text-slate-900 placeholder:text-slate-400"
                            />
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

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={downloadTemplate}
                                className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center justify-center gap-1 mx-auto"
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                Baixar Modelo de Planilha
                            </button>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-md text-sm text-slate-700 space-y-2">
                            <p className="font-semibold text-slate-900">Instruções para a Tabela:</p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>O arquivo deve ser <strong>.xlsx</strong>.</li>
                                <li>A primeira linha deve conter os cabeçalhos:</li>
                                <li><strong>Obrigatórios:</strong> Nome, Telefone, Nicho</li>
                                <li><strong>Opcionais:</strong> Site, Instagram, Google, Notas</li>
                            </ul>
                        </div>

                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={loading || !selectedFile}>
                            {loading ? 'Importando...' : 'Fazer Upload e Importar'}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
