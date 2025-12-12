"use client";
import { useEffect, useState, useRef } from "react";
import { updateDeal, updateContact, deleteDeal, sendMessage, sendMedia, markAsLost, recoverDeal, addTagToDeal, removeTagFromDeal, getMessages, getTeamMembers } from "@/app/actions";
import { getPipelines } from "@/app/(protected)/leads/actions";
import { getFields } from "@/app/(protected)/settings/fields/actions";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, User, Phone, DollarSign, RefreshCw, ThumbsDown, Trash2, Tag as TagIcon, Plus, StickyNote, Zap, GitPullRequest } from "lucide-react";
import ChatWindow from "./ChatWindow";

export default function DealModal({ isOpen, onClose, deal, onUpdate }: any) {
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [pipelines, setPipelines] = useState<any[]>([]);

    const supabase = createClient();

    useEffect(() => {
        if (!isOpen) return;

        async function fetchTags() {
            const { data } = await supabase.from("tags").select("*").order("name");
            if (data) setAvailableTags(data);
        }

        async function fetchTeam() {
            const result = await getTeamMembers();
            if (result.success && result.data) setTeamMembers(result.data);
        }

        async function fetchPipelines() {
            const res = await getPipelines();
            if (res.success && res.data) setPipelines(res.data);
        }

        fetchTags();
        fetchTeam();
        fetchPipelines();
    }, [isOpen]);

    if (!isOpen || !deal) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-gray-50 w-full max-w-7xl h-[85vh] rounded-xl border border-gray-200 shadow-2xl flex overflow-hidden transition-all duration-300">

                {/* LADO ESQUERDO: Detalhes do Lead (Light Mode) */}
                <div className="w-[350px] bg-white border-r border-gray-200 flex flex-col shrink-0">
                    <EditForm
                        deal={deal}
                        onClose={onClose}
                        onUpdate={onUpdate}
                        availableTags={availableTags}
                        teamMembers={teamMembers}
                        pipelines={pipelines}
                    />
                </div>

                {/* AREA CENTRAL: Chat Window (Light Mode) */}
                <div className="flex-1 bg-[#efeae2] relative overflow-hidden flex flex-col">
                    <ChatWindow deal={deal} theme="light" />
                </div>
            </div>
        </div>
    );
}

