'use client';

import { Wifi, WifiOff, AlertTriangle, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
    active: { label: 'Conectada', color: 'text-emerald-700', icon: Wifi, bg: 'bg-emerald-100' },
    inactive: { label: 'Inativa', color: 'text-slate-500', icon: WifiOff, bg: 'bg-slate-100' },
    invalid_credentials: { label: 'Credenciais Inválidas', color: 'text-red-700', icon: ShieldAlert, bg: 'bg-red-100' },
    connection_error: { label: 'Erro de Conexão', color: 'text-orange-700', icon: AlertTriangle, bg: 'bg-orange-100' },
    syncing: { label: 'Sincronizando', color: 'text-blue-700', icon: Loader2, bg: 'bg-blue-100' },
    needs_reauth: { label: 'Reautenticação Necessária', color: 'text-amber-700', icon: RefreshCw, bg: 'bg-amber-100' },
};

export function EmailConnectionStatusBadge({ status }: { status: string }) {
    const config = statusConfig[status] || statusConfig.inactive;
    const Icon = config.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${config.bg} ${config.color}`}>
            <Icon className={`w-3 h-3 ${status === 'syncing' ? 'animate-spin' : ''}`} />
            {config.label}
        </span>
    );
}
