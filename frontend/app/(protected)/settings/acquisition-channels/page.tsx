"use client";
import { useState, useEffect } from "react";
import { Radio, Plus, Trash2, Pencil, Save, X, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui/simple-ui";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import {
    getAcquisitionChannels,
    createAcquisitionChannel,
    deleteAcquisitionChannel,
    updateAcquisitionChannel,
} from "./actions";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
        <div className="flex items-center gap-1.5">
            {PALETTE.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    aria-label={`Cor ${c}`}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${value === c ? "border-slate-800 scale-110" : "border-white"}`}
                    style={{ backgroundColor: c }}
                />
            ))}
        </div>
    );
}

export default function AcquisitionChannelsPage() {
    const confirm = useConfirm();
    const [channels, setChannels] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState(PALETTE[0]);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState(PALETTE[0]);

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        const res = await getAcquisitionChannels();
        if (res.success) setChannels(res.data || []);
        else toast.error("Erro ao carregar canais");
        setLoading(false);
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true);
        const fd = new FormData();
        fd.append("name", newName);
        fd.append("color", newColor);
        const res = await createAcquisitionChannel(fd);
        if (res.success) {
            toast.success("Canal adicionado!");
            setNewName("");
            setNewColor(PALETTE[0]);
            load();
        } else {
            toast.error(res.error || "Erro ao criar");
        }
        setCreating(false);
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Remover canal de aquisição?",
            description: "Os negócios que usam este canal ficarão sem canal (não são excluídos).",
            tone: "danger",
            confirmText: "Remover",
        });
        if (!ok) return;
        const res = await deleteAcquisitionChannel(id);
        if (res.success) { toast.success("Removido"); load(); }
        else toast.error(res.error || "Erro ao remover");
    }

    function startEdit(item: any) {
        setEditingId(item.id);
        setEditName(item.name);
        setEditColor(item.color || PALETTE[0]);
    }

    async function saveEdit() {
        if (!editingId || !editName.trim()) return;
        const res = await updateAcquisitionChannel(editingId, { name: editName, color: editColor });
        if (res.success) { toast.success("Atualizado!"); setEditingId(null); load(); }
        else toast.error(res.error || "Erro ao atualizar");
    }

    return (
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            <PageHeader
                title="Canais de Aquisição"
                description="De onde seus negócios vêm. Marque o canal em cada negócio e acompanhe no dashboard."
                icon={<Radio className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Canais de Aquisição" },
                ]}
            />

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                    <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Input
                            aria-label="Novo canal de aquisição"
                            placeholder="Novo canal (ex: Tráfego Pago)"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="bg-white placeholder:text-slate-500 flex-1"
                        />
                        <ColorDots value={newColor} onChange={setNewColor} />
                        <Button type="submit" disabled={creating || !newName} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
                            {creating ? <Loader2 className="animate-spin" /> : <Plus size={18} className="mr-2" />}
                            Adicionar
                        </Button>
                    </form>
                </div>

                <div className="divide-y divide-slate-100">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Carregando...</div>
                    ) : channels.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">Nenhum canal cadastrado.</div>
                    ) : (
                        channels.map((ch) => (
                            <div key={ch.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group gap-4">
                                {editingId === ch.id ? (
                                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
                                        <Input
                                            aria-label="Editar nome do canal"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            autoFocus
                                            className="h-9 flex-1"
                                        />
                                        <ColorDots value={editColor} onChange={setEditColor} />
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" onClick={saveEdit} aria-label="Salvar" className="h-9 w-9 p-0 bg-emerald-600 hover:bg-emerald-700 text-white"><Save size={16} /></Button>
                                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar edição" className="h-9 w-9 p-0"><X size={16} /></Button>
                                        </div>
                                    </div>
                                ) : (
                                    <span className="inline-flex items-center gap-2.5 font-medium text-slate-700">
                                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ch.color || "#6366f1" }} />
                                        {ch.name}
                                    </span>
                                )}

                                {editingId !== ch.id && (
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                        <Button size="sm" variant="ghost" onClick={() => startEdit(ch)} aria-label={`Editar ${ch.name}`} className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600">
                                            <Pencil size={16} />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDelete(ch.id)} aria-label={`Remover ${ch.name}`} className="h-9 w-9 p-0 text-slate-500 hover:text-rose-600">
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
