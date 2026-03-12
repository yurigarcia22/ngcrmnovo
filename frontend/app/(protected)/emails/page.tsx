'use client';

import { useState, useEffect } from 'react';
import { Loader2, Send, ArrowUpRight, ArrowDownLeft, Clock, Search, Mail, Plus, RefreshCw, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getEmailSent, getEmailInbox, getEmailAccounts, deleteEmailMessage, syncEmailInbox } from '@/app/actions-email';
import { EmailComposer } from '@/components/email/EmailComposer';
import { EmailSubNav } from './accounts/page';

export default function EmailInboxPage() {
    const [inboxMessages, setInboxMessages] = useState<any[]>([]);
    const [sentMessages, setSentMessages] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<any>(null);
    const [showComposer, setShowComposer] = useState(false);
    const [composerDefaultTo, setComposerDefaultTo] = useState('');
    const [search, setSearch] = useState('');
    const [filterAccount, setFilterAccount] = useState('');
    const [viewTab, setViewTab] = useState<'all' | 'inbox' | 'sent'>('all');

    const fetchData = async () => {
        setLoading(true);
        const [inboxRes, sentRes, accRes] = await Promise.all([
            getEmailInbox({ search, account_id: filterAccount || undefined }),
            getEmailSent({ search, account_id: filterAccount || undefined }),
            getEmailAccounts(),
        ]);
        if (inboxRes.success && inboxRes.data) setInboxMessages(inboxRes.data);
        if (sentRes.success && sentRes.data) setSentMessages(sentRes.data);
        if (accRes.success && accRes.data) setAccounts(accRes.data);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [search, filterAccount]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('compose') === 'true') {
            setShowComposer(true);
            const toStr = params.get('to');
            if (toStr) setComposerDefaultTo(decodeURIComponent(toStr));
            window.history.replaceState(null, '', '/emails');
        }
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        toast.info('Sincronizando e-mails via IMAP...');
        const res = await syncEmailInbox(filterAccount || undefined);
        if (res.success) {
            toast.success(res.message || 'Sincronização concluída!');
            if (res.data?.errors?.length) {
                res.data.errors.forEach((err: string) => toast.warning(err));
            }
            fetchData();
        } else {
            toast.error(res.error || 'Erro na sincronização.');
        }
        setSyncing(false);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Excluir este e-mail?')) return;
        const res = await deleteEmailMessage(id);
        if (res.success) {
            toast.success('E-mail excluído.');
            if (selectedMessage?.id === id) setSelectedMessage(null);
            fetchData();
        } else {
            toast.error(res.error || 'Erro ao excluir.');
        }
    };

    const statusConfig: Record<string, { label: string; color: string }> = {
        sent: { label: 'Enviado', color: 'bg-emerald-100 text-emerald-700' },
        delivered: { label: 'Entregue', color: 'bg-blue-100 text-blue-700' },
        failed: { label: 'Falhou', color: 'bg-red-100 text-red-700' },
        sending: { label: 'Enviando', color: 'bg-amber-100 text-amber-700' },
        queued: { label: 'Na Fila', color: 'bg-slate-100 text-slate-600' },
        received: { label: 'Recebido', color: 'bg-indigo-100 text-indigo-700' },
        draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-500' },
        synced: { label: 'Sincronizado', color: 'bg-cyan-100 text-cyan-700' },
    };

    // Combine and sort by created_at descending
    let displayMessages: any[] = [];
    if (viewTab === 'all') displayMessages = [...inboxMessages, ...sentMessages];
    else if (viewTab === 'inbox') displayMessages = [...inboxMessages];
    else displayMessages = [...sentMessages];

    displayMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <div className="flex flex-col h-screen bg-[#F8F9FB]">
            <EmailSubNav />

            <div className="flex-1 flex flex-col min-h-0 px-8 py-6 max-w-6xl mx-auto w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">E-mails</h1>
                        <p className="text-sm text-slate-500 mt-1">Todos os e-mails enviados e recebidos.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {syncing ? 'Sincronizando...' : 'Sincronizar'}
                        </button>
                        <button onClick={() => fetchData()} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowComposer(true)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all"
                        >
                            <Plus className="w-4 h-4" /> Novo E-mail
                        </button>
                    </div>
                </div>

                {/* Filters + Tab */}
                <div className="flex items-center gap-3 mb-4 shrink-0">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                        {(['all', 'inbox', 'sent'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setViewTab(tab)}
                                className={`px-3 py-2 text-xs font-bold transition-colors ${viewTab === tab ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                {tab === 'all' ? 'Todos' : tab === 'inbox' ? 'Recebidos' : 'Enviados'}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Buscar por assunto ou remetente..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {accounts.length > 1 && (
                        <select
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                            value={filterAccount}
                            onChange={e => setFilterAccount(e.target.value)}
                        >
                            <option value="">Todas as contas</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 flex min-h-0 gap-4">
                    {/* Message List */}
                    <div className={`${selectedMessage ? 'w-2/5' : 'w-full'} flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden transition-all`}>
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                            {loading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                                </div>
                            ) : displayMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <Mail className="w-12 h-12 text-slate-200 mb-3" />
                                    <p className="text-sm text-slate-400">Nenhum e-mail encontrado.</p>
                                    <div className="flex items-center gap-3 mt-4">
                                        <button onClick={handleSync} className="text-sm text-blue-600 font-semibold hover:text-blue-800">
                                            Sincronizar caixa de entrada →
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                displayMessages.map(msg => (
                                    <div
                                        key={msg.id}
                                        onClick={() => setSelectedMessage(msg)}
                                        className={`group w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${selectedMessage?.id === msg.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {msg.direction === 'outbound' ? (
                                                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                    ) : (
                                                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                    )}
                                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                                        {msg.direction === 'outbound'
                                                            ? (Array.isArray(msg.to_emails) ? msg.to_emails.join(', ') : msg.to_emails)
                                                            : (msg.from_name || msg.from_email)
                                                        }
                                                    </span>
                                                </div>
                                                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${statusConfig[msg.status]?.color || 'bg-slate-100 text-slate-500'}`}>
                                                    {statusConfig[msg.status]?.label || msg.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 font-medium truncate">{msg.subject || '(Sem assunto)'}</p>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                                <Clock className="w-3 h-3" />
                                                {new Date(msg.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                {msg.email_accounts && (
                                                    <span className="ml-auto text-[10px] text-slate-400">via {msg.email_accounts.name}</span>
                                                )}
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

                    {/* Detail Panel */}
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
                                        <button onClick={() => setSelectedMessage(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">
                                            Fechar ×
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span><strong>De:</strong> {selectedMessage.from_name || selectedMessage.from_email}</span>
                                    <span><strong>Para:</strong> {Array.isArray(selectedMessage.to_emails) ? selectedMessage.to_emails.join(', ') : selectedMessage.to_emails}</span>
                                    <span>{new Date(selectedMessage.created_at).toLocaleString('pt-BR')}</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: selectedMessage.body_html || selectedMessage.body_text || '<em class="text-slate-400">Sem conteúdo</em>' }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <EmailComposer isOpen={showComposer} onClose={() => { setShowComposer(false); setComposerDefaultTo(''); }} onSent={fetchData} defaultTo={composerDefaultTo} />
        </div>
    );
}
