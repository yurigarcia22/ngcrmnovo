"use client";

import { useEffect, useState } from "react";
import {
    getPipelines, createPipeline, deletePipeline,
    getStages, createStage, updateStage, deleteStage
} from "./actions";
import { Plus, Trash2, GripVertical, Edit2, Check, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function PipelinesPage() {
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
    const [stages, setStages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stagesLoading, setStagesLoading] = useState(false);

    // Filter states
    const [newPipelineName, setNewPipelineName] = useState("");
    const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);

    useEffect(() => {
        loadPipelines();
    }, []);

    useEffect(() => {
        if (selectedPipelineId) {
            loadStages(selectedPipelineId);
        } else {
            setStages([]);
        }
    }, [selectedPipelineId]);

    // Initial Selection
    useEffect(() => {
        if (!loading && pipelines.length > 0 && !selectedPipelineId) {
            setSelectedPipelineId(pipelines[0].id);
        }
    }, [loading, pipelines, selectedPipelineId]);

    async function loadPipelines() {
        setLoading(true);
        const res = await getPipelines();
        if (res.success) {
            setPipelines(res.data || []);
        }
        setLoading(false);
    }

    async function loadStages(pipelineId: string) {
        setStagesLoading(true);
        const res = await getStages(pipelineId);
        if (res.success) {
            setStages(res.data || []);
        }
        setStagesLoading(false);
    }

    async function handleCreatePipeline(e: React.FormEvent) {
        e.preventDefault();
        if (!newPipelineName.trim()) return;

        const res = await createPipeline(newPipelineName);
        if (res.success) {
            setNewPipelineName("");
            setIsCreatingPipeline(false);
            loadPipelines(); // Will trigger selection logic
        } else {
            alert("Erro ao criar funil: " + res.error);
        }
    }

    async function handleDeletePipeline(id: string, e: React.MouseEvent) {
        e.stopPropagation();
        if (!confirm("Tem certeza? Todos os negócios neste funil serão perdidos ou ficarão órfãos.")) return;

        const res = await deletePipeline(id);
        if (res.success) {
            if (selectedPipelineId === id) setSelectedPipelineId(null);
            loadPipelines();
        } else {
            alert("Erro ao deletar: " + res.error);
        }
    }

    // --- Stage Handlers ---
    async function handleAddStage() {
        if (!selectedPipelineId) return;
        const name = prompt("Nome da nova etapa:");
        if (!name) return;

        const res = await createStage(selectedPipelineId, name);
        if (res.success) {
            loadStages(selectedPipelineId);
        } else {
            alert(res.error);
        }
    }

    async function handleUpdateStage(stageId: string, fullData: any) {
        // Optimistic Update could be here, but simpler to reload
        const res = await updateStage(stageId, fullData);
        if (!res.success) alert(res.error);
        else loadStages(selectedPipelineId!);
    }

    async function handleDeleteStage(stageId: string) {
        if (!confirm("Remover etapa?")) return;
        const res = await deleteStage(stageId);
        if (res.success) loadStages(selectedPipelineId!);
        else alert(res.error);
    }

    return (
        <div className="flex h-[calc(100vh-100px)] gap-6 p-6">

            {/* Sidebar: Pipelines List */}
            <div className="w-1/3 min-w-[250px] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Funis</h2>
                    <button
                        onClick={() => setIsCreatingPipeline(true)}
                        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {isCreatingPipeline && (
                    <form onSubmit={handleCreatePipeline} className="flex gap-2 mb-2">
                        <input
                            autoFocus
                            className="flex-1 border rounded px-2 py-1 text-sm bg-white"
                            placeholder="Nome do funil..."
                            value={newPipelineName}
                            onChange={(e) => setNewPipelineName(e.target.value)}
                        />
                        <button type="submit" className="text-green-600"><Check size={18} /></button>
                        <button type="button" onClick={() => setIsCreatingPipeline(false)} className="text-red-500"><X size={18} /></button>
                    </form>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {loading ? (
                        <div className="text-muted-foreground text-sm">Carregando funis...</div>
                    ) : (
                        pipelines.map(pipe => (
                            <div
                                key={pipe.id}
                                onClick={() => setSelectedPipelineId(pipe.id)}
                                className={cn(
                                    "p-3 rounded-lg border cursor-pointer hover:bg-gray-50 flex justify-between items-center transition-all",
                                    selectedPipelineId === pipe.id ? "bg-blue-50 border-blue-200 ring-1 ring-blue-300" : "bg-white border-transparent shadow-sm"
                                )}
                            >
                                <span className={cn("font-medium", selectedPipelineId === pipe.id ? "text-blue-700" : "text-gray-700")}>
                                    {pipe.name}
                                </span>
                                {selectedPipelineId === pipe.id && (
                                    <button
                                        onClick={(e) => handleDeletePipeline(pipe.id, e)}
                                        className="text-gray-400 hover:text-red-500"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main: Stages Editor */}
            <div className="flex-1 flex flex-col rounded-xl border bg-white shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="font-semibold text-lg text-gray-800">
                        {selectedPipelineId ? "Etapas do Funil" : "Selecione um Funil"}
                    </h2>
                    {selectedPipelineId && (
                        <button
                            onClick={handleAddStage}
                            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition"
                        >
                            <Plus size={16} /> Adicionar Etapa
                        </button>
                    )}
                </div>

                <div className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
                    {!selectedPipelineId ? (
                        <div className="h-full flex items-center justify-center text-gray-400">
                            Selecione um funil à esquerda para editar suas etapas.
                        </div>
                    ) : stagesLoading ? (
                        <div className="text-center py-10 text-gray-400">Carregando etapas...</div>
                    ) : stages.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">Este funil ainda não tem etapas.</div>
                    ) : (
                        <div className="space-y-3 max-w-2xl mx-auto">
                            {stages.map((stage) => (
                                <StageItem
                                    key={stage.id}
                                    stage={stage}
                                    onUpdate={handleUpdateStage}
                                    onDelete={handleDeleteStage}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Subcomponent for each Stage Row
function StageItem({ stage, onUpdate, onDelete }: { stage: any, onUpdate: any, onDelete: any }) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(stage.name);
    const [color, setColor] = useState(stage.color || "#3b82f6");

    function save() {
        if (name !== stage.name || color !== stage.color) {
            onUpdate(stage.id, { name, color });
        }
        setIsEditing(false);
    }

    return (
        <div className="bg-white p-3 rounded-lg border shadow-sm flex items-center gap-4 group">
            <div className="text-gray-300 handle cursor-grab hover:text-gray-500">
                <GripVertical size={20} />
            </div>

            {/* Color Indicator */}
            <div className="relative">
                <input
                    type="color"
                    value={color}
                    onChange={(e) => isEditing && setColor(e.target.value)}
                    disabled={!isEditing}
                    className="w-8 h-8 rounded cursor-pointer border-none p-0 overflow-hidden"
                />
            </div>

            {/* Name Input/Display */}
            <div className="flex-1">
                {isEditing ? (
                    <input
                        className="w-full border-b border-blue-500 bg-transparent py-1 focus:outline-none"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                    />
                ) : (
                    <span className="font-medium text-gray-800">{stage.name}</span>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                {isEditing ? (
                    <button onClick={save} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><Check size={18} /></button>
                ) : (
                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition"><Edit2 size={16} /></button>
                )}

                <button
                    onClick={() => onDelete(stage.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    )
}
