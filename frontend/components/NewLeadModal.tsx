"use client";
import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, User, Phone, Mail, DollarSign, GitPullRequest, Layers, UserCheck, StickyNote, Tag } from "lucide-react";
import { createLead, getTeamMembers } from "@/app/actions";
import { getPipelines } from "@/app/(protected)/leads/actions";
import { createClient } from "@/utils/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface NewLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NewLeadModal({ isOpen, onClose, onSuccess }: NewLeadModalProps) {
    const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');

    // Campos do form
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [value, setValue] = useState("");
    const [pipelineId, setPipelineId] = useState<string>("");
    const [stageId, setStageId] = useState<string>("");
    const [ownerId, setOwnerId] = useState<string>("");
    const [notes, setNotes] = useState("");
    const [tagIds, setTagIds] = useState<number[]>([]);

    // Import State
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importResult, setImportResult] = useState<{ success: boolean; count?: number; errors?: any[]; error?: string } | null>(null);

    const [loading, setLoading] = useState(false);

    // Carrega pipelines (kind=deals), time e tags
    const pipelinesQuery = useQuery({
        queryKey: qk.pipelines.list(),
        queryFn: async () => {
            const r = await getPipelines();
            if (!r.success) throw new Error(r.error ?? "Falha ao carregar funis");
            return (r.data ?? []) as any[];
        },
        enabled: isOpen,
        staleTime: 5 * 60_000,
    });
    const pipelines = pipelinesQuery.data ?? [];

    const teamQuery = useQuery({
        queryKey: qk.team.members(),
        queryFn: async () => {
            const r = await getTeamMembers();
            if (!r.success) throw new Error(r.error ?? "Falha ao carregar time");
            return (r.data ?? []) as any[];
        },
        enabled: isOpen,
        staleTime: 5 * 60_000,
    });
    const team = teamQuery.data ?? [];

    const tagsQuery = useQuery({
        queryKey: qk.tags.all(),
        queryFn: async () => {
            const supabase = createClient();
            const { data, error } = await supabase.from("tags").select("*").order("name");
            if (error) throw error;
            return data ?? [];
        },
        enabled: isOpen,
        staleTime: 5 * 60_000,
    });
    const tags = tagsQuery.data ?? [];

    // Auto-seleciona o primeiro pipeline ao carregar
    useEffect(() => {
        if (!pipelineId && pipelines.length > 0) {
            const def = pipelines.find((p: any) => p.is_default) ?? pipelines[0];
            setPipelineId(String(def.id));
        }
    }, [pipelines, pipelineId]);

    // Auto-seleciona stage de entrada do pipeline selecionado
    const selectedPipeline = useMemo(
        () => pipelines.find((p: any) => String(p.id) === String(pipelineId)),
        [pipelines, pipelineId],
    );
    const stages = useMemo(() => {
        const all = (selectedPipeline?.stages ?? []) as any[];
        // Esconde stages won/lost (nao faz sentido criar lead direto la)
        return all.filter((s) => !s.is_won && !s.is_lost);
    }, [selectedPipeline]);

    useEffect(() => {
        if (!stageId && stages.length > 0) {
            const inbox = stages.find((s: any) => s.is_inbox) ?? stages[0];
            setStageId(String(inbox.id));
        }
    }, [stages, stageId]);

    useEffect(() => {
        // Reset stage quando troca pipeline
        if (selectedPipeline && stages.length > 0) {
            const stillValid = stages.some((s: any) => String(s.id) === stageId);
            if (!stillValid) {
                const inbox = stages.find((s: any) => s.is_inbox) ?? stages[0];
                setStageId(String(inbox.id));
            }
        }
    }, [pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    function resetForm() {
        setName("");
        setPhone("");
        setEmail("");
        setValue("");
        setNotes("");
        setTagIds([]);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) {
            toast.error("Nome e WhatsApp sao obrigatorios");
            return;
        }
        setLoading(true);

        const result = await createLead({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            value,
            pipelineId: pipelineId || undefined,
            stageId: stageId || undefined,
            ownerId: ownerId || undefined,
            notes: notes.trim() || undefined,
            tagIds: tagIds.length > 0 ? tagIds : undefined,
        });

        setLoading(false);

        if (result.success) {
            if ((result as any).reused) {
                toast.success("Lead ja existia — atualizado");
            } else {
                toast.success("Lead criado");
            }
            onSuccess();
            onClose();
            resetForm();
        } else {
            toast.error("Erro ao criar lead", result.error);
        }
    }

    async function handleImport() {
        if (!importFile) {
            toast.warning("Selecione um arquivo Excel");
            return;
        }
        setLoading(true);
        setImportResult(null);

        const formData = new FormData();
        formData.append('file', importFile);

        const { importLeadsFromExcel } = await import("@/app/actions");
        const res = await importLeadsFromExcel(formData);

        setLoading(false);
        setImportResult(res);
    }

    function toggleTag(id: number) {
        setTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl p-0 gap-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 shrink-0">
                    <DialogTitle className="text-lg font-bold text-slate-900">
                        {activeTab === 'manual' ? 'Novo Lead' : 'Importar Leads'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500 mt-0.5">
                        {activeTab === 'manual' ? 'Cadastre uma nova oportunidade no funil' : 'Importacao em massa via Excel'}
                    </DialogDescription>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'manual' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Manual
                    </button>
                    <button
                        onClick={() => setActiveTab('import')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'import' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Importar Excel
                    </button>
                </div>

                {/* Content */}
                {activeTab === 'manual' ? (
                    <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                        <div className="p-6 space-y-6 overflow-y-auto">

                            {/* SEÇÃO: CONTATO */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Contato</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <User className="w-3.5 h-3.5" /> Nome do cliente <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                            placeholder="Ex: João Silva"
                                        />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <Phone className="w-3.5 h-3.5" /> WhatsApp <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                            placeholder="(31) 99999-9999"
                                        />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <Mail className="w-3.5 h-3.5" /> E-mail
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                            placeholder="cliente@exemplo.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SEÇÃO: OPORTUNIDADE */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Oportunidade</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <GitPullRequest className="w-3.5 h-3.5" /> Funil
                                        </label>
                                        <select
                                            value={pipelineId}
                                            onChange={(e) => setPipelineId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm bg-white"
                                        >
                                            {pipelines.length === 0 && <option value="">Nenhum funil disponivel</option>}
                                            {pipelines.map((p: any) => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <Layers className="w-3.5 h-3.5" /> Etapa
                                        </label>
                                        <select
                                            value={stageId}
                                            onChange={(e) => setStageId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm bg-white"
                                        >
                                            {stages.length === 0 && <option value="">--</option>}
                                            {stages.map((s: any) => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <UserCheck className="w-3.5 h-3.5" /> Responsavel
                                        </label>
                                        <select
                                            value={ownerId}
                                            onChange={(e) => setOwnerId(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm bg-white"
                                        >
                                            <option value="">Sem responsavel</option>
                                            {team.map((m: any) => (
                                                <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                            <DollarSign className="w-3.5 h-3.5" /> Valor estimado (R$)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={value}
                                            onChange={(e) => setValue(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SEÇÃO: TAGS */}
                            {tags.length > 0 && (
                                <div>
                                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
                                        <Tag className="w-3.5 h-3.5" /> Etiquetas
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((t: any) => {
                                            const active = tagIds.includes(t.id);
                                            return (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => toggleTag(t.id)}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${active ? "border-transparent text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                                                    style={active ? { backgroundColor: t.color || "#6366f1" } : {}}
                                                >
                                                    {t.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* SEÇÃO: OBSERVAÇÕES */}
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
                                    <StickyNote className="w-3.5 h-3.5" /> Observacoes iniciais
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
                                    placeholder="Contexto, origem do lead, proximos passos..."
                                />
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !pipelineId || !stageId}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors text-sm shadow-sm"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Salvar Lead
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                ) : (
                    // IMPORT TAB
                    <div className="p-6 space-y-4 overflow-y-auto">
                        <div className="bg-indigo-50 text-indigo-800 text-xs p-3 rounded-lg border border-indigo-100">
                            <p className="font-bold mb-1">Colunas esperadas no Excel:</p>
                            <p>Nome do lead, Etapa do funil, Responsavel, Valor da venda, Etiquetas, Telefone, E-mail, Site, Produto</p>
                        </div>

                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            />
                        </div>

                        {importResult && (
                            <div className={`p-3 rounded-md text-sm ${importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
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

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors text-sm"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={loading || !importFile}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70 text-sm"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Importando...
                                    </>
                                ) : (
                                    "Importar Arquivo"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
