"use client";
import { useEffect, useState, useRef } from "react";
import { updateDeal, updateContact, deleteDeal, markAsLost, recoverDeal, addTagToDeal, removeTagFromDeal, getTeamMembers, getDealItems, upsertDealItems, addNote, getNotes, deleteNote, checkDealHasMessages } from "@/app/actions";
import { useRouter } from "next/navigation";
import { getProducts } from "@/app/(protected)/settings/products/actions";
import { getPipelines } from "@/app/(protected)/leads/actions";
import { getFields } from "@/app/(protected)/settings/fields/actions";
import { getLossReasons } from "@/app/(protected)/settings/loss-reasons/actions";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, User, Phone, DollarSign, ThumbsDown, Trash2, Plus, GitPullRequest, Check, MessageCircle, StickyNote, Clock } from "lucide-react";

export default function DealModal({ isOpen, onClose, deal, onUpdate }: any) {
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [availableTags, setAvailableTags] = useState<any[]>([]);
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [notes, setNotes] = useState<any[]>([]);
    const [loadingNotes, setLoadingNotes] = useState(false);

    // Dynamic Data
    const [items, setItems] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [fields, setFields] = useState<any[]>([]);
    const [lossReasons, setLossReasons] = useState<any[]>([]);

    // Master Loading State
    const [isLoading, setIsLoading] = useState(true);

    const supabase = createClient();

    useEffect(() => {
        if (!isOpen) return;

        async function loadAllData() {
            setIsLoading(true);
            try {
                // Parallel Fetching - using allSettled to prevent total failure
                const results = await Promise.allSettled([
                    supabase.from("tags").select("*").order("name"),
                    getTeamMembers(),
                    getPipelines(),
                    getNotes(deal.id),
                    getDealItems(deal.id),
                    getProducts(),
                    getFields(),
                    getLossReasons()
                ]);

                // 0: Tags
                if (results[0].status === 'fulfilled' && results[0].value.data) {
                    setAvailableTags(results[0].value.data);
                }

                // 1: Team
                if (results[1].status === 'fulfilled' && results[1].value.success) {
                    setTeamMembers(results[1].value.data || []);
                }

                // 2: Pipelines
                if (results[2].status === 'fulfilled' && results[2].value.success) {
                    setPipelines(results[2].value.data || []);
                }

                // 3: Notes
                if (results[3].status === 'fulfilled' && results[3].value.success) {
                    setNotes(results[3].value.data || []);
                }

                // 4: Items
                if (results[4].status === 'fulfilled' && results[4].value.success) {
                    setItems(results[4].value.data || []);
                }

                // 5: Products
                if (results[5].status === 'fulfilled' && results[5].value.success) {
                    setProducts(results[5].value.data || []);
                }

                // 6: Fields
                if (results[6].status === 'fulfilled' && results[6].value.success) {
                    setFields(results[6].value.data || []);
                }

                // 7: Loss Reasons
                if (results[7].status === 'fulfilled' && results[7].value.success) {
                    setLossReasons(results[7].value.data || []);
                }

                // Log any errors (optional, helps debugging)
                results.forEach((res, index) => {
                    if (res.status === 'rejected') {
                        console.error(`Failed to load data at index ${index}:`, res.reason);
                    }
                });

            } catch (error) {
                console.error("Critical Error loading deal data:", error);
            } finally {
                setIsLoading(false);
            }
        }

        loadAllData();
    }, [isOpen, deal.id]);

    async function fetchNotes() {
        // Standalone fetch for updates
        setLoadingNotes(true);
        const res = await getNotes(deal.id);
        if (res.success && res.data) setNotes(res.data);
        setLoadingNotes(false);
    }

    if (!isOpen || !deal) return null;

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-4">
                    <Loader2 size={40} className="text-blue-600 animate-spin" />
                    <span className="text-gray-500 font-medium">Carregando informações...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
                {/* HEADER */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Negócio</span>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-800 leading-tight">
                                {deal.title}
                            </h2>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${deal.status === 'won' ? 'bg-green-100 text-green-700' :
                                deal.status === 'lost' ? 'bg-red-100 text-red-700' :
                                    'bg-blue-50 text-blue-600'
                                }`}>
                                {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Em Aberto'}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* SCROLLABLE body */}
                <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-6 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">

                        {/* LEFT COLUMN - MAIN INFO */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* SECTION: CONTACT & EDIT */}
                            <EditForm
                                deal={deal}
                                onClose={onClose}
                                onUpdate={onUpdate}
                                availableTags={availableTags}
                                teamMembers={teamMembers}
                                pipelines={pipelines}
                                // Pass Hoisted Props
                                initialItems={items}
                                products={products}
                                fields={fields}
                                lossReasons={lossReasons}
                            />

                        </div>

                        {/* RIGHT COLUMN - NOTES & ACTIVITY */}
                        <div className="space-y-6">
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
                                <div className="flex items-center gap-2 mb-4">
                                    <StickyNote size={18} className="text-yellow-500" />
                                    <h3 className="font-bold text-gray-700 text-sm">Anotações</h3>
                                </div>
                                <NotesSection dealId={deal.id} notes={notes} onNotesUpdate={fetchNotes} loading={loadingNotes} />
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}

function NotesSection({ dealId, notes, onNotesUpdate, loading }: { dealId: string, notes: any[], onNotesUpdate: () => void, loading: boolean }) {
    const [newNote, setNewNote] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    async function handleAddNote() {
        if (!newNote.trim()) return;
        setIsSaving(true);
        const res = await addNote(dealId, newNote);
        if (res.success) {
            setNewNote("");
            onNotesUpdate();
        } else {
            alert("Erro ao adicionar nota.");
        }
        setIsSaving(false);
    }

    async function handleDeleteNote(id: string) {
        if (!confirm("Excluir esta nota?")) return;
        const res = await deleteNote(id);
        if (res.success) onNotesUpdate();
    }

    return (
        <div className="flex flex-col flex-1 h-full min-h-[300px]">
            {/* ADD NOTE */}
            <div className="mb-4">
                <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Escreva uma observação..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 resize-none transition-all placeholder-gray-400"
                    rows={3}
                />
                <div className="flex justify-end mt-2">
                    <button
                        onClick={handleAddNote}
                        disabled={isSaving || !newNote.trim()}
                        className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-3 py-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? "Salvando..." : "Adicionar Nota"}
                    </button>
                </div>
            </div>

            {/* LIST */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 max-h-[400px]">
                {loading && <div className="text-center py-4 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>}

                {!loading && notes.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs italic">
                        Nenhuma anotação.
                    </div>
                )}

                {notes.map(note => (
                    <div key={note.id} className="bg-yellow-50/50 p-3 rounded-lg border border-yellow-100 group hover:border-yellow-200 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                                {new Date(note.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button onClick={() => handleDeleteNote(note.id)} className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                                <X size={12} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

function EditForm({ deal, onClose, onUpdate, availableTags, teamMembers, pipelines, initialItems, products, fields, lossReasons }: { deal: any, onClose: () => void, onUpdate?: () => void, availableTags: any[], teamMembers: any[], pipelines: any[], initialItems: any[], products: any[], fields: any[], lossReasons: any[] }) {
    const router = useRouter();
    const [name, setName] = useState(deal.contacts?.name || "");
    const [phone, setPhone] = useState(deal.contacts?.phone || "");
    const [value, setValue] = useState(deal.value || 0);
    const [loading, setLoading] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Pipeline Logic
    const [currentPipelineId, setCurrentPipelineId] = useState<string>("");
    const [selectedStageId, setSelectedStageId] = useState<number | null>(deal.stage_id || null);
    const supabase = createClient();

    // Init Pipeline
    useEffect(() => {
        async function loadPipelineInfo() {
            if (deal.stage_id && !currentPipelineId) {
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
            setHasChanges(true);
        }
    }

    const [isLossMode, setIsLossMode] = useState(false);
    const [selectedLossReasonId, setSelectedLossReasonId] = useState<string>("");
    const [lossDetails, setLossDetails] = useState("");

    const [isAddingTag, setIsAddingTag] = useState(false);
    const [localTags, setLocalTags] = useState<any[]>(deal.deal_tags || []);
    // const [fields, setFields] = useState<any[]>([]); // RECEIVED PROP
    const [customValues, setCustomValues] = useState<Record<string, any>>(deal.custom_values || {});

    // PRODUCTS / ITEMS LOGIC
    const [items, setItems] = useState<any[]>(initialItems);
    // const [products, setProducts] = useState<any[]>([]); // RECEIVED PROP
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
    const [isAddingItem, setIsAddingItem] = useState(false);

    // Sync items when loaded from parent
    useEffect(() => {
        if (initialItems) setItems(initialItems);
    }, [initialItems]);

    // REMOVED INTERNAL FETCH EFFECTS
    // useEffect(() => { ... loadItemsAndProducts ... }, [deal.id]);
    // useEffect(() => { ... getFields ... }, []);

    function updateValueFromItems() {
        const total = items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);
        setValue(total);
        setHasChanges(true);
    }

    function handleAddItem() {
        setIsAddingItem(true);
    }

    function handleProductAdd(prodId: string) {
        if (!prodId) return;
        const prod = products.find(p => p.id === prodId);
        const newItem = {
            product_id: prodId,
            quantity: 1,
            unit_price: prod ? prod.price : 0,
            tempId: Date.now()
        };
        setItems([...items, newItem]);
        setIsAddingItem(false);
        setHasChanges(true);
    }

    function handleRemoveItem(index: number) {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
        setHasChanges(true);
    }

    function handleItemChange(index: number, field: string, val: any) {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: val };
        if (field === 'product_id') {
            const prod = products.find(p => p.id === val);
            if (prod) newItems[index].unit_price = prod.price;
        }
        setItems(newItems);
        setHasChanges(true);
    }



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

            if (selectedOwnerId !== deal.owner_id) updates.owner_id = selectedOwnerId;


            if (Object.keys(updates).length > 0) {
                await updateDeal(deal.id, updates);
            }

            await upsertDealItems(deal.id, items);

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
        if (!selectedLossReasonId) {
            alert("Por favor, selecione um motivo de perda.");
            return;
        }
        if (!confirm("Confirmar que este negócio foi PERDIDO?")) return;
        setLoading(true);
        try {
            // Find name for legacy support
            const reasonName = lossReasons.find(r => r.id === selectedLossReasonId)?.name || "Desconhecido";

            await markAsLost(deal.id, reasonName, lossDetails, selectedLossReasonId);
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

    // New State for Owner Batch Save
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>(deal.owner_id || "");

    // WhatsApp Logic
    // WhatsApp Logic
    async function handleWhatsApp() {
        const cleanPhone = phone.replace(/\D/g, "");
        if (!cleanPhone) return alert("Telefone inválido");

        // Check for internal chat
        const check = await checkDealHasMessages(deal.id);
        if (check.success && check.hasMessages) {
            router.push(`/chat?dealId=${deal.id}`);
            return;
        }

        let target = cleanPhone;
        if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
            target = "55" + cleanPhone;
        }

        window.open(`https://wa.me/${target}`, '_blank');
    }

    // Detect changes for Owner
    useEffect(() => {
        if (selectedOwnerId !== deal.owner_id) setHasChanges(true);
    }, [selectedOwnerId, deal.owner_id]);


    // RENDER LOSS MODE
    if (isLossMode) {
        return (
            <div className="bg-white p-6 rounded-xl border border-red-100 shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2 mb-6 text-red-600">
                    <button onClick={() => setIsLossMode(false)} className="p-1 hover:bg-red-50 rounded-full"><X size={20} /></button>
                    <h3 className="font-bold text-lg flex items-center gap-2"><ThumbsDown size={20} /> Marcar como Perdido</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Motivo</label>
                        <select
                            value={selectedLossReasonId}
                            onChange={e => setSelectedLossReasonId(e.target.value)}
                            className="w-full mt-1 p-2 border rounded-md"
                        >
                            <option value="">Selecione um motivo...</option>
                            {lossReasons && lossReasons.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                        {(!lossReasons || lossReasons.length === 0) && (
                            <p className="text-xs text-red-500 mt-1">Nenhum motivo configurado. Vá em Configurações.</p>
                        )}
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Detalhes</label>
                        <textarea value={lossDetails} onChange={e => setLossDetails(e.target.value)} rows={3} className="w-full mt-1 p-2 border rounded-md" />
                    </div>
                    <button onClick={handleMarkAsLost} disabled={loading} className="w-full bg-red-600 text-white py-2 rounded-md font-bold hover:bg-red-700">
                        {loading ? "Processando..." : "Confirmar Perda"}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">

            {/* CARD 1: MAIN FIELDS GRID */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* LEFT: INFO & CONTACT */}
                    <div className="space-y-5">
                        {/* CLIENTE */}
                        <div className="group">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1 block">Cliente</label>
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-full">
                                    <User size={18} />
                                </div>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="font-semibold text-gray-800 w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none py-1 transition-all"
                                    placeholder="Nome do Cliente"
                                />
                            </div>
                        </div>

                        {/* TELEFONE & WHATSAPP */}
                        <div className="group">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1 block">Contato</label>
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-green-50 text-green-600 rounded-full cursor-pointer hover:bg-green-100 transition-colors" onClick={handleWhatsApp} title="Abrir WhatsApp">
                                    <MessageCircle size={18} />
                                </div>
                                <input
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    className="font-medium text-gray-600 w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none py-1 transition-all"
                                    placeholder="Telefone / WhatsApp"
                                />
                            </div>
                        </div>

                        {/* OWNER */}
                        <div className="group">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1 block">Responsável</label>
                            <select
                                value={selectedOwnerId}
                                onChange={(e) => setSelectedOwnerId(e.target.value)}
                                className="w-full bg-gray-50 text-sm p-2 rounded-md border-transparent hover:border-gray-300 focus:border-blue-500 outline-none cursor-pointer"
                            >
                                <option value="" className="text-gray-400">Sem responsável</option>
                                {teamMembers?.map((member: any) => (
                                    <option key={member.id} value={member.id}>{member.full_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* RIGHT: DEAL SPECS */}
                    <div className="space-y-5 border-l border-gray-100 pl-6 md:pl-6">
                        {/* FUNNEL & STAGE */}
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1 block">Funil de Vendas</label>
                            <div className="flex flex-col gap-2">
                                <select
                                    value={currentPipelineId}
                                    onChange={(e) => handlePipelineChange(e.target.value)}
                                    className="w-full bg-gray-50 text-sm font-bold p-2 rounded-md border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
                                >
                                    {pipelines?.map((pipe: any) => (
                                        <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
                                    ))}
                                </select>

                                <select
                                    value={selectedStageId || ""}
                                    onChange={(e) => {
                                        setSelectedStageId(Number(e.target.value));
                                        setHasChanges(true);
                                    }}
                                    className="w-full bg-white border border-gray-200 text-sm p-2 rounded-md focus:border-blue-500 outline-none"
                                >
                                    {pipelines.find(p => p.id === currentPipelineId)?.stages?.sort((a: any, b: any) => a.position - b.position).map((stage: any) => (
                                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* VALUE */}
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1 block">Valor Total</label>
                            <div className="flex items-center gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                <span className="text-blue-400 font-bold">R$</span>
                                <input
                                    type="number"
                                    value={value}
                                    onChange={e => setValue(e.target.value)}
                                    className="bg-transparent text-xl font-bold text-gray-800 w-full focus:outline-none"
                                    placeholder="0,00"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CARD 2: TAGS & CUSTOM FIELDS */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                {/* TAGS */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Etiquetas</label>
                        <button onClick={() => setIsAddingTag(!isAddingTag)} className="text-blue-600 text-[10px] font-bold hover:underline flex items-center gap-1"><Plus size={10} /> Adicionar</button>
                    </div>

                    {isAddingTag && (
                        <select className="w-full mb-2 text-sm p-1 border rounded" onChange={e => { if (e.target.value) handleAddTag(e.target.value) }}>
                            <option value="">Selecione...</option>
                            {availableTags.filter(t => !localTags.some(lt => lt.tags?.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {localTags.length === 0 && <span className="text-xs text-gray-400 italic">Sem etiquetas</span>}
                        {localTags.map((dt: any) => (
                            <span
                                key={dt.id || dt.tags?.id}
                                style={{ backgroundColor: dt.tags?.color || '#ccc' }}
                                className="text-[10px] px-2 py-1 rounded-full text-white font-bold flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => handleRemoveTag(dt.tags?.id)}
                            >
                                {dt.tags?.name} <X size={10} />
                            </span>
                        ))}
                    </div>
                </div>

                {/* CUSTOM FIELDS (Compact) */}
                {fields.length > 0 && (
                    <div className="pt-4 border-t border-gray-100">
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-3 block">Campos Personalizados</label>
                        <div className="grid grid-cols-2 gap-4">
                            {fields.map(field => (
                                <div key={field.id}>
                                    <label className="text-[10px] text-gray-500 font-bold block mb-1">{field.name}</label>
                                    {field.type === 'select' ? (
                                        <select
                                            value={customValues[field.id] || ""}
                                            onChange={e => {
                                                setCustomValues(prev => ({ ...prev, [field.id]: e.target.value }));
                                                setHasChanges(true);
                                            }}
                                            className="w-full text-xs bg-gray-50 p-1.5 rounded border border-gray-200 outline-none focus:border-blue-500"
                                        >
                                            <option value="">-</option>
                                            {field.options?.map((op: string) => <option key={op} value={op}>{op}</option>)}
                                        </select>
                                    ) : (
                                        <input
                                            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                            value={customValues[field.id] || ""}
                                            onChange={e => {
                                                setCustomValues(prev => ({ ...prev, [field.id]: e.target.value }));
                                                setHasChanges(true);
                                            }}
                                            className="w-full text-xs bg-gray-50 p-1.5 rounded border border-gray-200 outline-none focus:border-blue-500"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* CARD 3: PRODUCTS */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Produtos / Serviços</label>
                    <button onClick={handleAddItem} className="text-blue-600 text-[10px] font-bold hover:underline flex items-center gap-1"><Plus size={10} /> Adicionar Item</button>
                </div>

                <div className="space-y-2">
                    {items.length === 0 && !isAddingItem && <div className="text-xs text-gray-400 italic text-center py-2">Nenhum produto vinculado.</div>}

                    {items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded-md border border-gray-100 text-xs">
                            <div className="font-bold text-gray-700">{products.find(p => p.id === item.product_id)?.name || "Item Personalizado"}</div>
                            <div className="flex items-center gap-3">
                                <span className="text-gray-500">x{item.quantity}</span>
                                <span className="font-semibold text-gray-800">R$ {item.unit_price}</span>
                                <button onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ))}

                    {isAddingItem && (
                        <select
                            className="w-full p-2 text-xs border rounded-md"
                            onChange={e => { if (e.target.value) handleProductAdd(e.target.value) }}
                        >
                            <option value="">Selecione o produto...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price}</option>)}
                        </select>
                    )}

                    {items.length > 0 && (
                        <button onClick={updateValueFromItems} className="text-[10px] text-blue-500 hover:underline w-full text-right mt-2">
                            Atualizar Valor Total do Negócio
                        </button>
                    )}
                </div>
            </div>

            {/* ACTIONS FOOTER (Inside EditForm) */}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={handleSave}
                    disabled={!hasChanges || loading}
                    className={`flex-1 py-3 rounded-lg font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2 ${hasChanges ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    Salvar Alterações
                </button>

                {deal.status !== 'lost' && (
                    <button
                        onClick={() => setIsLossMode(true)}
                        className="px-4 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                        title="Marcar como Perdido"
                    >
                        <ThumbsDown size={18} />
                    </button>
                )}

                <button
                    onClick={handleDelete}
                    className="px-4 rounded-lg bg-white border border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    title="Excluir Lead"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    )
}
