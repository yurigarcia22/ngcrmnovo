'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface EmailAccountFormProps {
    account?: any;
    onSubmit: (data: any) => void;
    onClose: () => void;
    loading?: boolean;
}

export function EmailAccountForm({ account, onSubmit, onClose, loading }: EmailAccountFormProps) {
    const [form, setForm] = useState({
        name: account?.name || '',
        provider: account?.provider || 'zoho',
        email: account?.email || '',
        sender_name: account?.sender_name || '',
        auth_type: account?.auth_type || 'credentials',
        smtp_host: account?.smtp_host || '',
        smtp_port: account?.smtp_port || 587,
        smtp_secure: account?.smtp_secure ?? true,
        imap_host: account?.imap_host || '',
        imap_port: account?.imap_port || 993,
        imap_secure: account?.imap_secure ?? true,
        username: account?.username || '',
        password: '',
        signature_html: account?.signature_html || '',
        is_default: account?.is_default || false,
    });

    const providerDefaults: Record<string, Partial<typeof form>> = {
        zoho: { smtp_host: 'smtp.zoho.com', smtp_port: 465, smtp_secure: true, imap_host: 'imap.zoho.com', imap_port: 993, imap_secure: true },
        gmail: { smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true, imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true },
        outlook: { smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true },
        generic: {},
    };

    const handleProviderChange = (provider: string) => {
        const defaults = providerDefaults[provider] || {};
        setForm(prev => ({ ...prev, provider, ...defaults }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(form);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">
                        {account ? 'Editar Conta de E-mail' : 'Nova Conta de E-mail'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Nome da Conta *</label>
                            <input
                                type="text"
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder="Ex: Comercial Zoho"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Provedor *</label>
                            <select
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.provider}
                                onChange={e => handleProviderChange(e.target.value)}
                            >
                                <option value="zoho">Zoho Mail</option>
                                <option value="gmail">Gmail</option>
                                <option value="outlook">Outlook / Office 365</option>
                                <option value="generic">SMTP Genérico</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">E-mail *</label>
                            <input
                                type="email"
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                placeholder="email@dominio.com"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Nome do Remetente</label>
                            <input
                                type="text"
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.sender_name}
                                onChange={e => setForm({ ...form, sender_name: e.target.value })}
                                placeholder="Equipe Comercial"
                            />
                        </div>
                    </div>

                    {/* SMTP Config */}
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Configuração SMTP (Envio)</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1 space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Host *</label>
                                <input type="text" className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Porta *</label>
                                <input type="number" className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: parseInt(e.target.value) })} required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">SSL/TLS</label>
                                <div className="flex items-center gap-2 h-9">
                                    <input type="checkbox" checked={form.smtp_secure} onChange={e => setForm({ ...form, smtp_secure: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                                    <span className="text-xs text-slate-600">{form.smtp_secure ? 'SSL/TLS Ativo' : 'STARTTLS'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* IMAP Config */}
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Configuração IMAP (Recebimento) — Opcional</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1 space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Host</label>
                                <input type="text" className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Porta</label>
                                <input type="number" className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: parseInt(e.target.value) })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">SSL/TLS</label>
                                <div className="flex items-center gap-2 h-9">
                                    <input type="checkbox" checked={form.imap_secure} onChange={e => setForm({ ...form, imap_secure: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                                    <span className="text-xs text-slate-600">{form.imap_secure ? 'SSL/TLS Ativo' : 'Sem SSL'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Credentials */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Usuário *</label>
                            <input type="text" className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required placeholder="email@dominio.com" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Senha {account ? '(deixe vazio para manter)' : '*'}</label>
                            <input type="password" className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!account} />
                        </div>
                    </div>

                    {/* Signature */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Assinatura HTML</label>
                        <textarea
                            className="w-full min-h-[80px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                            value={form.signature_html}
                            onChange={e => setForm({ ...form, signature_html: e.target.value })}
                            placeholder="<p>Atenciosamente,<br/>Equipe Comercial</p>"
                        />
                    </div>

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                        <span className="text-sm text-slate-700">Definir como conta padrão</span>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : (account ? 'Salvar Alterações' : 'Criar Conta')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
