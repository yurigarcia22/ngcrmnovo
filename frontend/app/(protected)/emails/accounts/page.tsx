'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, RefreshCw, Mail, FileText, Send, Settings, Inbox, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getEmailAccounts, createEmailAccount, updateEmailAccount, deleteEmailAccount, testEmailConnection, setDefaultEmailAccount } from '@/app/actions-email';
import { EmailAccountCard } from '@/components/email/EmailAccountCard';
import { EmailAccountForm } from '@/components/email/EmailAccountForm';

export default function EmailAccountsPage() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);

    const fetchAccounts = async () => {
        setLoading(true);
        const res = await getEmailAccounts();
        if (res.success && res.data) setAccounts(res.data);
        setLoading(false);
    };

    useEffect(() => { fetchAccounts(); }, []);

    const handleSubmit = async (data: any) => {
        setSaving(true);
        const res = editingAccount
            ? await updateEmailAccount(editingAccount.id, data)
            : await createEmailAccount(data);

        if (res.success) {
            toast.success(editingAccount ? 'Conta atualizada!' : 'Conta criada!');
            setShowForm(false);
            setEditingAccount(null);
            fetchAccounts();
        } else {
            toast.error(res.error || 'Erro ao salvar conta.');
        }
        setSaving(false);
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        toast.info('Testando conexão SMTP...');
        const res = await testEmailConnection(id);
        if (res.success) {
            toast.success(res.message || 'Conexão OK!');
        } else {
            toast.error(res.error || 'Falha na conexão.');
        }
        setTestingId(null);
        fetchAccounts();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover esta conta?')) return;
        const res = await deleteEmailAccount(id);
        if (res.success) {
            toast.success('Conta removida.');
            fetchAccounts();
        } else {
            toast.error(res.error || 'Erro ao remover.');
        }
    };

    const handleSetDefault = async (id: string) => {
        const res = await setDefaultEmailAccount(id);
        if (res.success) {
            toast.success('Conta padrão definida!');
            fetchAccounts();
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
            {/* Top Nav */}
            <EmailSubNav />

            <div className="flex-1 px-8 py-6 max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">Contas de E-mail</h1>
                        <p className="text-sm text-slate-500 mt-1">Gerencie suas contas SMTP para envio de e-mails pelo CRM.</p>
                    </div>
                    <button
                        onClick={() => { setEditingAccount(null); setShowForm(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Nova Conta
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                    </div>
                ) : accounts.length === 0 ? (
                    <div className="text-center py-20">
                        <Mail className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-700">Nenhuma conta configurada</h3>
                        <p className="text-sm text-slate-400 mt-2 mb-6">Adicione uma conta SMTP para começar a enviar e-mails pelo CRM.</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                        >
                            Configurar Primeira Conta
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {accounts.map(account => (
                            <EmailAccountCard
                                key={account.id}
                                account={account}
                                onEdit={(a) => { setEditingAccount(a); setShowForm(true); }}
                                onDelete={handleDelete}
                                onTest={handleTest}
                                onSetDefault={handleSetDefault}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showForm && (
                <EmailAccountForm
                    account={editingAccount}
                    onSubmit={handleSubmit}
                    onClose={() => { setShowForm(false); setEditingAccount(null); }}
                    loading={saving}
                />
            )}
        </div>
    );
}

// Shared subnav for all email pages
export function EmailSubNav() {
    const pathname = usePathname();

    const tabs = [
        { href: '/emails', label: 'Caixa de Entrada', icon: Inbox },
        { href: '/emails/sent', label: 'Enviados', icon: Send },
        { href: '/emails/templates', label: 'Templates', icon: FileText },
        { href: '/emails/accounts', label: 'Contas', icon: Settings },
        { href: '/emails/logs', label: 'Logs', icon: ScrollText },
    ];

    return (
        <div className="bg-white border-b border-slate-200 px-8 sticky top-0 z-30">
            <div className="max-w-6xl mx-auto flex items-center gap-1 -mb-px">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = pathname === tab.href || (tab.href !== '/emails' && pathname.startsWith(tab.href));
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${isActive
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
