"use client";

import { useState } from "react";
import { Trash2, Plus, Save, Tag, MessageSquare, Zap, Edit2, X, Check } from "lucide-react";
import { createQuickReply, updateQuickReply, deleteQuickReply, renameQuickReplyCategory } from "../app/actions";

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
    const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [newCategoryName, setNewCategoryName] = useState<string>("");

    // Agrupar por categoria
    const groupedReplies: Record<string, QuickReply[]> = {};
    initialReplies.forEach(reply => {
        if (!groupedReplies[reply.category]) {
            groupedReplies[reply.category] = [];
        }
        groupedReplies[reply.category].push(reply);
    });

    const categories = Object.keys(groupedReplies).sort();

    async function handleSubmit(formData: FormData) {
        if (editingReply) {
            await updateQuickReply(editingReply.id, formData);
            setEditingReply(null);
        } else {
            await createQuickReply(formData);
        }
    }

    async function handleRenameCategory(oldName: string) {
        if (newCategoryName && newCategoryName !== oldName) {
            await renameQuickReplyCategory(oldName, newCategoryName);
        }
        setEditingCategory(null);
        setNewCategoryName("");
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* COLUNA ESQUERDA: Formulário */}
            <div className="lg:col-span-1">
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 sticky top-8">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        {editingReply ? (
                            <>
                                <Edit2 size={20} className="text-yellow-500" />
                                Editar Resposta
                            </>
                        ) : (
                            <>
                                <Plus size={20} className="text-green-500" />
                                Nova Resposta Rápida
                            </>
                        )}
                    </h2>

                    <form key={editingReply ? editingReply.id : 'new'} action={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Atalho (Opcional)</label>
                            <div className="flex items-center gap-2 bg-gray-700/50 p-3 rounded-lg border border-gray-600 focus-within:border-blue-500 transition-colors">
                                <Zap size={18} className="text-gray-500" />
                                <input
                                    name="shortcut"
                                    type="text"
                                    defaultValue={editingReply?.shortcut || ""}
                                    placeholder="Ex: pix"
                                    className="bg-transparent w-full focus:outline-none text-white placeholder-gray-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                            <div className="flex items-center gap-2 bg-gray-700/50 p-3 rounded-lg border border-gray-600 focus-within:border-blue-500 transition-colors">
                                <Tag size={18} className="text-gray-500" />
                                <input
                                    name="category"
                                    type="text"
                                    list="categories-list"
                                    defaultValue={editingReply?.category || ""}
                                    placeholder="Ex: Financeiro"
                                    required
                                    className="bg-transparent w-full focus:outline-none text-white placeholder-gray-500"
                                />
                                <datalist id="categories-list">
                                    {categories.map(cat => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Conteúdo da Mensagem</label>
                            <div className="flex items-start gap-2 bg-gray-700/50 p-3 rounded-lg border border-gray-600 focus-within:border-blue-500 transition-colors">
                                <MessageSquare size={18} className="text-gray-500 mt-1" />
                                <textarea
                                    name="content"
                                    rows={4}
                                    defaultValue={editingReply?.content || ""}
                                    placeholder="Digite a mensagem completa..."
                                    required
                                    className="bg-transparent w-full focus:outline-none text-white placeholder-gray-500 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {editingReply && (
                                <button
                                    type="button"
                                    onClick={() => setEditingReply(null)}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    <X size={20} />
                                    Cancelar
                                </button>
                            )}
                            <button
                                type="submit"
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-blue-500/20"
                            >
                                <Save size={20} />
                                {editingReply ? "Atualizar" : "Salvar"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* COLUNA DIREITA: Lista */}
            <div className="lg:col-span-2 space-y-8">
                {categories.length === 0 && (
                    <div className="text-center py-20 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700 border-dashed">
                        <Zap size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-lg">Nenhuma resposta rápida cadastrada.</p>
                        <p className="text-sm">Use o formulário ao lado para criar a primeira.</p>
                    </div>
                )}

                {categories.map(category => (
                    <div key={category} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="bg-gray-700/50 px-6 py-4 border-b border-gray-700 flex items-center gap-2">
                            <Tag size={18} className="text-blue-400" />

                            {editingCategory === category ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <input
                                        type="text"
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500 flex-1"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => handleRenameCategory(category)}
                                        className="p-1 bg-green-600 hover:bg-green-500 rounded text-white"
                                        title="Salvar"
                                    >
                                        <Check size={16} />
                                    </button>
                                    <button
                                        onClick={() => setEditingCategory(null)}
                                        className="p-1 bg-gray-600 hover:bg-gray-500 rounded text-white"
                                        title="Cancelar"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <h3 className="font-bold text-lg text-white">{category}</h3>
                                    <button
                                        onClick={() => {
                                            setEditingCategory(category);
                                            setNewCategoryName(category);
                                        }}
                                        className="p-1 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors ml-2"
                                        title="Renomear Categoria"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                </>
                            )}

                            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full ml-auto">
                                {groupedReplies[category].length} itens
                            </span>
                        </div>

                        <div className="divide-y divide-gray-700/50">
                            {groupedReplies[category].map(reply => (
                                <div key={reply.id} className="p-4 hover:bg-gray-700/30 transition-colors flex items-start gap-4 group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {reply.shortcut && (
                                                <span className="text-xs font-mono bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/20">
                                                    /{reply.shortcut}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                                            {reply.content}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setEditingReply(reply)}
                                            className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-900/20 rounded-lg transition-colors"
                                            title="Editar"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <form action={deleteQuickReply.bind(null, reply.id)}>
                                            <button
                                                type="submit"
                                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
