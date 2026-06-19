"use client";

import { useEffect, useState } from "react";
import { getFields, saveField, deleteField } from "./actions";
import { Plus, Trash2, Edit2, Check, X, Tag, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";

export default function FieldsPage() {
    const confirm = useConfirm();
    const [fields, setFields] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentField, setCurrentField] = useState<any>(null); // For modal

    useEffect(() => {
        loadFields();
    }, []);

    useEffect(() => {
        if (!isEditing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsEditing(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isEditing]);

    async function loadFields() {
        setLoading(true);
        const res = await getFields();
        if (res.success) {
            setFields(res.data || []);
        }
        setLoading(false);
    }

    function handleNew() {
        setCurrentField({
            name: "",
            type: "text",
            options: [],
            show_in_card: false,
            position: fields.length + 1
        });
        setIsEditing(true);
    }

    function handleEdit(field: any) {
        setCurrentField({ ...field });
        setIsEditing(true);
    }

    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Apagar este campo?",
            description: "Os dados salvos nos deals nao serao perdidos, mas o campo sumira.",
            tone: "danger",
            confirmText: "Apagar",
        });
        if (!ok) return;
        await deleteField(id);
        loadFields();
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        const res = await saveField(currentField);
        if (res.success) {
            setIsEditing(false);
            loadFields();
        } else {
            toast.error("Erro ao salvar", res.error);
        }
    }

    return (
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            <PageHeader
                title="Campos Personalizados"
                description="Crie campos extras para enriquecer os dados dos seus negocios."
                icon={<SlidersHorizontal className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Campos Personalizados" },
                ]}
                actions={
                    <button
                        onClick={handleNew}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
                    >
                        <Plus size={18} /> Novo Campo
                    </button>
                }
            />

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-semibold text-xs border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">Nome</th>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4 text-center">No Card?</th>
                            <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={4} className="p-6 text-center text-slate-500">Carregando...</td></tr>
                        ) : fields.length === 0 ? (
                            <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhum campo personalizado criado.</td></tr>
                        ) : (
                            fields.map((field) => (
                                <tr key={field.id} className="hover:bg-slate-50 transition">
                                    <td className="px-6 py-4 font-medium text-slate-800">{field.name}</td>
                                    <td className="px-6 py-4 text-slate-500 capitalize">{field.type}</td>
                                    <td className="px-6 py-4 text-center">
                                        {field.show_in_card ? (
                                            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">SIM</span>
                                        ) : (
                                            <span className="text-slate-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(field)} aria-label={`Editar ${field.name}`} className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(field.id)} aria-label={`Apagar ${field.name}`} className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Field Editor Modal */}
            {isEditing && currentField && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
                    onClick={() => setIsEditing(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={currentField.id ? 'Editar campo' : 'Novo campo'}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-150 ease-out"
                    >
                        <h2 className="text-lg font-bold text-slate-800 mb-4">{currentField.id ? 'Editar Campo' : 'Novo Campo'}</h2>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label htmlFor="field-name" className="block text-sm font-medium text-slate-700 mb-1">Nome do Campo</label>
                                <input
                                    id="field-name"
                                    required
                                    autoFocus
                                    value={currentField.name}
                                    onChange={e => setCurrentField({ ...currentField, name: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="field-type" className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                                    <select
                                        id="field-type"
                                        value={currentField.type}
                                        onChange={e => setCurrentField({ ...currentField, type: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    >
                                        <option value="text">Texto</option>
                                        <option value="number">Número</option>
                                        <option value="date">Data</option>
                                        <option value="select">Lista de Seleção</option>
                                    </select>
                                </div>
                                <div className="flex items-center pt-6">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={currentField.show_in_card}
                                            onChange={e => setCurrentField({ ...currentField, show_in_card: e.target.checked })}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-slate-700 font-medium">Mostrar no Card</span>
                                    </label>
                                </div>
                            </div>

                            {/* Options Editor for Select Type */}
                            {currentField.type === 'select' && (
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                    <label htmlFor="field-options" className="block text-sm font-semibold text-slate-700 mb-2">Opções (separadas por vírgula)</label>
                                    <input
                                        id="field-options"
                                        placeholder="Ex: Instagram, Facebook, Google"
                                        value={Array.isArray(currentField.options) ? currentField.options.join(", ") : currentField.options || ""}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const opts = val.split(",").map(s => s.trim()); // simple CSV parsing
                                            setCurrentField({ ...currentField, options: opts });
                                        }}
                                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none placeholder:text-slate-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Digite as opções separadas por vírgula.</p>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
                                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
