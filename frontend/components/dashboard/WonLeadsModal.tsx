"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, Input } from "@/components/ui/simple-ui";
import { getWonDealsDetails } from "@/app/(protected)/dashboard/actions";
import { updateDeal, deleteDeal } from "@/app/actions";
import { toast } from "sonner";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface WonLeadsModalProps {
    isOpen: boolean;
    onClose: () => void;
    period: string;
    userId: string;
    startDate?: string;
    endDate?: string;
    onDataChanged: () => void; // Trigger a dashboard refresh
}

export function WonLeadsModal({ isOpen, onClose, period, userId, startDate, endDate, onDataChanged }: WonLeadsModalProps) {
    const confirm = useConfirm();
    const [deals, setDeals] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    useEffect(() => {
        if (isOpen) {
            fetchDeals();
        } else {
            setDeals([]);
            cancelEdit();
        }
    }, [isOpen, period, userId, startDate, endDate]);

    async function fetchDeals() {
        setLoading(true);
        const res = await getWonDealsDetails({ period, userId, startDate, endDate });
        if (res.success && res.data) {
            setDeals(res.data);
        } else {
            toast.error("Erro ao carregar vendas");
        }
        setLoading(false);
    }

    const handleEditStart = (deal: any) => {
        setEditingId(deal.id);
        setEditValue(deal.value?.toString() || "0");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue("");
    };

    const handleSaveEdit = async (dealId: string) => {
        const numValue = parseFloat(editValue);
        if (isNaN(numValue)) {
            toast.error("Valor inválido");
            return;
        }

        const toastId = toast.loading("Salvando...");
        const res = await updateDeal(dealId, { value: numValue });
        if (res.success) {
            toast.success("Valor atualizado", { id: toastId });
            setEditingId(null);
            fetchDeals();
            onDataChanged();
        } else {
            toast.error("Erro ao atualizar valor", { id: toastId });
        }
    };

    const handleDelete = async (dealId: string) => {
        const ok = await confirm({
            title: "Excluir esta venda?",
            description: "Esta acao e irreversivel.",
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;

        const toastId = toast.loading("Excluindo...");
        const res = await deleteDeal(dealId);
        if (res.success) {
            toast.success("Venda excluída", { id: toastId });
            fetchDeals();
            onDataChanged();
        } else {
            toast.error("Erro ao excluir", { id: toastId });
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
    };

    const formatDate = (isoString: string) => {
        if (!isoString) return "-";
        return new Date(isoString).toLocaleDateString("pt-BR", {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl bg-white text-slate-700 border-slate-200 max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        Relatório de Vendas (Ganhos)
                    </DialogTitle>
                    <p className="text-sm text-slate-500">
                        {deals.length} negócios fechados no período selecionado.
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto mt-4 pr-2 custom-scrollbar space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Carregando dados...</div>
                    ) : deals.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">Nenhuma venda encontrada no período.</div>
                    ) : (
                        deals.map((deal) => (
                            <div key={deal.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors gap-4">
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-800 text-base">{deal.title}</h4>
                                    <div className="text-xs text-slate-500 mt-1 flex gap-4">
                                        <span>Fechamento: {formatDate(deal.closed_at)}</span>
                                        {/* You can add more info here if needed */}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                                    {editingId === deal.id ? (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                className="w-32 bg-white border-slate-300 text-slate-800 h-8 text-sm"
                                            />
                                            <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 w-8 p-0" onClick={() => handleSaveEdit(deal.id)}><Check size={16} /></Button>
                                            <Button size="sm" variant="ghost" className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 h-8 w-8 p-0" onClick={cancelEdit}><X size={16} /></Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <div className="text-lg font-bold text-emerald-600">
                                                {formatCurrency(deal.value)}
                                            </div>
                                            <div className="flex gap-1">
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50" onClick={() => handleEditStart(deal)}>
                                                    <Pencil size={14} />
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(deal.id)}>
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end">
                    <Button onClick={onClose} variant="outline" className="text-slate-700 border-slate-300 hover:bg-slate-100">
                        Fechar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
