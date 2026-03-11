'use client';

import { Mail, Star, Trash2, Settings, Zap, MoreVertical } from 'lucide-react';
import { EmailConnectionStatusBadge } from './EmailConnectionStatusBadge';

interface EmailAccountCardProps {
    account: any;
    onEdit: (account: any) => void;
    onDelete: (id: string) => void;
    onTest: (id: string) => void;
    onSetDefault: (id: string) => void;
}

export function EmailAccountCard({ account, onEdit, onDelete, onTest, onSetDefault }: EmailAccountCardProps) {
    const providerLabels: Record<string, string> = {
        zoho: 'Zoho Mail',
        gmail: 'Gmail',
        outlook: 'Outlook',
        generic: 'SMTP Genérico',
    };

    const providerColors: Record<string, string> = {
        zoho: 'bg-red-50 text-red-600 border-red-200',
        gmail: 'bg-blue-50 text-blue-600 border-blue-200',
        outlook: 'bg-indigo-50 text-indigo-600 border-indigo-200',
        generic: 'bg-slate-50 text-slate-600 border-slate-200',
    };

    return (
        <div className={`relative group bg-white rounded-xl border transition-all hover:shadow-md ${account.is_default ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
            {account.is_default && (
                <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold uppercase rounded-full tracking-wide flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" /> Padrão
                </div>
            )}

            <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${providerColors[account.provider] || providerColors.generic}`}>
                            <Mail className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm">{account.name}</h3>
                            <p className="text-xs text-slate-500">{account.email}</p>
                        </div>
                    </div>
                    <EmailConnectionStatusBadge status={account.connection_status} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 mb-4">
                    <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Provedor</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${providerColors[account.provider] || providerColors.generic}`}>
                            {providerLabels[account.provider] || account.provider}
                        </span>
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">SMTP</span>
                        {account.smtp_host}:{account.smtp_port}
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Último Teste</span>
                        {account.last_connection_test_at
                            ? new Date(account.last_connection_test_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : 'Nunca'}
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Remetente</span>
                        {account.sender_name || account.name}
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                        onClick={() => onTest(account.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                        <Zap className="w-3 h-3" /> Testar
                    </button>
                    <button
                        onClick={() => onEdit(account)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                        <Settings className="w-3 h-3" /> Editar
                    </button>
                    {!account.is_default && (
                        <button
                            onClick={() => onSetDefault(account.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                            <Star className="w-3 h-3" /> Definir Padrão
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={() => onDelete(account.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
