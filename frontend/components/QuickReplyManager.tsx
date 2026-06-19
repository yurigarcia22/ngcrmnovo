"use client";


import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createQuickReply, updateQuickReply, deleteQuickReply } from "../app/actions";
import { Plus, Trash2, Zap, Search, Edit2, X, MessageSquare, Tag, Folder, Image as ImageIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface QuickReply {
    id: string;
    shortcut: string;
    category: string;
    content: string;
    media_url?: string | null;
    media_type?: string | null;
}

interface QuickReplyManagerProps {
    initialReplies: QuickReply[];
}

export default function QuickReplyManager({ initialReplies }: QuickReplyManagerProps) {
    const router = useRouter();
    const [replies, setReplies] = useState(initialReplies);
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const confirm = useConfirm();

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [shortcut, setShortcut] = useState("");
    const [category, setCategory] = useState("");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    // Midia (imagem/arquivo) da resposta
    const [file, setFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null); // url existente ou objectURL novo
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        setFile(null);
        setMediaPreview(null);
        setIsModalOpen(true);
    }

    function openEditModal(reply: QuickReply) {
        setEditingId(reply.id);
        setShortcut(reply.shortcut);
        setCategory(reply.category);
        setContent(reply.content);
        setFile(null);
        setMediaPreview(reply.media_url ?? null);
        setIsModalOpen(true);
    }

    function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 16 * 1024 * 1024) { toast.warning("Imagem muito grande (máximo 16MB)"); return; }
        setFile(f);
        setMediaPreview(URL.createObjectURL(f));
    }

    function removeImage() {
        setFile(null);
        setMediaPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function handleSave() {
        // Conteudo OU imagem e obrigatorio (resposta pode ser so imagem).
        if ((!content.trim() && !file && !mediaPreview) || !category.trim()) {
            toast.warning("Informe a Categoria e ao menos um texto ou imagem");
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append("shortcut", shortcut);
        formData.append("category", category);
        formData.append("content", content);
        if (file) formData.append("file", file);
        // Editando e removeu a imagem que existia (sem subir nova).
        if (editingId && !file && !mediaPreview) formData.append("removeMedia", "true");

        try {
            if (editingId) {
                const result = await updateQuickReply(editingId, formData);
                if (!result.success) {
                    toast.error("Erro ao atualizar", result.error);
                } else {
                    setIsModalOpen(false);
                    toast.success("Resposta atualizada");
                    router.refresh(); // reflete a midia salva
                }
            } else {
                const result = await createQuickReply(formData);
                if (result.success) {
                    setIsModalOpen(false);
                    toast.success("Resposta criada");
                    router.refresh();
                } else {
                    toast.error("Erro ao criar", result.error);
                }
            }
        } catch (error) {
            console.error("Erro:", error);
            toast.error("Erro ao salvar");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Excluir esta resposta?",
            description: "Esta acao e irreversivel.",
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;

        setReplies(replies.filter(r => r.id !== id));

        try {
            await deleteQuickReply(id);
        } catch (error) {
            console.error("Erro ao deletar:", error);
            toast.error("Erro ao deletar");
        }
    }

    return (
        <div className="space-y-6">

            {/* Header Controls */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        aria-label="Pesquisar respostas rápidas"
                        placeholder="Pesquisar por conteúdo, categoria ou atalho..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-700 placeholder:text-slate-500"
                    />
                </div>
                <button
                    onClick={openCreateModal}
                    className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
                >
                    <Plus size={18} />
                    Criar Resposta
                </button>
            </div>

            {/* Grouped Lists */}
            <div className="space-y-6">
                {filteredReplies.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-xl border border-dashed border-slate-200">
                        <Zap size={48} className="mb-4 opacity-20" />
                        <p>Nenhuma resposta encontrada.</p>
                    </div>
                ) : (
                    sortedCategories.map(cat => (
                        <div key={cat} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            {/* Category Header */}
                            <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                                <Folder className="text-indigo-500" size={18} />
                                <h3 className="font-semibold text-slate-700 text-sm">{cat}</h3>
                                <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                    {groupedReplies[cat].length}
                                </span>
                            </div>

                            {/* Items List */}
                            <div className="divide-y divide-slate-100">
                                {groupedReplies[cat].map(reply => (
                                    <div key={reply.id} className="p-4 hover:bg-slate-50 transition-colors group flex items-start gap-4">

                                        {/* Shortcut Column */}
                                        <div className="w-24 shrink-0 pt-0.5">
                                            {reply.shortcut ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                    /{reply.shortcut}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">Sem atalho</span>
                                            )}
                                        </div>

                                        {/* Content Column */}
                                        <div className="flex-1 min-w-0 flex items-start gap-3">
                                            {reply.media_url && (
                                                <img src={reply.media_url} alt="" className="w-12 h-12 rounded object-cover border border-slate-200 shrink-0" />
                                            )}
                                            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed flex-1 min-w-0">
                                                {reply.content || (reply.media_url ? <span className="text-slate-400 italic">📷 Imagem</span> : "")}
                                            </p>
                                        </div>

                                        {/* Actions Column */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-start">
                                            <button
                                                onClick={() => openEditModal(reply)}
                                                className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                title="Editar"
                                                aria-label="Editar resposta"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(reply.id)}
                                                className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                                title="Excluir"
                                                aria-label="Excluir resposta"
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
            <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
                <DialogContent className="max-w-md bg-white border-slate-200 text-slate-700 max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800">
                            {editingId ? "Editar Resposta" : "Nova Resposta Rápida"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="qr-shortcut" className="block text-sm font-medium text-slate-700 mb-1">Atalho (Opcional)</label>
                            <div className="relative">
                                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    id="qr-shortcut"
                                    type="text"
                                    value={shortcut}
                                    onChange={(e) => setShortcut(e.target.value)}
                                    placeholder="Ex: pix"
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="qr-category" className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                            <div className="relative">
                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    id="qr-category"
                                    type="text"
                                    list="category-suggestions"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="Ex: Financeiro"
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-500"
                                />
                                <datalist id="category-suggestions">
                                    {existingCategories.map(cat => <option key={cat} value={cat} />)}
                                </datalist>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="qr-content" className="block text-sm font-medium text-slate-700 mb-1">Conteúdo {mediaPreview && <span className="text-slate-500 font-normal">(legenda da imagem, opcional)</span>}</label>
                            <div className="relative">
                                <MessageSquare className="absolute left-3 top-3 text-slate-500" size={16} />
                                <textarea
                                    id="qr-content"
                                    rows={4}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Ex: Olá {{primeiro_nome}}, tudo bem?"
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-500 resize-none"
                                />
                            </div>
                            <div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded text-[11px] text-indigo-700">
                                <strong>Variáveis disponíveis:</strong>{" "}
                                {[
                                    "{{nome}}",
                                    "{{primeiro_nome}}",
                                    "{{telefone}}",
                                    "{{email}}",
                                    "{{empresa}}",
                                    "{{valor}}",
                                    "{{titulo_deal}}",
                                    "{{vendedor}}",
                                ].map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setContent(content + v)}
                                        className="inline-block mx-0.5 my-0.5 px-1.5 py-0.5 bg-white border border-indigo-200 rounded font-mono hover:bg-indigo-100 transition-colors"
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Imagem (opcional) */}
                        <div>
                            <span className="block text-sm font-medium text-slate-700 mb-1">Imagem (opcional)</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePickImage}
                            />
                            {mediaPreview ? (
                                <div className="relative inline-block">
                                    <img src={mediaPreview} alt="Prévia" className="max-h-40 rounded-lg border border-slate-200" />
                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        className="absolute -top-2 -right-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1 shadow"
                                        title="Remover imagem"
                                        aria-label="Remover imagem"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg py-4 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors text-sm"
                                >
                                    <ImageIcon size={18} /> Anexar imagem
                                </button>
                            )}
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg mt-4 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Salvando..." : (editingId ? "Salvar Alterações" : "Criar Resposta")}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}
