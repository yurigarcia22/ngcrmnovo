'use client';

import { useState, useEffect } from 'react';
import { Loader2, ScrollText, Search, AlertCircle, CheckCircle, Info, Bug } from 'lucide-react';
import { getEmailLogs, getEmailAccounts } from '@/app/actions-email';
import { EmailSubNav } from '../accounts/page';

const logTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
    info: { label: 'Info', icon: Info, color: 'bg-blue-100 text-blue-700' },
    warning: { label: 'Aviso', icon: AlertCircle, color: 'bg-amber-100 text-amber-700' },
    error: { label: 'Erro', icon: AlertCircle, color: 'bg-red-100 text-red-700' },
    debug: { label: 'Debug', icon: Bug, color: 'bg-slate-100 text-slate-600' },
};

const statusIcons: Record<string, { icon: any; color: string }> = {
    success: { icon: CheckCircle, color: 'text-emerald-500' },
    failure: { icon: AlertCircle, color: 'text-red-500' },
    pending: { icon: Loader2, color: 'text-amber-500' },
};

export default function EmailLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('');
    const [filterAccount, setFilterAccount] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        const [logsRes, accRes] = await Promise.all([
            getEmailLogs({ log_type: filterType || undefined, account_id: filterAccount || undefined }),
            getEmailAccounts(),
        ]);
        if (logsRes.success && logsRes.data) setLogs(logsRes.data);
        if (accRes.success && accRes.data) setAccounts(accRes.data);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [filterType, filterAccount]);

    return (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
            <EmailSubNav />

            <div className="flex-1 px-8 py-6 max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">Logs de E-mail</h1>
                        <p className="text-sm text-slate-500 mt-1">Histórico de operações do módulo de e-mail.</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-6">
                    <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="">Todos os tipos</option>
                        <option value="info">Info</option>
                        <option value="warning">Avisos</option>
                        <option value="error">Erros</option>
                        <option value="debug">Debug</option>
                    </select>
                    {accounts.length > 1 && (
                        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
                            <option value="">Todas as contas</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-20">
                        <ScrollText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">Nenhum log encontrado</h3>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Data/Hora</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Tipo</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Operação</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Status</th>
                                    <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Mensagem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.map(log => {
                                    const typeConf = logTypeConfig[log.log_type] || logTypeConfig.info;
                                    const statusConf = statusIcons[log.status] || statusIcons.pending;
                                    const StatusIcon = statusConf.icon;

                                    return (
                                        <>
                                            <tr key={log.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                                                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                                    {new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${typeConf.color}`}>
                                                        {typeConf.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-700 font-medium">{log.operation}</td>
                                                <td className="px-4 py-3">
                                                    <StatusIcon className={`w-4 h-4 ${statusConf.color}`} />
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{log.message || '-'}</td>
                                            </tr>
                                            {expandedId === log.id && log.details_json && (
                                                <tr key={`${log.id}-details`}>
                                                    <td colSpan={5} className="px-4 py-3 bg-slate-50">
                                                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap">{JSON.stringify(log.details_json, null, 2)}</pre>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
