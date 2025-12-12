"use client";

import { useEffect, useState } from "react";
import { getFields, saveField, deleteField } from "./actions";
import { Plus, Trash2, Edit2, Check, X, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FieldsPage() {
    const [fields, setFields] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentField, setCurrentField] = useState<any>(null); // For modal

    useEffect(() => {
        loadFields();
    }, []);

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
        if (!confirm("Tem certeza que deseja apagar este campo? Os dados salvos nos deals não serão perdidos, mas o campo sumirá.")) return;
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
            alert("Erro ao salvar: " + res.error);
        }
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Campos Personalizados</h1>
                <button
                    onClick={handleNew}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
                >
                    <Plus size={18} /> Novo Campo
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs border-b">
                        <tr>
                            <th className="px-6 py-4">Nome</th>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4 text-center">No Card?</th>
                            <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={4} className="p-6 text-center text-gray-400">Carregando...</td></tr>
                        ) : fields.length === 0 ? (
                            <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nenhum campo personalizado criado.</td></tr>
                        ) : (
                            fields.map((field) => (
                                <tr key={field.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 font-medium text-gray-800">{field.name}</td>
                                    <td className="px-6 py-4 text-gray-500 capitalize">{field.type}</td>
                                    <td className="px-6 py-4 text-center">
                                        {field.show_in_card ? (
                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">SIM</span>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(field)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(field.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Field Editor Modal */}
            {isEditing && currentField && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-lg font-bold text-gray-800 mb-4">{currentField.id ? 'Editar Campo' : 'Novo Campo'}</h2>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Campo</label>
                                <input
                                    required
                                    value={currentField.name}
                                    onChange={e => setCurrentField({ ...currentField, name: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                    <select
                                        value={currentField.type}
                                        onChange={e => setCurrentField({ ...currentField, type: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                                        <span className="text-sm text-gray-700 font-medium">Mostrar no Card</span>
                                    </label>
                                </div>
                            </div>

                            {/* Options Editor for Select Type */}
                            {currentField.type === 'select' && (
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Opções (Separadas por vírgula)</label>
                                    <input
                                        placeholder="Ex: Instagram, Facebook, Google"
                                        value={Array.isArray(currentField.options) ? currentField.options.join(", ") : currentField.options || ""}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const opts = val.split(",").map(s => s.trim()); // simple CSV parsing
                                            setCurrentField({ ...currentField, options: opts });
                                        }}
                                        className="w-full border rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Digite as opções separadas por vírgula.</p>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
