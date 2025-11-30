"use client";
import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { createLead } from "@/app/actions";

interface NewLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NewLeadModal({ isOpen, onClose, onSuccess }: NewLeadModalProps) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        const result = await createLead({ name, phone, value });

        setLoading(false);

        if (result.success) {
            onSuccess();
            onClose();
            // Reset form
            setName("");
            setPhone("");
            setValue("");
        } else {
            alert("Erro ao criar lead: " + result.error);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Novo Lead</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    {/* Nome */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Ex: João Silva"
                        />
                    </div>

                    {/* Telefone */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                        <input
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="(31) 99999-9999"
                            required
                        />
                    </div>

                    {/* Valor */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor Estimado (R$)</label>
                        <input
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="0,00"
                        />
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Salvar Lead
                                </>
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
