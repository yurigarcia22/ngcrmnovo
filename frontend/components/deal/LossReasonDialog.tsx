"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Frown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getLossReasons } from "@/app/(protected)/settings/loss-reasons/actions";

export interface LossConfirmPayload {
    lossReasonId?: string;
    reasonName?: string;
    details?: string;
}

// Cache de modulo dos motivos (evita 1 ida ao servidor a cada abertura do modal).
let reasonsCache: any[] | null = null;

/**
 * Modal UNICO de perda do cliente, usado em todo o app (botao "Perdi",
 * menu do card e arrastar pra coluna de perda). O motivo e OBRIGATORIO
 * quando existem motivos cadastrados em Configuracoes > Motivos de Perda.
 */
export default function LossReasonDialog({
    open,
    onOpenChange,
    onConfirm,
    saving = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (payload: LossConfirmPayload) => void | Promise<void>;
    saving?: boolean;
}) {
    const [reasons, setReasons] = useState<any[]>(reasonsCache ?? []);
    const [loadingReasons, setLoadingReasons] = useState(false);
    const [reasonId, setReasonId] = useState("");
    const [details, setDetails] = useState("");

    useEffect(() => {
        if (!open) return;
        setReasonId("");
        setDetails("");
        // Cache de modulo: o modal abre INSTANTANEO nas proximas vezes; a lista
        // atualiza em segundo plano (motivos quase nunca mudam durante o uso).
        if (reasonsCache) {
            setReasons(reasonsCache);
        } else {
            setLoadingReasons(true);
        }
        getLossReasons()
            .then((res) => {
                if (res.success) {
                    reasonsCache = res.data ?? [];
                    setReasons(reasonsCache);
                }
            })
            .finally(() => setLoadingReasons(false));
    }, [open]);

    const selected = reasons.find((r) => r.id === reasonId);
    // Obrigatorio quando ha motivos cadastrados; sem nenhum cadastrado nao
    // bloqueia a perda (senao o botao ficaria impossivel de usar).
    const canConfirm = !saving && !loadingReasons && (reasons.length === 0 || !!reasonId);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
            <DialogContent className="max-w-md bg-white p-6">
                <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Frown className="text-rose-500" size={20} /> Perda do cliente
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                    Informe o motivo — ele alimenta o relatório de perdas do funil.
                </DialogDescription>

                <div className="mt-2">
                    <label htmlFor="loss-reason" className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Motivo da perda <span className="text-rose-500">*</span>
                    </label>
                    {loadingReasons ? (
                        <div className="h-9 rounded-lg bg-slate-100 animate-pulse" aria-hidden />
                    ) : reasons.length === 0 ? (
                        <p className="text-xs text-slate-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                            Nenhum motivo cadastrado ainda.{" "}
                            <Link href="/settings/loss-reasons" className="font-semibold text-indigo-600 hover:underline">
                                Cadastre em Configurações → Motivos de Perda
                            </Link>{" "}
                            para tornar a seleção obrigatória.
                        </p>
                    ) : (
                        <select
                            id="loss-reason"
                            value={reasonId}
                            onChange={(e) => setReasonId(e.target.value)}
                            autoFocus
                            className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                        >
                            <option value="">— Selecione o motivo —</option>
                            {reasons.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="mt-3">
                    <label htmlFor="loss-details" className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Detalhes (opcional)
                    </label>
                    <textarea
                        id="loss-details"
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        rows={3}
                        placeholder="O que aconteceu?"
                        className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none placeholder:text-slate-500"
                    />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm({
                            lossReasonId: reasonId || undefined,
                            reasonName: selected?.name,
                            details: details.trim() || undefined,
                        })}
                        disabled={!canConfirm}
                        className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        Confirmar perda
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
