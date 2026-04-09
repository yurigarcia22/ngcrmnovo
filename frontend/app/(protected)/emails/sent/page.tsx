'use client';

import { useState, useEffect } from 'react';
import { getEmailSent, getEmailAccounts, deleteEmailMessage } from '@/app/actions-email';
import { EmailComposer } from '@/components/email/EmailComposer';
import { EmailSubNav } from '../accounts/page';
import { Loader2, Search, ArrowUpRight, Clock, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

export default function EmailSentPage() {
    const confirm = useConfirm();
    const [messages, setMessages] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showComposer, setShowComposer] = useState(false);
    const [search, setSearch] = useState('');
    const [filterAccount, setFilterAccount] = useState('');
    const [selectedMessage, setSelectedMessage] = useState<any>(null);

    const statusConfig: Record<string, { label: string; color: string }> = {
        sent: { label: 'Enviado', color: 'bg-emerald-100 text-emerald-700' },
        delivered: { label: 'Entregue', color: 'bg-blue-100 text-blue-700' },
        failed: { label: 'Falhou', color: 'bg-red-100 text-red-700' },
        sending: { label: 'Enviando', color: 'bg-amber-100 text-amber-700' },
    };

    const fetchData = async () => {
        setLoading(true);
        const [sentRes, accRes] = await Promise.all([
            getEmailSent({ search, account_id: filterAccount || undefined }),
            getEmailAccounts(),
        ]);
        if (sentRes.success && sentRes.data) setMessages(sentRes.data);
        if (accRes.success && accRes.data) setAccounts(accRes.data);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [search, filterAccount]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const ok = await confirm({
            title: "Excluir e-mail?",
            description: "Esta acao e irreversivel.",
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;
        const res = await deleteEmailMessage(id);
        if (res.success) {
            toast.success('E-mail excluído.');
            if (selectedMessage?.id === id) setSelectedMessage(null);
            fetchData();
        } else {
            toast.error(res.error || 'Erro ao excluir.');
        }
    };

    // Sort newest first
    const sortedMessages = [...messages].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return (
        <div className="flex flex-col h-screen bg-[#F8F9FB]">
            <EmailSubNav />

            <div className="flex-1 flex flex-col min-h-0 px-8 py-6 max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">Enviados</h1>
                        <p className="text-sm text-slate-500 mt-1">E-mails enviados pelo CRM.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => fetchData()} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
                        <button onClick={() => setShowComposer(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200"><Plus className="w-4 h-4" /> Novo E-mail</button>
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-4 shrink-0">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {accounts.length > 1 && (
                        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
                            <option value="">Todas as contas</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    )}
                </div>

                <div className="flex-1 flex min-h-0 gap-4">
                    <div className={`${selectedMessage ? 'w-2/5' : 'w-full'} flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden`}>
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                            {loading ? (
                                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                            ) : sortedMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Mail className="w-12 h-12 text-slate-200 mb-3" />
                                    <p className="text-sm text-slate-400">Nenhum e-mail enviado.</p>
                                </div>
                            ) : (
                                sortedMessages.map(msg => (
                                    <div
                                        key={msg.id}
                                        onClick={() => setSelectedMessage(msg)}
                                        className={`group w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${selectedMessage?.id === msg.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                    <span className="text-sm font-semibold text-slate-800 truncate">{Array.isArray(msg.to_emails) ? msg.to_emails.join(', ') : msg.to_emails}</span>
                                                </div>
                                                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${statusConfig[msg.status]?.color || 'bg-slate-100 text-slate-500'}`}>{statusConfig[msg.status]?.label || msg.status}</span>
                                            </div>
                                            <p className="text-sm text-slate-700 font-medium truncate">{msg.subject || '(Sem assunto)'}</p>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                                <Clock className="w-3 h-3" />
                                                {new Date(msg.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(e, msg.id)}
                                            className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 shrink-0 mt-1"
                                            title="Excluir e-mail"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {selectedMessage && (
                        <div className="w-3/5 bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 overflow-hidden animate-in slide-in-from-right-4 duration-200">
                            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-lg font-bold text-slate-900">{selectedMessage.subject || '(Sem assunto)'}</h2>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => handleDelete(e, selectedMessage.id)}
                                            className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setSelectedMessage(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">Fechar ×</button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span><strong>Para:</strong> {Array.isArray(selectedMessage.to_emails) ? selectedMessage.to_emails.join(', ') : selectedMessage.to_emails}</span>
                                    <span>{new Date(selectedMessage.created_at).toLocaleString('pt-BR')}</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: selectedMessage.body_html || selectedMessage.body_text || '' }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <EmailComposer isOpen={showComposer} onClose={() => setShowComposer(false)} onSent={fetchData} />
        </div>
    );
}
