"use client";

import { useEffect, useState } from "react";
import {
    getPipelines, createPipeline, deletePipeline,
    getStages, createStage, updateStage, deleteStage, updateStagesOrder
} from "./actions";
import { Plus, Trash2, GripVertical, Edit2, Check, X, LayoutTemplate, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button, Input } from "@/components/ui/simple-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DragDropContext, Draggable, DropResult } from "@hello-pangea/dnd";
import { StrictModeDroppable } from "@/components/StrictModeDroppable";

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
            // Sort by position just in case backend didn't (though it does)
            const sorted = (res.data || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
            setStages(sorted);
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
            toast.success("Funil criado com sucesso!");
        } else {
            toast.error("Erro ao criar funil: " + res.error);
        }
    }

    async function handleDeletePipeline(id: string, e: React.MouseEvent) {
        e.stopPropagation();
        if (!confirm("Tem certeza? Todos os negócios neste funil serão perdidos ou ficarão órfãos.")) return;

        const res = await deletePipeline(id);
        if (res.success) {
            if (selectedPipelineId === id) setSelectedPipelineId(null);
            loadPipelines();
            toast.success("Funil removido com sucesso!");
        } else {
            toast.error("Erro ao deletar: " + res.error);
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
            toast.success("Etapa adicionada!");
        } else {
            toast.error(res.error);
        }
    }

    async function handleUpdateStage(stageId: string, fullData: any) {
        // Optimistic Update could be here, but simpler to reload
        const res = await updateStage(stageId, fullData);
        if (!res.success) toast.error(res.error);
        else {
            loadStages(selectedPipelineId!);
            toast.success("Etapa atualizada");
        }
    }

    async function handleDeleteStage(stageId: string) {
        if (!confirm("Remover etapa?")) return;
        const res = await deleteStage(stageId);
        if (res.success) {
            loadStages(selectedPipelineId!);
            toast.success("Etapa removida");
        }
        else toast.error(res.error);
    }

    async function onDragEnd(result: DropResult) {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;

        const newStages = Array.from(stages);
        const [reorderedItem] = newStages.splice(result.source.index, 1);
        newStages.splice(result.destination.index, 0, reorderedItem);

        // Update Position values locally
        const updatedStages = newStages.map((stage, index) => ({
            ...stage,
            position: index
        }));

        setStages(updatedStages);

        // Optimistic update done, now save
        const updates = updatedStages.map(s => ({ id: s.id, position: s.position, pipeline_id: s.pipeline_id }));
        try {
            const res = await updateStagesOrder(updates);
            if (!res.success) {
                toast.error("Erro ao salvar ordem: " + res.error);
                loadStages(selectedPipelineId!); // Revert
            } else {
                toast.success("Ordem salva");
            }
        } catch (e) {
            loadStages(selectedPipelineId!);
        }
    }

    return (
        <div className="flex h-[calc(100vh-20px)] gap-6 p-6 bg-slate-50/50">

            {/* Sidebar: Pipelines List */}
            <Card className="w-1/3 min-w-[300px] flex flex-col h-full border-none shadow-md">
                <CardHeader className="pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <LayoutTemplate className="w-5 h-5 text-blue-600" />
                                Funis de Vendas
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Gerencie seus processos comerciais
                            </CardDescription>
                        </div>
                        <Button
                            onClick={() => setIsCreatingPipeline(true)}
                            size="icon"
                            className="rounded-full shadow-sm hover:shadow-md transition-all"
                        >
                            <Plus className="w-5 h-5" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isCreatingPipeline && (
                        <form onSubmit={handleCreatePipeline} className="flex gap-2 mb-4 animate-in slide-in-from-top-2">
                            <Input
                                autoFocus
                                className="flex-1"
                                placeholder="Nome do novo funil..."
                                value={newPipelineName}
                                onChange={(e) => setNewPipelineName(e.target.value)}
                            />
                            <Button type="submit" size="icon" variant="success" className="shrink-0">
                                <Check className="w-4 h-4" />
                            </Button>
                            <Button type="button" onClick={() => setIsCreatingPipeline(false)} size="icon" variant="destructive" className="shrink-0">
                                <X className="w-4 h-4" />
                            </Button>
                        </form>
                    )}

                    {loading ? (
                        <div className="text-muted-foreground text-sm text-center py-8">Carregando funis...</div>
                    ) : (
                        <div className="space-y-2">
                            {pipelines.map(pipe => (
                                <div
                                    key={pipe.id}
                                    onClick={() => setSelectedPipelineId(pipe.id)}
                                    className={cn(
                                        "group flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md",
                                        selectedPipelineId === pipe.id
                                            ? "bg-blue-50 border-blue-200 ring-1 ring-blue-300 shadow-sm"
                                            : "bg-white border-slate-100 hover:border-blue-100"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-2 h-8 rounded-full bg-slate-200 transition-colors",
                                            selectedPipelineId === pipe.id && "bg-blue-500"
                                        )} />
                                        <span className={cn(
                                            "font-medium transition-colors",
                                            selectedPipelineId === pipe.id ? "text-blue-900" : "text-slate-600"
                                        )}>
                                            {pipe.name}
                                        </span>
                                    </div>

                                    {selectedPipelineId === pipe.id && (
                                        <Button
                                            onClick={(e) => handleDeletePipeline(pipe.id, e)}
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Main: Stages Editor */}
            <Card className="flex-1 flex flex-col h-full border-none shadow-md overflow-hidden bg-white">
                <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            {selectedPipelineId ? (
                                <>
                                    Etapas do Funil
                                    <span className="text-slate-400 text-sm font-normal ml-2 flex items-center gap-1">
                                        <ArrowRight className="w-3 h-3" /> Configuração
                                    </span>
                                </>
                            ) : (
                                "Selecione um Funil"
                            )}
                        </h2>
                        {selectedPipelineId && (
                            <p className="text-sm text-slate-500 mt-1">
                                Gerencie as colunas e fases deste processo de venda
                            </p>
                        )}
                    </div>

                    {selectedPipelineId && (
                        <Button onClick={handleAddStage} className="gap-2 shadow-sm">
                            <Plus className="w-4 h-4" />
                            Nova Etapa
                        </Button>
                    )}
                </div>

                <div className="flex-1 p-8 overflow-y-auto bg-slate-50/30">
                    {!selectedPipelineId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                            <LayoutTemplate className="w-16 h-16 opacity-20" />
                            <p>Selecione um funil à esquerda para editar suas etapas.</p>
                        </div>
                    ) : stagesLoading ? (
                        <div className="text-center py-20 text-slate-400 flex flex-col items-center gap-3">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            Carregando etapas...
                        </div>
                    ) : stages.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl m-10">
                            <p>Este funil ainda não tem etapas.</p>
                            <Button onClick={handleAddStage} variant="link" className="mt-2 text-blue-600">
                                Adicionar a primeira etapa
                            </Button>
                        </div>
                    ) : (
                        <DragDropContext onDragEnd={onDragEnd}>
                            <StrictModeDroppable droppableId="stages-list">
                                {(provided) => (
                                    <div
                                        className="space-y-3 max-w-3xl mx-auto"
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                    >
                                        {stages.map((stage, index) => (
                                            <Draggable key={String(stage.id)} draggableId={String(stage.id)} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        style={{ ...provided.draggableProps.style }}
                                                    >
                                                        <StageItem
                                                            stage={stage}
                                                            onUpdate={handleUpdateStage}
                                                            onDelete={handleDeleteStage}
                                                            dragHandleProps={provided.dragHandleProps}
                                                            isDragging={snapshot.isDragging}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </StrictModeDroppable>
                        </DragDropContext>
                    )}
                </div>
            </Card>
        </div>
    );
}

// Subcomponent for each Stage Row
function StageItem({ stage, onUpdate, onDelete, dragHandleProps, isDragging }: {
    stage: any,
    onUpdate: any,
    onDelete: any,
    dragHandleProps?: any,
    isDragging?: boolean
}) {
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
        <div className={cn(
            "group bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all duration-200",
            isDragging ? "shadow-lg border-blue-400 rotate-1 scale-102 z-50" : "hover:border-blue-300 hover:shadow-md"
        )}>
            <div
                {...dragHandleProps}
                className="text-slate-300 cursor-grab hover:text-slate-500 active:cursor-grabbing p-1 outline-none"
            >
                <GripVertical className="w-5 h-5" />
            </div>

            {/* Color Indicator */}
            <div className="relative group/color">
                <div
                    className="w-8 h-8 rounded-lg shadow-sm ring-1 ring-black/5 transition-transform group-hover/color:scale-110"
                    style={{ backgroundColor: color }}
                />
                <input
                    type="color"
                    value={color}
                    onChange={(e) => isEditing && setColor(e.target.value)}
                    disabled={!isEditing}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                    title="Mudar cor da etapa"
                />
            </div>

            {/* Name Input/Display */}
            <div className="flex-1">
                {isEditing ? (
                    <Input
                        className="font-medium text-lg h-auto py-1.5 focus-visible:ring-blue-500"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && save()}
                    />
                ) : (
                    <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 text-lg">{stage.name}</span>
                        <span className="text-xs text-slate-400 capitalize">
                            {/* Position: {stage.position} */}
                        </span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                {isEditing ? (
                    <Button onClick={save} size="icon" variant="success" className="h-9 w-9">
                        <Check className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button
                        onClick={() => setIsEditing(true)}
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                    >
                        <Edit2 className="w-4 h-4" />
                    </Button>
                )}

                <Button
                    onClick={() => onDelete(stage.id)}
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    )
}