function EditForm({ deal, onClose, onUpdate, availableTags, teamMembers, pipelines }: { deal: any, onClose: () => void, onUpdate?: () => void, availableTags: any[], teamMembers: any[], pipelines: any[] }) {
    const [name, setName] = useState(deal.contacts?.name || "");
    const [phone, setPhone] = useState(deal.contacts?.phone || "");
    const [value, setValue] = useState(deal.value || 0);
    const [loading, setLoading] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState<'principal' | 'estatisticas' | 'config'>('principal');

    // Pipeline Logic
    const [currentPipelineId, setCurrentPipelineId] = useState<string>("");
    const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
    const supabase = createClient();

    useEffect(() => {
        // Determine current pipeline from deal stage
        async function loadPipelineInfo() {
            if (deal.stage_id) {
                const { data: stage } = await supabase.from('stages').select('pipeline_id').eq('id', deal.stage_id).single();
                if (stage) setCurrentPipelineId(stage.pipeline_id);
            }
        }
        loadPipelineInfo();
    }, [deal.stage_id]);

    async function handlePipelineChange(newPipelineId: string) {
        setCurrentPipelineId(newPipelineId);
        // Find first stage of new pipeline
        const { data: firstStage } = await supabase
            .from('stages')
            .select('id')
            .eq('pipeline_id', newPipelineId)
            .order('position', { ascending: true })
            .limit(1)
            .single();

        if (firstStage) {
            setSelectedStageId(firstStage.id);
            setHasChanges(true); // Enable Save button
        }
    }

    const [isLossMode, setIsLossMode] = useState(false);
    const [lossReason, setLossReason] = useState("Preço Alto");
    const [lossDetails, setLossDetails] = useState("");

    const [isAddingTag, setIsAddingTag] = useState(false);
    const [localTags, setLocalTags] = useState<any[]>(deal.deal_tags || []);
    const [fields, setFields] = useState<any[]>([]);
    const [customValues, setCustomValues] = useState<Record<string, any>>(deal.custom_values || {});

    useEffect(() => {
        getFields().then(res => {
            if (res.success) setFields(res.data || []);
        });
    }, []);

    useEffect(() => {
        const isChanged =
            name !== deal.contacts?.name ||
            phone !== deal.contacts?.phone ||
            Number(value) !== Number(deal.value);
        setHasChanges(isChanged);
    }, [name, phone, value, deal]);

    useEffect(() => {
        setLocalTags(deal.deal_tags || []);
    }, [deal.deal_tags]);

    async function handleSave() {
        const contactId = deal.contacts?.id || deal.contact_id;
        setLoading(true);
        try {
            if (name !== deal.contacts?.name || phone !== deal.contacts?.phone) {
                if (contactId) await updateContact(contactId, { name, phone });
            }

            const updates: any = {};
            if (Number(value) !== Number(deal.value)) updates.value = Number(value);
            if (JSON.stringify(customValues) !== JSON.stringify(deal.custom_values || {})) updates.custom_values = customValues;
            if (selectedStageId && selectedStageId !== deal.stage_id) updates.stage_id = selectedStageId;

            if (Object.keys(updates).length > 0) {
                await updateDeal(deal.id, updates);
            }

            alert("Salvo com sucesso!");
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onUpdate();
            }
        } catch (error) {
            console.error("Error in handleSave:", error);
            alert("Erro ao salvar");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Tem certeza que deseja excluir este lead?")) return;
        setLoading(true);
        try {
            await deleteDeal(deal.id);
            onClose();
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onUpdate();
            }
        } catch (error) {
            alert("Erro ao excluir");
            setLoading(false);
        }
    }

    async function handleMarkAsLost() {
        if (!confirm("Confirmar que este negócio foi PERDIDO?")) return;
        setLoading(true);
        try {
            await markAsLost(deal.id, lossReason, lossDetails);
            onClose();
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onUpdate();
            }
        } catch (error) {
            alert("Erro ao marcar como perdido");
            setLoading(false);
        }
    }

    async function handleRecover() {
        if (!confirm("Deseja recuperar este lead?")) return;
        setLoading(true);
        try {
            await recoverDeal(deal.id);
            onClose();
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onUpdate();
            }
        } catch (error) {
            alert("Erro ao recuperar lead");
            setLoading(false);
        }
    }

    async function handleAddTag(tagId: string) {
        setIsAddingTag(false);
        const tagToAdd = availableTags.find(t => t.id === tagId);
        if (tagToAdd) {
            setLocalTags(prev => [...prev, { id: `temp-${Date.now()}`, tags: tagToAdd }]);
        }
        try {
            await addTagToDeal(deal.id, tagId);
            if (onUpdate) onUpdate();
        } catch (error) {
            alert("Erro ao adicionar tag");
            setLocalTags(deal.deal_tags || []);
        }
    }

    async function handleRemoveTag(tagId: string) {
        if (!confirm("Remover esta tag?")) return;
        setLocalTags(prev => prev.filter(dt => dt.tags?.id !== tagId));
        try {
            await removeTagFromDeal(deal.id, tagId);
            if (onUpdate) onUpdate();
        } catch (error) {
            alert("Erro ao remover tag");
            setLocalTags(deal.deal_tags || []);
        }
    }

    async function handleOwnerChange(newOwnerId: string) {
        try {
            await updateDeal(deal.id, { owner_id: newOwnerId });
            if (onUpdate) {
                await new Promise(r => setTimeout(r, 300));
                onUpdate();
            }
        } catch (error) {
            alert("Erro ao alterar responsável.");
        }
    }

    if (isLossMode) {
        return (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200 p-6">
                <div className="flex items-center gap-2 mb-6 text-red-600">
                    <button
                        onClick={() => setIsLossMode(false)}
                        className="p-1 hover:bg-red-50 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <ThumbsDown size={20} />
                        Marcar como Perdido
                    </h3>
                </div>

                <div className="space-y-6 flex-1">
                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold block mb-2 tracking-wide">Motivo da Perda</label>
                        <div className="relative">
                            <select
                                value={lossReason}
                                onChange={e => setLossReason(e.target.value)}
                                className="w-full appearance-none bg-gray-50 text-gray-800 p-3 pr-10 rounded-lg border border-gray-300 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all cursor-pointer"
                            >
                                <option value="Preço Alto">Preço Alto</option>
                                <option value="Concorrência">Concorrência</option>
                                <option value="Sem Interesse">Sem Interesse</option>
                                <option value="Contato Inválido">Contato Inválido</option>
                                <option value="Outro">Outro</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold block mb-2 tracking-wide">Detalhes (Opcional)</label>
                        <textarea
                            value={lossDetails}
                            onChange={e => setLossDetails(e.target.value)}
                            rows={5}
                            className="w-full bg-gray-50 text-gray-800 p-3 rounded-lg border border-gray-300 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-none placeholder-gray-400"
                            placeholder="Descreva o que aconteceu para perdermos este negócio..."
                        />
                    </div>
                </div>

                <div className="mt-auto pt-6 border-t border-gray-200">
                    <button
                        onClick={handleMarkAsLost}
                        disabled={loading}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <ThumbsDown size={20} />}
                        Confirmar Perda
                    </button>
                    <button
                        onClick={() => setIsLossMode(false)}
                        className="w-full mt-3 text-gray-500 hover:text-gray-800 text-sm py-2 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* HEADER: Title & Tabs */}
            <div className="px-6 pt-6 pb-0 border-b border-gray-200 bg-white">
                <div className="flex justify-between items-start mb-2">
                    <h2 className="text-2xl font-bold text-gray-800 leading-tight w-full outline-none hover:bg-gray-50 p-1 rounded -ml-1 transition-colors" contentEditable suppressContentEditableWarning>
                        {deal.title}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 transition-colors"><X size={24} /></button>
                </div>

                <div className="text-xs text-gray-500 mb-5 flex items-center gap-2 font-medium">
                    #{deal.id}
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${deal.status === 'won' ? 'bg-green-100 text-green-700' :
                        deal.status === 'lost' ? 'bg-red-100 text-red-700' :
                            'bg-blue-50 text-blue-600'
                        }`}>
                        {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Em Aberto'}
                    </span>
                </div>

                {/* Tabs */}
                <div className="flex gap-6 mt-2">
                    {['Principal', 'Estatísticas', 'Configurações'].map(tab => {
                        const id = tab.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "") as any;
                        const isActive = activeTab === id || (id === 'estatisticas' && activeTab === 'estatisticas');
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(id)}
                                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${isActive
                                    ? 'text-blue-600 border-blue-600'
                                    : 'text-gray-500 border-transparent hover:text-gray-800 hover:border-gray-200'
                                    }`}
                            >
                                {tab}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* BODY SCROLLABLE */}
            <div className="flex-1 overflow-y-auto p-6 space-y-7 custom-scrollbar bg-white">

                {activeTab === 'principal' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Value Primary Field */}
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Valor do Negócio</div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-lg font-light">R$</span>
                                <input
                                    type="number"
                                    value={value}
                                    onChange={e => setValue(e.target.value)}
                                    className="bg-transparent text-gray-800 text-3xl font-bold w-full focus:outline-none placeholder-gray-300"
                                    placeholder="0,00"
                                />
                            </div>
                        </div>

                        {/* Contact Info (Clean) */}
                        <div className="space-y-5">
                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 block group-focus-within:text-blue-600 transition-colors">Nome do Cliente</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-0 top-1.5 text-gray-400" />
                                    <input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="bg-transparent text-gray-800 text-sm font-medium w-full py-1.5 pl-6 border-b border-gray-200 focus:border-blue-500 focus:outline-none transition-all placeholder-gray-400"
                                        placeholder="Nome do cliente"
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 block group-focus-within:text-blue-600 transition-colors">WhatsApp / Telefone</label>
                                <div className="relative">
                                    <Phone size={16} className="absolute left-0 top-1.5 text-gray-400" />
                                    <input
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="bg-transparent text-gray-800 text-sm font-medium w-full py-1.5 pl-6 border-b border-gray-200 focus:border-blue-500 focus:outline-none transition-all placeholder-gray-400"
                                        placeholder="55..."
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 block group-focus-within:text-blue-600 transition-colors">Responsável</label>
                                <select
                                    value={deal.owner_id || ""}
                                    onChange={(e) => handleOwnerChange(e.target.value)}
                                    className="bg-transparent text-gray-800 text-sm font-medium w-full py-1.5 border-b border-gray-200 focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                                >
                                    <option value="" className="text-gray-400">Selecionar...</option>
                                    {teamMembers?.map((member: any) => (
                                        <option key={member.id} value={member.id}>{member.full_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="group">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 block group-focus-within:text-blue-600 transition-colors">Funil</label>
                                <div className="relative">
                                    <GitPullRequest size={16} className="absolute left-0 top-1.5 text-gray-400" />
                                    <select
                                        value={currentPipelineId}
                                        onChange={(e) => handlePipelineChange(e.target.value)}
                                        className="bg-transparent text-gray-800 text-sm font-medium w-full py-1.5 pl-6 border-b border-gray-200 focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                                    >
                                        <option value="" disabled>Selecione um funil</option>
                                        {pipelines?.map((pipe: any) => (
                                            <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Etiquetas</label>
                                <button
                                    onClick={() => setIsAddingTag(!isAddingTag)}
                                    className="text-blue-600 hover:text-blue-700 text-[10px] font-bold uppercase tracking-wide hover:underline transition-all flex items-center gap-1"
                                >
                                    <Plus size={12} /> Adicionar
                                </button>
                            </div>

                            {isAddingTag && (
                                <div className="mb-3 animate-in fade-in slide-in-from-top-1 px-1">
                                    <select
                                        className="w-full bg-white text-gray-800 p-2 rounded text-sm border border-blue-200 focus:border-blue-500 outline-none shadow-sm"
                                        onChange={(e) => { if (e.target.value) handleAddTag(e.target.value); }}
                                        defaultValue=""
                                        autoFocus
                                    >
                                        <option value="" disabled>Selecione...</option>
                                        {availableTags
                                            .filter(t => !localTags.some((dt: any) => dt.tags?.id === t.id))
                                            .map(tag => (
                                                <option key={tag.id} value={tag.id}>{tag.name}</option>
                                            ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {localTags.length === 0 && !isAddingTag && (
                                    <span className="text-sm text-gray-400 italic">Sem etiquetas</span>
                                )}
                                {localTags.map((dt: any) => (
                                    <span
                                        key={dt.id || dt.tags.id}
                                        className="text-[11px] px-2.5 py-1 rounded-full text-white font-bold flex items-center gap-1.5 cursor-pointer hover:shadow-md transition-all border border-transparent hover:scale-105"
                                        style={{ backgroundColor: dt.tags?.color || '#9ca3af' }}
                                        onClick={() => handleRemoveTag(dt.tags?.id)}
                                        title="Remover tag"
                                    >
                                        {dt.tags?.name}
                                        <X size={10} className="opacity-60 hover:opacity-100 transition-opacity" />
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Custom Fields */}
                        {fields.length > 0 && (
                            <div className="pt-6 border-t border-gray-100">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-4 block">Informações Adicionais</label>
                                <div className="space-y-5">
                                    {fields.map(field => (
                                        <div key={field.id} className="group">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 block group-focus-within:text-blue-600 transition-colors">{field.name}</label>

                                            {field.type === 'select' ? (
                                                <select
                                                    value={customValues[field.id] || ""}
                                                    onChange={e => {
                                                        setCustomValues(prev => ({ ...prev, [field.id]: e.target.value }));
                                                        setHasChanges(true);
                                                    }}
                                                    className="bg-transparent text-gray-800 text-sm font-medium w-full py-1.5 border-b border-gray-200 focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {Array.isArray(field.options) && field.options.map((opt: string) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                                    value={customValues[field.id] || ""}
                                                    onChange={e => {
                                                        setCustomValues(prev => ({ ...prev, [field.id]: e.target.value }));
                                                        setHasChanges(true);
                                                    }}
                                                    className="bg-transparent text-gray-800 text-sm font-medium w-full py-1.5 border-b border-gray-200 focus:border-blue-500 focus:outline-none transition-all placeholder-gray-400"
                                                    placeholder="-"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab !== 'principal' && (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm animate-in fade-in">
                        <div className="bg-gray-100 p-4 rounded-full mb-3">
                            {activeTab === 'estatisticas' ? <Zap size={24} className="opacity-50 text-gray-500" /> : <StickyNote size={24} className="opacity-50 text-gray-500" />}
                        </div>
                        Funcionalidade em desenvolvimento.
                    </div>
                )}
            </div>

            {/* FOOTER ACTIONS */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex gap-2">
                <button
                    onClick={handleSave}
                    disabled={!hasChanges || loading}
                    className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${hasChanges
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
                </button>

                {deal.status !== 'lost' && (
                    <button
                        onClick={() => {
                            if (confirm("Confirmar perda?")) handleMarkAsLost();
                        }}
                        className="px-3 py-2.5 rounded-lg bg-white hover:bg-red-50 text-red-500 border border-gray-200 hover:border-red-200 transition-colors shadow-sm"
                        title="Perda"
                    >
                        <ThumbsDown size={18} />
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    className="px-3 py-2.5 rounded-lg bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 border border-gray-200 transition-colors shadow-sm"
                    title="Excluir"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}
