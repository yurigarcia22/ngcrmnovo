'use client';

import { useState } from 'react';
import { X, Eye, Code, Variable, Copy, Check } from 'lucide-react';
import { getAvailableVariables, renderTemplate, extractVariables } from '@/lib/email-template-renderer';

interface EmailTemplateEditorProps {
    template?: any;
    onSubmit: (data: any) => void;
    onClose: () => void;
    loading?: boolean;
}

const CATEGORIES = ['geral', 'prospecção', 'follow-up', 'proposta', 'onboarding', 'suporte', 'cobrança'];

export function EmailTemplateEditor({ template, onSubmit, onClose, loading }: EmailTemplateEditorProps) {
    const [form, setForm] = useState({
        name: template?.name || '',
        category: template?.category || 'geral',
        subject: template?.subject || '',
        body_html: template?.body_html || '',
        body_text: template?.body_text || '',
        visibility: template?.visibility || 'organization',
    });

    const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
    const [copiedVar, setCopiedVar] = useState('');
    const variables = getAvailableVariables();

    const insertVariable = (key: string) => {
        const tag = `{{${key}}}`;
        setForm(prev => ({ ...prev, body_html: prev.body_html + tag }));
        setCopiedVar(key);
        setTimeout(() => setCopiedVar(''), 1500);
    };

    const previewContext = {
        nome: 'João Silva',
        primeiro_nome: 'João',
        empresa: 'Acme Corp',
        email: 'joao@acme.com',
        telefone: '(11) 99999-0000',
        cargo: 'Gerente',
        responsavel: 'Maria Santos',
        produto: 'Plano Pro',
        link_reuniao: 'https://meet.google.com/abc-123',
        link_proposta: 'https://crm.com/proposta/123',
        cidade: 'São Paulo',
        origem_lead: 'Website',
        etapa: 'Qualificação',
        organizacao_nome: 'Minha Empresa',
    };

    const renderedSubject = renderTemplate(form.subject, previewContext);
    const renderedBody = renderTemplate(form.body_html, previewContext);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(form);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">
                        {template ? 'Editar Template' : 'Novo Template'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                    {/* Meta Info */}
                    <div className="px-6 py-4 border-b border-slate-100">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Nome do Template *</label>
                                <input type="text" className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ex: Follow-up Inicial" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Categoria</label>
                                <select className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none capitalize" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                    {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Assunto *</label>
                                <input type="text" className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required placeholder="Olá {{primeiro_nome}}, tudo bem?" />
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 flex min-h-0">
                        {/* Left: Editor / Preview */}
                        <div className="flex-1 flex flex-col min-h-0 border-r border-slate-100">
                            {/* Tabs */}
                            <div className="flex items-center gap-1 px-4 pt-3 pb-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('editor')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'editor' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    <Code className="w-3.5 h-3.5" /> Editor
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('preview')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === 'preview' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    <Eye className="w-3.5 h-3.5" /> Preview
                                </button>
                            </div>

                            {activeTab === 'editor' ? (
                                <div className="flex-1 px-4 pb-4">
                                    <textarea
                                        className="w-full h-full min-h-[300px] rounded-lg border border-slate-200 p-4 text-sm font-mono text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={form.body_html}
                                        onChange={e => setForm({ ...form, body_html: e.target.value })}
                                        placeholder="Olá {{primeiro_nome}},&#10;&#10;Gostaria de apresentar nosso serviço...&#10;&#10;Atenciosamente,&#10;{{responsavel}}"
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 px-4 pb-4 overflow-y-auto">
                                    <div className="rounded-lg border border-slate-200 bg-white">
                                        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                                            <span className="text-xs text-slate-400 font-bold uppercase">Assunto: </span>
                                            <span className="text-sm font-semibold text-slate-800">{renderedSubject}</span>
                                        </div>
                                        <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: renderedBody || '<span class="text-slate-400 italic">Sem conteúdo para preview</span>' }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right: Variables Panel */}
                        <div className="w-64 bg-slate-50 flex flex-col min-h-0">
                            <div className="px-4 py-3 border-b border-slate-200">
                                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                                    <Variable className="w-3.5 h-3.5" /> Variáveis Disponíveis
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                                {variables.map(v => (
                                    <button
                                        key={v.key}
                                        type="button"
                                        onClick={() => insertVariable(v.key)}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left hover:bg-white hover:shadow-sm transition-all group"
                                    >
                                        <div>
                                            <span className="text-xs font-mono font-bold text-blue-600">{`{{${v.key}}}`}</span>
                                            <span className="text-[10px] text-slate-400 block">{v.label}</span>
                                        </div>
                                        {copiedVar === v.key ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                                        ) : (
                                            <Copy className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className="px-4 py-3 border-t border-slate-200 text-[10px] text-slate-400">
                                Variáveis usadas: <span className="font-bold text-slate-600">{extractVariables(form.body_html + ' ' + form.subject).length}</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-white rounded-b-xl">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : (template ? 'Salvar Alterações' : 'Criar Template')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
