"use client";


import { useState } from "react";
import { createQuickReply, updateQuickReply, deleteQuickReply } from "../app/actions";
import { Plus, Trash2, Zap, Search, Edit2, X, MessageSquare, Tag, Folder } from "lucide-react";

interface QuickReply {
    id: string;
    shortcut: string;
    category: string;
    content: string;
}

interface QuickReplyManagerProps {
    initialReplies: QuickReply[];
}

export default function QuickReplyManager({ initialReplies }: QuickReplyManagerProps) {
    const [replies, setReplies] = useState(initialReplies);
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [shortcut, setShortcut] = useState("");
    const [category, setCategory] = useState("");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);

    // Get unique categories for suggestions
    const existingCategories = Array.from(new Set(replies.map(r => r.category))).sort();

    const filteredReplies = replies.filter(reply =>
        reply.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reply.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reply.shortcut.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Group filtered replies by category
    const groupedReplies: Record<string, QuickReply[]> = {};
    filteredReplies.forEach(reply => {
        if (!groupedReplies[reply.category]) {
            groupedReplies[reply.category] = [];
        }
        groupedReplies[reply.category].push(reply);
    });

    // Sort categories alphabetically
    const sortedCategories = Object.keys(groupedReplies).sort();

    function openCreateModal() {
        setEditingId(null);
        setShortcut("");
        setCategory("");
        setContent("");
        setIsModalOpen(true);
    }

    function openEditModal(reply: QuickReply) {
        setEditingId(reply.id);
        setShortcut(reply.shortcut);
        setCategory(reply.category);
        setContent(reply.content);
        setIsModalOpen(true);
    }

    async function handleSave() {
        if (!content.trim() || !category.trim()) {
            alert("Conteúdo e Categoria são obrigatórios.");
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append("shortcut", shortcut);
        formData.append("category", category);
        formData.append("content", content);

        try {
            if (editingId) {
                // UPDATE
                const updatedReplies = replies.map(r =>
                    r.id === editingId ? { ...r, shortcut, category, content } : r
                );
                setReplies(updatedReplies); // Optimistic

                const result = await updateQuickReply(editingId, formData);
                if (!result.success) {
                    alert("Erro ao atualizar: " + result.error);
                    setReplies(replies); // Rollback
                } else {
                    setIsModalOpen(false);
                }
            } else {
                // CREATE
                const tempReply = {
                    id: "temp-" + Date.now(),
                    shortcut,
                    category,
                    content
                };
                setReplies([...replies, tempReply]); // Optimistic

                const result = await createQuickReply(formData);
                if (result.success) {
                    setIsModalOpen(false);
                    // In real app, revalidate would fetch real data. 
                    // For now keeping optimistic data is okay or we rely on page refresh
                } else {
                    alert("Erro ao criar: " + result.error);
                    setReplies(replies); // Rollback
                }
            }
        } catch (error) {
            console.error("Erro:", error);
            setReplies(replies);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Tem certeza que deseja excluir esta resposta?")) return;

        setReplies(replies.filter(r => r.id !== id));

        try {
            await deleteQuickReply(id);
        } catch (error) {
            console.error("Erro ao deletar:", error);
            alert("Erro ao deletar.");
        }
    }

    return (
        <div className="space-y-6">

            {/* Header Controls */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Pesquisar por conteúdo, categoria ou atalho..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-gray-700 placeholder:text-gray-400"
                    />
                </div>
                <button
                    onClick={openCreateModal}
                    className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
                >
                    <Plus size={18} />
                    Criar Resposta
                </button>
            </div>

            {/* Grouped Lists */}
            <div className="space-y-6">
                {filteredReplies.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                        <Zap size={48} className="mb-4 opacity-20" />
                        <p>Nenhuma resposta encontrada.</p>
                    </div>
                ) : (
                    sortedCategories.map(cat => (
                        <div key={cat} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {/* Category Header */}
                            <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                                <Folder className="text-blue-500" size={18} />
                                <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{cat}</h3>
                                <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                    {groupedReplies[cat].length}
                                </span>
                            </div>

                            {/* Items List */}
                            <div className="divide-y divide-gray-100">
                                {groupedReplies[cat].map(reply => (
                                    <div key={reply.id} className="p-4 hover:bg-gray-50 transition-colors group flex items-start gap-4">

                                        {/* Shortcut Column */}
                                        <div className="w-24 shrink-0 pt-0.5">
                                            {reply.shortcut ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                                                    /{reply.shortcut}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs italic">Sem atalho</span>
                                            )}
                                        </div>

                                        {/* Content Column */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{reply.content}</p>
                                        </div>

                                        {/* Actions Column */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-start">
                                            <button
                                                onClick={() => openEditModal(reply)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                title="Editar"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(reply.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-800">
                                {editingId ? "Editar Resposta" : "Nova Resposta Rápida"}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Atalho (Opcional)</label>
                                <div className="relative">
                                    <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        value={shortcut}
                                        onChange={(e) => setShortcut(e.target.value)}
                                        placeholder="Ex: pix"
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        list="category-suggestions"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        placeholder="Ex: Financeiro"
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
                                    />
                                    <datalist id="category-suggestions">
                                        {existingCategories.map(cat => <option key={cat} value={cat} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo</label>
                                <div className="relative">
                                    <MessageSquare className="absolute left-3 top-3 text-gray-400" size={16} />
                                    <textarea
                                        rows={4}
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="Digite a mensagem completa..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800 resize-none"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg mt-4 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Salvando..." : (editingId ? "Salvar Alterações" : "Criar Resposta")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
