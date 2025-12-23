"use client";

import { ArrowLeft, MoreHorizontal, ChevronRight, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { updateDeal, logSystemActivity } from "@/app/actions";
import { useRouter } from "next/navigation";

export default function DealHeader({ deal, pipelines }: any) {
    const router = useRouter();
    const currentPipeline = pipelines.find((p: any) => p.stages.some((s: any) => s.id === deal.stage_id));
    const currentStage = currentPipeline?.stages.find((s: any) => s.id === deal.stage_id);

    const [isStageOpen, setIsStageOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleStageChange(pipelineId: string, stageId: number, stageName: string) {
        if (stageId === deal.stage_id) { setIsStageOpen(false); return; }
        setLoading(true);
        setIsStageOpen(false);

        const res = await updateDeal(deal.id, { stage_id: stageId });
        if (res.success) {
            await logSystemActivity(deal.id, `Moveu o negócio para a etapa "${stageName}"`);
            router.refresh();
        } else {
            alert("Erro ao mover negócio.");
        }
        setLoading(false);
    }

    return (
        <header className="h-14 bg-[#2b3d51] text-white flex items-center justify-between px-4 shrink-0 shadow-md z-20">
            <div className="flex items-center gap-4">
                <Link href="/leads" className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-sm font-bold leading-tight">{deal.title}</h1>
                    <div className="flex items-center gap-2 text-[10px] text-gray-300">
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

                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-white/10 rounded-md text-sm font-bold opacity-80 hover:opacity-100">Estatísticas</button>
                <button className="p-2 hover:bg-white/10 rounded-md opacity-80 hover:opacity-100">
                    <MoreHorizontal size={20} />
                </button>
            </div>
        </header>
    );
}
