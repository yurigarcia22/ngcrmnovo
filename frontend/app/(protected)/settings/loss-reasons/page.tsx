"use client";
import { useState, useEffect } from "react";
import { AlertOctagon, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui/simple-ui";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { getLossReasons, createLossReason, deleteLossReason, updateLossReason } from "./actions";

export default function LossReasonsSettingsPage() {
    const confirm = useConfirm();
    const [reasons, setReasons] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newItemName, setNewItemName] = useState("");
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    useEffect(() => {
        loadReasons();
    }, []);

    async function loadReasons() {
        setLoading(true);
        const res = await getLossReasons();
        if (res.success) {
            setReasons(res.data || []);
        } else {
            toast.error("Erro ao carregar motivos de perda");
        }
        setLoading(false);
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newItemName.trim()) return;

        setCreating(true);
        const formData = new FormData();
        formData.append("name", newItemName);

        const res = await createLossReason(formData);
        if (res.success) {
            toast.success("Motivo adicionado!");
            setNewItemName("");
            loadReasons();
        } else {
            toast.error(res.error || "Erro ao criar");
        }
        setCreating(false);
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Remover motivo de perda?",
            description: "Isso pode afetar negocios que usam este motivo.",
            tone: "danger",
            confirmText: "Remover",
        });
        if (!ok) return;
        // TODO: Check usage before delete? Or rely on DB constraints (set null or restrict)? 
        // For now, let's assume simple delete.
        const res = await deleteLossReason(id);
        if (res.success) {
            toast.success("Removido com sucesso");
            loadReasons();
        } else {
            toast.error(res.error || "Erro ao remover");
        }
    }

    async function startEdit(item: any) {
        setEditingId(item.id);
        setEditName(item.name);
    }

    async function saveEdit() {
        if (!editingId || !editName.trim()) return;
        const res = await updateLossReason(editingId, editName);
        if (res.success) {
            toast.success("Atualizado!");
            setEditingId(null);
            loadReasons();
        } else {
            toast.error(res.error || "Erro ao atualizar");
        }
    }

    return (
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            <PageHeader
                title="Motivos de Perda"
                description="Defina os motivos padronizados pelos quais os negócios são perdidos."
                icon={<AlertOctagon className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Motivos de Perda" },
                ]}
            />

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex gap-4 items-center">
                    <form onSubmit={handleCreate} className="flex-1 flex gap-2">
                        <Input
                            aria-label="Novo motivo de perda"
                            placeholder="Novo motivo de perda (ex: Preço Alto)"
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                            className="bg-white placeholder:text-slate-500"
                        />
                        <Button type="submit" disabled={creating || !newItemName} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {creating ? <Loader2 className="animate-spin" /> : <Plus size={18} className="mr-2" />}
                            Adicionar
                        </Button>
                    </form>
                </div>

                <div className="divide-y divide-slate-100">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Carregando...</div>
                    ) : reasons.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">Nenhum motivo cadastrado.</div>
                    ) : (
                        reasons.map(reason => (
                            <div key={reason.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                {editingId === reason.id ? (
                                    <div className="flex-1 flex items-center gap-2 mr-4">
                                        <Input
                                            aria-label="Editar motivo de perda"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            autoFocus
                                            className="h-9"
                                        />
                                        <Button size="sm" onClick={saveEdit} aria-label="Salvar" className="h-9 w-9 p-0 bg-emerald-600 hover:bg-emerald-700 text-white"><Save size={16} /></Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar edição" className="h-9 w-9 p-0"><X size={16} /></Button>
                                    </div>
                                ) : (
                                    <span className="font-medium text-slate-700">{reason.name}</span>
                                )}

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    <Button size="sm" variant="ghost" onClick={() => startEdit(reason)} aria-label={`Editar ${reason.name}`} className="h-9 w-9 p-0 text-slate-500 hover:text-blue-600">
                                        <Pencil size={16} />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(reason.id)} aria-label={`Remover ${reason.name}`} className="h-9 w-9 p-0 text-slate-500 hover:text-rose-600">
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
