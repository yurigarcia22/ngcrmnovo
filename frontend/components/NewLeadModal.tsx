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
    const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');

    // Manual State
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [value, setValue] = useState("");

    // Import State
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importResult, setImportResult] = useState<{ success: boolean; count?: number; errors?: any[]; error?: string } | null>(null);

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

    async function handleImport() {
        if (!importFile) return alert("Selecione um arquivo Excel");
        setLoading(true);
        setImportResult(null);

        const formData = new FormData();
        formData.append('file', importFile);

        // Dynamically import the action to avoid client/server issues if any (though logic is "use server" so direct import is fine)
        const { importLeadsFromExcel } = await import("@/app/actions");
        const res = await importLeadsFromExcel(formData);

        setLoading(false);
        setImportResult(res);

        if (res.success) {
            // onSuccess(); // don't close immediately, let user see result
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">
                        {activeTab === 'manual' ? 'Novo Lead' : 'Importar Leads'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'manual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Manual
                    </button>
                    <button
                        onClick={() => setActiveTab('import')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'import' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Importar Excel
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'manual' ? (
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
                ) : (
                    // IMPORT TAB
                    <div className="p-6 space-y-4">
                        <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-md border border-blue-100 shadow-sm">
                            <p className="font-bold mb-1">Colunas esperadas no Excel:</p>
                            <p>Nome do lead, Etapa do funil, Responsavel, Valor da venda, Etiquetas, Telefone, E-mail, Site, Produto</p>
                        </div>

                        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </div>

                        {importResult && (
                            <div className={`p-3 rounded-md text-sm ${importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {importResult.success ? (
                                    <div>
                                        <p className="font-bold">Sucesso! {importResult.count} leads importados.</p>
                                        {importResult.errors && importResult.errors.length > 0 && (
                                            <div className="mt-2 text-xs">
                                                <p className="font-bold">Alertas:</p>
                                                <ul className="list-disc pl-4 max-h-24 overflow-y-auto">
                                                    {importResult.errors.map((e: any, i: number) => (
                                                        <li key={i}>Linha {e.row}: {e.error}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p>Erro: {importResult.error}</p>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={loading || !importFile}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Importando...
                                    </>
                                ) : (
                                    <>
                                        Importar Arquivo
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
