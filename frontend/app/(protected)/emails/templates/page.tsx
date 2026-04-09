'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, Search, FileText, Copy, Archive, Trash2, MoreVertical, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getEmailTemplates, createEmailTemplate, updateEmailTemplate, duplicateEmailTemplate, archiveEmailTemplate, deleteEmailTemplate } from '@/app/actions-email';
import { EmailTemplateEditor } from '@/components/email/EmailTemplateEditor';
import { EmailSubNav } from '../accounts/page';
import { renderTemplate } from '@/lib/email-template-renderer';

const CATEGORIES = ['geral', 'prospecção', 'follow-up', 'proposta', 'onboarding', 'suporte', 'cobrança'];

const categoryColors: Record<string, string> = {
    geral: 'bg-slate-100 text-slate-600',
    'prospecção': 'bg-blue-100 text-blue-700',
    'follow-up': 'bg-amber-100 text-amber-700',
    proposta: 'bg-emerald-100 text-emerald-700',
    onboarding: 'bg-purple-100 text-purple-700',
    suporte: 'bg-cyan-100 text-cyan-700',
    'cobrança': 'bg-red-100 text-red-700',
};

export default function EmailTemplatesPage() {
    const confirm = useConfirm();
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showEditor, setShowEditor] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [previewId, setPreviewId] = useState<string | null>(null);

    const fetchTemplates = async () => {
        setLoading(true);
        const res = await getEmailTemplates({ search, category: filterCategory || undefined });
        if (res.success && res.data) setTemplates(res.data);
        setLoading(false);
    };

    useEffect(() => { fetchTemplates(); }, [search, filterCategory]);

    const handleSubmit = async (data: any) => {
        setSaving(true);
        const res = editingTemplate
            ? await updateEmailTemplate(editingTemplate.id, data)
            : await createEmailTemplate(data);

        if (res.success) {
            toast.success(editingTemplate ? 'Template atualizado!' : 'Template criado!');
            setShowEditor(false);
            setEditingTemplate(null);
            fetchTemplates();
        } else {
            toast.error(res.error || 'Erro ao salvar template.');
        }
        setSaving(false);
    };

    const handleDuplicate = async (id: string) => {
        const res = await duplicateEmailTemplate(id);
        if (res.success) {
            toast.success('Template duplicado!');
            fetchTemplates();
        }
    };

    const handleArchive = async (id: string) => {
        const res = await archiveEmailTemplate(id);
        if (res.success) {
            toast.success('Template arquivado.');
            fetchTemplates();
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: "Remover template?",
            description: "Remover este template permanentemente?",
            tone: "danger",
            confirmText: "Remover",
        });
        if (!ok) return;
        const res = await deleteEmailTemplate(id);
        if (res.success) {
            toast.success('Template removido.');
            fetchTemplates();
        }
    };

    const previewContext = {
        nome: 'João Silva', primeiro_nome: 'João', empresa: 'Acme Corp',
        email: 'joao@acme.com', telefone: '(11) 99999', cargo: 'Gerente',
        responsavel: 'Maria', organizacao_nome: 'Minha Empresa',
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
            <EmailSubNav />

            <div className="flex-1 px-8 py-6 max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">Templates de E-mail</h1>
                        <p className="text-sm text-slate-500 mt-1">Crie e gerencie templates reutilizáveis com variáveis dinâmicas.</p>
                    </div>
                    <button
                        onClick={() => { setEditingTemplate(null); setShowEditor(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Novo Template
                    </button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Buscar templates..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                    >
                        <option value="">Todas categorias</option>
                        {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                    </select>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                    </div>
                ) : templates.length === 0 ? (
                    <div className="text-center py-20">
                        <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">Nenhum template encontrado</h3>
                        <p className="text-sm text-slate-400 mt-2">Crie templates para agilizar o envio de e-mails.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {templates.map(template => (
                            <div key={template.id} className="group bg-white rounded-xl border border-slate-200 hover:shadow-md transition-all overflow-hidden">
                                <div className="p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-sm mb-1">{template.name}</h3>
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${categoryColors[template.category] || categoryColors.geral}`}>
                                                {template.category}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mb-3">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Assunto</span>
                                        <p className="text-sm text-slate-600 truncate">{template.subject}</p>
                                    </div>

                                    {/* Preview snippet */}
                                    <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 line-clamp-3 border border-slate-100 mb-3">
                                        {renderTemplate(template.body_html?.replace(/<[^>]*>/g, '') || '', previewContext).substring(0, 150)}...
                                    </div>

                                    <div className="flex items-center text-[10px] text-slate-400 gap-3">
                                        <span>{template.variables_json?.length || 0} variáveis</span>
                                        <span>•</span>
                                        <span>{new Date(template.created_at).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                </div>

                                <div className="flex items-center border-t border-slate-100 divide-x divide-slate-100">
                                    <button onClick={() => { setEditingTemplate(template); setShowEditor(true); }} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                        Editar
                                    </button>
                                    <button onClick={() => handleDuplicate(template.id)} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                        <Copy className="w-3 h-3" /> Duplicar
                                    </button>
                                    <button onClick={() => handleArchive(template.id)} className="flex items-center justify-center px-3 py-2.5 text-xs text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                                        <Archive className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => handleDelete(template.id)} className="flex items-center justify-center px-3 py-2.5 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showEditor && (
                <EmailTemplateEditor
                    template={editingTemplate}
                    onSubmit={handleSubmit}
                    onClose={() => { setShowEditor(false); setEditingTemplate(null); }}
                    loading={saving}
                />
            )}
        </div>
    );
}
