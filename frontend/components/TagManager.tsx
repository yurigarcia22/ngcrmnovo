"use client";

import { useState } from "react";
import { createTag, deleteTag, updateTag } from "../app/actions";
import { Plus, Trash2, Tag as TagIcon, Loader2, Search, Edit2, X } from "lucide-react";

export default function TagManager({ initialTags }: { initialTags: any[] }) {
    const [tags, setTags] = useState(initialTags);
    const [searchTerm, setSearchTerm] = useState("");
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Create/Edit Form State
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState("#3B82F6"); // Default Blue
    const [loading, setLoading] = useState(false);

    const filteredTags = tags.filter(tag =>
        tag.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    function openCreateModal() {
        setEditingTagId(null);
        setNewTagName("");
        setNewTagColor("#3B82F6");
        setIsCreateModalOpen(true);
    }

    function openEditModal(tag: any) {
        setEditingTagId(tag.id);
        setNewTagName(tag.name);
        setNewTagColor(tag.color);
        setIsCreateModalOpen(true);
    }

    async function handleSaveTag() {
        if (!newTagName.trim()) return;

        setLoading(true);
        try {
            if (editingTagId) {
                // UPDATE MODE
                const updatedTags = tags.map(t =>
                    t.id === editingTagId ? { ...t, name: newTagName, color: newTagColor } : t
                );
                setTags(updatedTags); // Optimistic

                const result = await updateTag(editingTagId, newTagName, newTagColor);
                if (!result.success) {
                    alert("Erro ao atualizar tag: " + result.error);
                    setTags(tags); // Rollback
                } else {
                    setIsCreateModalOpen(false);
                    setNewTagName("");
                    setEditingTagId(null);
                }

            } else {
                // CREATE MODE
                const tempTag = {
                    id: "temp-" + Date.now(),
                    name: newTagName,
                    color: newTagColor,
                    created_at: new Date().toISOString(),
                    deal_tags: []
                };
                setTags([...tags, tempTag]);

                const result = await createTag(newTagName, newTagColor);

                if (result.success) {
                    setIsCreateModalOpen(false);
                    setNewTagName("");
                } else {
                    alert("Erro ao criar tag: " + result.error);
                    setTags(tags);
                }
            }
        } catch (error) {
            console.error("Erro:", error);
            setTags(tags);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteTag(id: string) {
        if (!confirm("Tem certeza que deseja excluir esta tag?")) return;

        // Optimistic UI
        setTags(tags.filter(t => t.id !== id));

        try {
            await deleteTag(id);
        } catch (error) {
            console.error("Erro ao deletar:", error);
            alert("Erro ao deletar tag.");
            // Rollback implementation would go here
        }
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[600px] flex flex-col">

            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-gray-700 placeholder:text-gray-400"
                    />
                </div>
                <div className="text-sm text-gray-500 font-medium">
                    {filteredTags.length} resultados
                </div>
                <button
                    onClick={openCreateModal}
                    className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm hover:shadow-md"
                >
                    <Plus size={18} />
                    Criar
                </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50/50 border-b border-gray-200 rounded-t-lg text-xs font-bold text-gray-500 uppercase tracking-wider">
                <div className="col-span-5 md:col-span-4 pl-8">Tags</div>
                <div className="hidden md:block col-span-3">Descrição</div>
                <div className="col-span-3 md:col-span-2 text-center">Leads</div>
                <div className="hidden md:block col-span-2 text-right">Data de criação</div>
                <div className="col-span-1 text-right pr-4">Ações</div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {filteredTags.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <TagIcon size={48} className="mb-4 opacity-20" />
                        <p>Nenhuma etiqueta encontrada.</p>
                    </div>
                ) : (
                    filteredTags.map((tag) => (
                        <div key={tag.id} className="grid grid-cols-12 gap-4 px-4 py-4 items-center border-b border-gray-100 hover:bg-gray-50 transition-colors group">

                            {/* Name & Color */}
                            <div className="col-span-5 md:col-span-4 flex items-center gap-3">
                                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                <div
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: tag.color }}
                                />
                                <span className="font-medium text-gray-700 truncate">{tag.name}</span>
                            </div>

                            {/* Description (Empty for now) */}
                            <div className="hidden md:block col-span-3 text-sm text-gray-400 italic truncate">
                                -
                            </div>

                            {/* Leads Count */}
                            <div className="col-span-3 md:col-span-2 text-center text-sm text-gray-600">
                                {tag.deal_tags && tag.deal_tags[0] ? tag.deal_tags[0].count : 0} leads
                            </div>

                            {/* Date */}
                            <div className="hidden md:block col-span-2 text-right text-sm text-gray-500 pr-4">
                                {tag.created_at ? new Intl.DateTimeFormat('pt-BR').format(new Date(tag.created_at)) : '-'}
                            </div>

                            {/* Actions */}
                            <div className="col-span-4 md:col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => openEditModal(tag)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => handleDeleteTag(tag.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Excluir"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create/Edit Modal (Simple Overlay) */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-800">
                                {editingTagId ? "Editar Etiqueta" : "Nova Etiqueta"}
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input
                                    type="text"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    placeholder="Ex: Cliente VIP"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                                <div className="flex gap-2 flex-wrap">
                                    {['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'].map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setNewTagColor(color)}
                                            className={`w-8 h-8 rounded-full border-2 transition-all ${newTagColor === color ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                    <input
                                        type="color"
                                        value={newTagColor}
                                        onChange={(e) => setNewTagColor(e.target.value)}
                                        className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 overflow-hidden"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSaveTag}
                                disabled={loading || !newTagName.trim()}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg mt-4 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : (editingTagId ? "Salvar Alterações" : "Criar Etiqueta")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
