"use client";

import { useState } from "react";
import { createTag, deleteTag } from "../app/actions";
import { Plus, Trash2, Tag as TagIcon, Loader2 } from "lucide-react";

export default function TagManager({ initialTags }: { initialTags: any[] }) {
    const [tags, setTags] = useState(initialTags);
    const [newTagName, setNewTagName] = useState("");
    const [newTagColor, setNewTagColor] = useState("#3B82F6"); // Default Blue
    const [loading, setLoading] = useState(false);

    async function handleCreateTag() {
        if (!newTagName.trim()) return;

        setLoading(true);
        try {
            // Optimistic UI
            const tempTag = {
                id: "temp-" + Date.now(),
                name: newTagName,
                color: newTagColor,
                created_at: new Date().toISOString()
            };
            setTags([...tags, tempTag]);
            setNewTagName("");

            const result = await createTag(newTagName, newTagColor);
            if (!result.success) {
                alert("Erro ao criar tag: " + result.error);
                // Rollback would go here in a real app, but for simplicity we just rely on revalidation or refresh
            }
        } catch (error) {
            console.error("Erro:", error);
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
        }
    }

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <TagIcon size={20} className="text-blue-400" />
                Gerenciar Etiquetas
            </h2>

            {/* Form de Criação */}
            <div className="flex flex-wrap gap-4 items-end mb-6 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Nome da Tag</label>
                    <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Ex: VIP, Quente, Retorno..."
                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Cor</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={newTagColor}
                            onChange={(e) => setNewTagColor(e.target.value)}
                            className="h-10 w-16 rounded cursor-pointer bg-transparent"
                        />
                    </div>
                </div>

                <button
                    onClick={handleCreateTag}
                    disabled={loading || !newTagName.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded h-10 flex items-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    Criar Tag
                </button>
            </div>

            {/* Lista de Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {tags.map((tag) => (
                    <div
                        key={tag.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-700 bg-gray-900/30 hover:bg-gray-900/50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-4 h-4 rounded-full shadow-sm"
                                style={{ backgroundColor: tag.color }}
                            />
                            <span className="font-medium text-gray-200">{tag.name}</span>
                        </div>
                        <button
                            onClick={() => handleDeleteTag(tag.id)}
                            className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                            title="Excluir Tag"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                {tags.length === 0 && (
                    <div className="col-span-full text-center text-gray-500 py-4 italic">
                        Nenhuma tag criada ainda.
                    </div>
                )}
            </div>
        </div>
    );
}
