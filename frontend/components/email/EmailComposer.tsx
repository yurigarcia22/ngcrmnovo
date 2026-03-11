'use client';

import { useState, useEffect } from 'react';
import { X, Send, Paperclip, ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmail, getEmailAccounts, getEmailTemplates } from '@/app/actions-email';
import { renderTemplate, getAvailableVariables } from '@/lib/email-template-renderer';
import type { TemplateContext } from '@/lib/email-template-renderer';

interface EmailComposerProps {
    isOpen: boolean;
    onClose: () => void;
    onSent?: () => void;
    // Pre-fill context
    defaultTo?: string;
    defaultSubject?: string;
    leadId?: string;
    contactId?: string;
    opportunityId?: string;
    templateContext?: TemplateContext;
}

export function EmailComposer({
    isOpen,
    onClose,
    onSent,
    defaultTo,
    defaultSubject,
    leadId,
    contactId,
    opportunityId,
    templateContext,
}: EmailComposerProps) {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    const [form, setForm] = useState({
        account_id: '',
        to: defaultTo || '',
        cc: '',
        bcc: '',
        subject: defaultSubject || '',
        body_html: '',
        template_id: '',
    });

    useEffect(() => {
        if (isOpen) {
            loadData();
            setForm(prev => ({
                ...prev,
                to: defaultTo || '',
                subject: defaultSubject || '',
            }));
        }
    }, [isOpen]);

    const loadData = async () => {
        setLoading(true);
        const [accRes, tplRes] = await Promise.all([
            getEmailAccounts(),
            getEmailTemplates(),
        ]);
        if (accRes.success && accRes.data) {
            setAccounts(accRes.data);
            const defaultAcc = accRes.data.find((a: any) => a.is_default) || accRes.data[0];
            if (defaultAcc) setForm(prev => ({ ...prev, account_id: defaultAcc.id }));
        }
        if (tplRes.success && tplRes.data) {
            setTemplates(tplRes.data);
        }
        setLoading(false);
    };

    const applyTemplate = (template: any) => {
        let subject = template.subject;
        let bodyHtml = template.body_html;

        if (templateContext) {
            subject = renderTemplate(subject, templateContext);
            bodyHtml = renderTemplate(bodyHtml, templateContext);
        }

        setForm(prev => ({
            ...prev,
            subject,
            body_html: bodyHtml,
            template_id: template.id,
        }));
        setShowTemplates(false);
        toast.success(`Template "${template.name}" aplicado!`);
    };

    const handleSend = async () => {
        if (!form.account_id) return toast.error('Selecione uma conta de e-mail.');
        if (!form.to.trim()) return toast.error('Informe o destinatário.');
        if (!form.subject.trim()) return toast.error('Informe o assunto.');
        if (!form.body_html.trim()) return toast.error('Escreva o corpo do e-mail.');

        setSending(true);
        const toEmails = form.to.split(/[,;]/).map(e => e.trim()).filter(Boolean);
        const ccEmails = form.cc ? form.cc.split(/[,;]/).map(e => e.trim()).filter(Boolean) : [];
        const bccEmails = form.bcc ? form.bcc.split(/[,;]/).map(e => e.trim()).filter(Boolean) : [];

        const res = await sendEmail({
            account_id: form.account_id,
            to_emails: toEmails,
            cc_emails: ccEmails,
            bcc_emails: bccEmails,
            subject: form.subject,
            body_html: form.body_html,
            template_id: form.template_id || undefined,
            lead_id: leadId,
            contact_id: contactId,
            opportunity_id: opportunityId,
        });

        setSending(false);

        if (res.success) {
            toast.success('E-mail enviado com sucesso!');
            setForm({ account_id: form.account_id, to: '', cc: '', bcc: '', subject: '', body_html: '', template_id: '' });
            onSent?.();
            onClose();
        } else {
            toast.error(res.error || 'Erro ao enviar e-mail.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl">
                    <div className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-white/80" />
                        <h2 className="text-sm font-bold text-white">Novo E-mail</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/20 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : (
                    <>
                        {/* Fields */}
                        <div className="px-5 pt-4 space-y-2.5 text-sm">
                            {/* Account selector */}
                            <div className="flex items-center gap-2 py-1">
                                <span className="text-xs font-bold text-slate-400 uppercase w-10">De:</span>
                                <select
                                    className="flex-1 h-8 rounded-md border-0 bg-slate-50 px-3 text-sm focus:ring-2 focus:ring-blue-500"
                                    value={form.account_id}
                                    onChange={e => setForm({ ...form, account_id: e.target.value })}
                                >
                                    {accounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                                    ))}
                                </select>
                            </div>

                            {/* To */}
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase w-10">Para:</span>
                                <input
                                    type="text"
                                    className="flex-1 h-8 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
                                    value={form.to}
                                    onChange={e => setForm({ ...form, to: e.target.value })}
                                    placeholder="email@exemplo.com (separe múltiplos com vírgula)"
                                />
                                <button
                                    onClick={() => setShowCcBcc(!showCcBcc)}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                                >
                                    {showCcBcc ? <ChevronUp className="w-4 h-4" /> : 'Cc/Bcc'}
                                </button>
                            </div>

                            {/* Cc/Bcc */}
                            {showCcBcc && (
                                <>
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <span className="text-xs font-bold text-slate-400 uppercase w-10">Cc:</span>
                                        <input type="text" className="flex-1 h-8 bg-transparent outline-none text-sm" value={form.cc} onChange={e => setForm({ ...form, cc: e.target.value })} placeholder="Cópia (opcional)" />
                                    </div>
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <span className="text-xs font-bold text-slate-400 uppercase w-10">Bcc:</span>
                                        <input type="text" className="flex-1 h-8 bg-transparent outline-none text-sm" value={form.bcc} onChange={e => setForm({ ...form, bcc: e.target.value })} placeholder="Cópia oculta (opcional)" />
                                    </div>
                                </>
                            )}

                            {/* Subject */}
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase w-10">Assunto:</span>
                                <input
                                    type="text"
                                    className="flex-1 h-8 bg-transparent outline-none text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal"
                                    value={form.subject}
                                    onChange={e => setForm({ ...form, subject: e.target.value })}
                                    placeholder="Assunto do e-mail"
                                />
                            </div>
                        </div>

                        {/* Template bar */}
                        <div className="px-5 py-2 flex items-center gap-2">
                            <button
                                onClick={() => setShowTemplates(!showTemplates)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${showTemplates ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                <FileText className="w-3.5 h-3.5" />
                                Templates
                                <ChevronDown className={`w-3 h-3 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {/* Templates dropdown */}
                        {showTemplates && (
                            <div className="mx-5 mb-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100">
                                {templates.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-slate-400">Nenhum template disponível.</div>
                                ) : (
                                    templates.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => applyTemplate(t)}
                                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white transition-colors text-left"
                                        >
                                            <div>
                                                <span className="text-sm font-semibold text-slate-800">{t.name}</span>
                                                <span className="text-xs text-slate-400 ml-2">{t.subject}</span>
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-bold">{t.category}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Body */}
                        <div className="flex-1 px-5 pb-2 min-h-0">
                            <textarea
                                className="w-full min-h-[200px] max-h-[400px] resize-y bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400"
                                value={form.body_html}
                                onChange={e => setForm({ ...form, body_html: e.target.value })}
                                placeholder="Escreva sua mensagem..."
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                            <div className="flex items-center gap-2">
                                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors" title="Anexar arquivo (em breve)">
                                    <Paperclip className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors">
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSend}
                                    disabled={sending}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all disabled:opacity-50"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {sending ? 'Enviando...' : 'Enviar'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
