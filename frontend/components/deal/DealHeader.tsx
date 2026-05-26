"use client";

import { ArrowLeft, ChevronRight, Check, Pencil, Trash2, Save, X, Trophy, Frown, RotateCcw, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { updateDeal, logSystemActivity, deleteDeal, markAsWon, markAsLost, recoverDeal } from "@/app/actions";
import { getLossReasons } from "@/app/(protected)/settings/loss-reasons/actions";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

function relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.round((now - then) / 1000);
    if (diffSec < 60) return "agora";
    if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)}h`;
    const days = Math.floor(diffSec / 86400);
    if (days < 30) return `há ${days}d`;
    const months = Math.floor(days / 30);
    return `há ${months}mes${months > 1 ? "es" : ""}`;
}

export default function DealHeader({ deal, pipelines }: any) {
    const router = useRouter();
    const confirm = useConfirm();
    const currentPipeline = pipelines.find((p: any) => p.stages.some((s: any) => s.id === deal.stage_id));
    const currentStage = currentPipeline?.stages.find((s: any) => s.id === deal.stage_id);

    const [isStageOpen, setIsStageOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(deal.title);

    // Lost reason modal
    const [showLostModal, setShowLostModal] = useState(false);
    const [lossReasons, setLossReasons] = useState<any[]>([]);
    const [selectedLossReasonId, setSelectedLossReasonId] = useState<string>("");
    const [lossDetails, setLossDetails] = useState("");

    const isWon = deal.status === "won";
    const isLost = deal.status === "lost";
    const isOpen = !isWon && !isLost;

    // Header background by status
    const headerBg = isWon
        ? "bg-gradient-to-r from-emerald-600 to-emerald-700"
        : isLost
            ? "bg-gradient-to-r from-rose-700 to-rose-800"
            : "bg-[#2b3d51]";

    async function handleStageChange(pipelineId: string, stageId: number, stageName: string) {
        if (stageId === deal.stage_id) { setIsStageOpen(false); return; }
        setLoading(true);
        setIsStageOpen(false);

        const res = await updateDeal(deal.id, { stage_id: stageId });
        if (res.success) {
            await logSystemActivity(deal.id, `Moveu o negócio para a etapa "${stageName}"`);
            router.refresh();
        } else {
            toast.error("Erro ao mover negocio");
        }
        setLoading(false);
    }

    async function handleSaveTitle() {
        if (title === deal.title) { setIsEditing(false); return; }
        setLoading(true);
        const res = await updateDeal(deal.id, { title });
        if (res.success) {
            await logSystemActivity(deal.id, `Renomeou o negócio para "${title}"`);
            setIsEditing(false);
            router.refresh();
        } else {
            toast.error("Erro ao salvar titulo");
        }
        setLoading(false);
    }

    async function handleDelete() {
        const ok = await confirm({
            title: "Excluir este negocio?",
            description: "Esta acao e irreversivel.",
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;
        setLoading(true);
        const res = await deleteDeal(deal.id);
        if (res.success) {
            router.push(currentPipeline?.id ? `/leads?pipeline=${currentPipeline.id}` : "/leads");
        } else {
            toast.error("Erro ao excluir negocio");
            setLoading(false);
        }
    }

    async function handleWin() {
        const ok = await confirm({
            title: "Marcar como GANHO?",
            description: "Esta oportunidade sera fechada como ganha.",
            confirmText: "Sim, ganhei!",
        });
        if (!ok) return;
        setLoading(true);
        const res = await markAsWon(deal.id);
        if (res.success) {
            toast.success("Parabens! 🎉");
            router.refresh();
        } else {
            toast.error("Erro: " + res.error);
        }
        setLoading(false);
    }

    async function openLostModal() {
        const res = await getLossReasons();
        if (res.success) setLossReasons(res.data || []);
        setShowLostModal(true);
    }

    async function handleConfirmLost() {
        const reason = lossReasons.find((r) => r.id === selectedLossReasonId);
        setLoading(true);
        const res = await markAsLost(
            deal.id,
            reason?.name,
            lossDetails || undefined,
            selectedLossReasonId || undefined,
        );
        if (res.success) {
            toast.success("Marcado como perdido.");
            setShowLostModal(false);
            router.refresh();
        } else {
            toast.error("Erro: " + res.error);
        }
        setLoading(false);
    }

    async function handleRecover() {
        const ok = await confirm({
            title: "Reabrir esta oportunidade?",
            description: "Sera marcada como em aberto novamente.",
            confirmText: "Reabrir",
        });
        if (!ok) return;
        setLoading(true);
        const res = await recoverDeal(deal.id);
        if (res.success) {
            toast.success("Oportunidade reaberta.");
            router.refresh();
        } else {
            toast.error("Erro: " + res.error);
        }
        setLoading(false);
    }

    const backHref = currentPipeline?.id ? `/leads?pipeline=${currentPipeline.id}` : "/leads";
    const stageEnteredAt = deal.stage_entered_at ?? deal.updated_at ?? deal.created_at;

    return (
        <>
            <header className={`h-14 ${headerBg} text-white flex items-center justify-between px-4 shrink-0 shadow-md z-20 transition-colors`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Link href={backHref} className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            {isEditing ? (
                                <>
                                    <input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="text-sm font-bold text-gray-900 px-2 py-1 rounded w-64 focus:outline-none"
                                        autoFocus
                                    />
                                    <button onClick={handleSaveTitle} disabled={loading} className="p-1 hover:bg-green-500/20 rounded text-green-400">
                                        <Save size={16} />
                                    </button>
                                    <button onClick={() => { setIsEditing(false); setTitle(deal.title); }} disabled={loading} className="p-1 hover:bg-red-500/20 rounded text-red-400">
                                        <X size={16} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h1 className="text-sm font-bold leading-tight truncate">{deal.title}</h1>
                                    {isWon && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/15 rounded text-[10px] font-bold uppercase tracking-wider">
                                            <Trophy size={10} /> Ganho
                                        </span>
                                    )}
                                    {isLost && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/15 rounded text-[10px] font-bold uppercase tracking-wider">
                                            <Frown size={10} /> Perdido
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-white/70 flex-wrap">
                            <span>#{deal.id.slice(0, 8)}</span>

                            {/* STAGE SELECTOR */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsStageOpen(!isStageOpen)}
                                    className="bg-white/10 px-1.5 rounded text-white flex items-center gap-1 hover:bg-white/20 transition-colors"
                                >
                                    {currentPipeline?.name || "Pipeline"} <ChevronRight size={10} /> {currentStage?.name || "Etapa"}
                                </button>

                                {isStageOpen && (
                                    <div className="absolute top-full left-0 mt-2 bg-white text-gray-800 rounded-md shadow-xl border border-gray-200 w-64 z-50 overflow-hidden">
                                        {pipelines.map((pipe: any) => (
                                            <div key={pipe.id} className="border-b last:border-0 border-gray-100">
                                                <div className="bg-gray-50 px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                    {pipe.name}
                                                </div>
                                                {pipe.stages.map((stage: any) => (
                                                    <button
                                                        key={stage.id}
                                                        onClick={() => handleStageChange(pipe.id, stage.id, stage.name)}
                                                        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-blue-50 flex items-center justify-between group"
                                                    >
                                                        {stage.name}
                                                        {stage.id === deal.stage_id && <Check size={12} className="text-blue-600" />}
                                                    </button>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* TEMPO NO ESTAGIO */}
                            {isOpen && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0 bg-white/10 rounded text-white/80" title={`Entrou neste estágio em ${new Date(stageEnteredAt).toLocaleString("pt-BR")}`}>
                                    <Clock size={10} /> {relativeTime(stageEnteredAt)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {isOpen && (
                        <>
                            <button
                                onClick={handleWin}
                                disabled={loading}
                                className="px-3 py-1.5 bg-emerald-500/90 hover:bg-emerald-500 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                title="Marcar como Ganho"
                            >
                                <Trophy size={14} />
                                Ganhei
                            </button>
                            <button
                                onClick={openLostModal}
                                disabled={loading}
                                className="px-3 py-1.5 bg-rose-500/90 hover:bg-rose-500 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                title="Marcar como Perdido"
                            >
                                <Frown size={14} />
                                Perdi
                            </button>
                        </>
                    )}

                    {(isWon || isLost) && (
                        <button
                            onClick={handleRecover}
                            disabled={loading}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            title="Reabrir"
                        >
                            <RotateCcw size={14} />
                            Reabrir
                        </button>
                    )}

                    <button
                        onClick={() => setIsEditing(true)}
                        className="p-2 hover:bg-white/10 rounded-md opacity-80 hover:opacity-100 text-white"
                        title="Editar Título"
                    >
                        <Pencil size={18} />
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-2 hover:bg-white/10 rounded-md opacity-80 hover:opacity-100 text-red-300 hover:text-red-400"
                        title="Excluir Lead"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </header>

            {/* Modal: Motivo de Perda */}
            {showLostModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Frown className="text-rose-500" size={20} /> Marcar como perdido
                            </h2>
                            <button onClick={() => setShowLostModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                Motivo da perda
                            </label>
                            <select
                                value={selectedLossReasonId}
                                onChange={(e) => setSelectedLossReasonId(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                            >
                                <option value="">— Selecione —</option>
                                {lossReasons.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-5">
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                Detalhes (opcional)
                            </label>
                            <textarea
                                value={lossDetails}
                                onChange={(e) => setLossDetails(e.target.value)}
                                rows={3}
                                placeholder="O que aconteceu?"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none"
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowLostModal(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmLost}
                                disabled={loading}
                                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                            >
                                Confirmar perda
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
