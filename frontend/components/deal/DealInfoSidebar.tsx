"use client";

import { useState } from "react";
import { User, Phone, Mail, Building, Tag, Check, X, Edit2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { updateDeal, updateContact, addTagToDeal, removeTagFromDeal, logSystemActivity, createContactForDeal, createCompanyForDeal, upsertDealItems } from "@/app/actions";
import { useRouter } from "next/navigation";

export default function DealInfoSidebar({ deal, teamMembers, pipelines, availableTags, products = [], dealItems = [], lossReasons = [] }: any) {
    const router = useRouter();
    const [contact, setContact] = useState(deal.contacts || null);
    const [company, setCompany] = useState(deal.companies || null);
    const [dealValue, setDealValue] = useState(deal.value);
    const [loadingField, setLoadingField] = useState<string | null>(null);

    // Editing States (Contact)
    const [editingValue, setEditingValue] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);
    const [editingEmail, setEditingEmail] = useState(false);

    // Add New Contact State
    const [isAddingContact, setIsAddingContact] = useState(false);
    const [newContactData, setNewContactData] = useState({ name: "", phone: "", email: "", position: "" });

    // Add New Company State
    const [isAddingCompany, setIsAddingCompany] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState("");

    // Products State
    const [items, setItems] = useState<any[]>(dealItems || []);
    const [isAddingProduct, setIsAddingProduct] = useState(false);

    // Temp Values (For Editing)
    const [tempValue, setTempValue] = useState(deal.value);
    const [tempName, setTempName] = useState(deal.contacts?.name || "");
    const [tempPhone, setTempPhone] = useState(deal.contacts?.phone || "");
    const [tempEmail, setTempEmail] = useState(deal.contacts?.email || "");

    const [showTagInput, setShowTagInput] = useState(false);

    // --- ACTIONS ---

    async function handleSaveValue() {
        if (tempValue === dealValue) { setEditingValue(false); return; }
        setLoadingField('value');

        const oldVal = dealValue;
        setDealValue(tempValue); // Optimistic
        setEditingValue(false);

        const res = await updateDeal(deal.id, { value: tempValue });
        if (res.success) {
            await logSystemActivity(deal.id, `Alterou o valor de R$${oldVal} para R$${tempValue}`);
            router.refresh();
        } else {
            setDealValue(oldVal); // Revert
            alert("Erro ao atualizar valor");
        }
        setLoadingField(null);
    }

    async function handleSaveContactField(field: 'name' | 'phone' | 'email', value: string, setEditing: (v: boolean) => void) {
        if (!contact) return;
        if (value === contact[field]) { setEditing(false); return; }
        setLoadingField(field);

        const oldVal = contact[field];
        setContact({ ...contact, [field]: value }); // Optimistic
        setEditing(false);

        const res = await updateContact(contact.id, { [field]: value });
        if (res.success) {
            await logSystemActivity(deal.id, `Alterou ${field === 'name' ? 'nome' : field === 'phone' ? 'telefone' : 'email'} do contato para "${value}"`);
            router.refresh();
        } else {
            setContact({ ...contact, [field]: oldVal }); // Revert
            alert(`Erro ao atualizar ${field}`);
        }
        setLoadingField(null);
    }

    async function handleCreateContact() {
        if (!newContactData.name) { alert("Nome é obrigatório"); return; }
        setLoadingField('create_contact');

        const res = await createContactForDeal(deal.id, newContactData);
        if (res.success) {
            await logSystemActivity(deal.id, `Criou e vinculou o contato "${newContactData.name}"`);
            setContact(res.data);
            setIsAddingContact(false);
            setTempName(res.data.name);
            setTempPhone(res.data.phone);
            setTempEmail(res.data.email);
            router.refresh();
        } else {
            alert("Erro ao criar contato: " + res.error);
        }
        setLoadingField(null);
    }

    async function handleCreateCompany() {
        if (!newCompanyName) { alert("Nome da empresa é obrigatório"); return; }
        setLoadingField('create_company');

        const res = await createCompanyForDeal(deal.id, newCompanyName);
        if (res.success) {
            await logSystemActivity(deal.id, `Criou e vinculou a empresa "${newCompanyName}"`);
            setCompany(res.data);
            setIsAddingCompany(false);
            router.refresh();
        } else {
            alert("Erro ao criar empresa: " + res.error);
        }
        setLoadingField(null);
    }


    // --- PRODUCTS LOGIC ---
    async function handleAddProduct(productId: string) {
        const product = products.find((p: any) => p.id === productId);
        if (!product) return;

        // Check if already exists
        const existingItem = items.find((i: any) => i.product_id === productId);
        let newItems;

        if (existingItem) {
            newItems = items.map((i: any) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i);
        } else {
            newItems = [...items, { product_id: productId, products: product, quantity: 1, unit_price: product.price }];
        }

        setItems(newItems); // Optimistic
        setIsAddingProduct(false);

        // Calculate new deal value
        const newValue = newItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
        setTempValue(newValue); // Suggest updating deal value too?

        // Save Items
        const res = await upsertDealItems(deal.id, newItems);
        if (res.success) {
            await logSystemActivity(deal.id, `Adicionou produto: ${product.name}`);
            router.refresh();
            // Optionally update deal value automatically?
            if (newValue !== dealValue) {
                // Ask user or auto-update? Let's auto-update for seamlessness
                setDealValue(newValue);
                await updateDeal(deal.id, { value: newValue });
            }
        } else {
            alert("Erro ao salvar produtos");
            setItems(items); // Rollback
        }
    }

    async function handleRemoveProduct(productId: string) {
        const newItems = items.filter((i: any) => i.product_id !== productId);
        setItems(newItems);

        const res = await upsertDealItems(deal.id, newItems);
        if (res.success) {
            await logSystemActivity(deal.id, `Removeu produto`);
            router.refresh();

            // Update Value
            const newValue = newItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
            if (newValue !== dealValue) {
                setDealValue(newValue);
                await updateDeal(deal.id, { value: newValue });
            }
        }
    }


    async function handleTagAdd(tagId: string) {
        const tag = availableTags.find((t: any) => t.id === tagId);
        if (!tag) return;

        const res = await addTagToDeal(deal.id, tagId);
        if (res.success) {
            await logSystemActivity(deal.id, `Adicionou a etiqueta "${tag.name}"`);
            router.refresh();
            setShowTagInput(false);
        }
    }

    async function handleTagRemove(tagId: string, tagName: string) {
        if (!confirm("Remover etiqueta?")) return;
        const res = await removeTagFromDeal(deal.id, tagId);
        if (res.success) {
            await logSystemActivity(deal.id, `Removeu a etiqueta "${tagName}"`);
            router.refresh();
        }
    }

    // Owner State
    const [editingOwner, setEditingOwner] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState(deal.owner_id || "");

    async function handleSaveOwner() {
        if (selectedOwner === deal.owner_id) { setEditingOwner(false); return; }
        setLoadingField('owner');

        const newOwnerName = teamMembers.find((m: any) => m.id === selectedOwner)?.full_name || "Sem dono";

        const res = await updateDeal(deal.id, { owner_id: selectedOwner || null });
        if (res.success) {
            await logSystemActivity(deal.id, `Alterou o responsável para "${newOwnerName}"`);
            deal.owner_id = selectedOwner; // Optimistic update
            router.refresh();
        } else {
            alert("Erro ao atualizar responsável");
            setSelectedOwner(deal.owner_id); // Revert
        }
        setEditingOwner(false);
        setLoadingField(null);
    }

    return (
        <div className="bg-white h-full border-r border-gray-200 flex flex-col">
            {/* TABS */}
            <div className="flex border-b border-gray-100 px-4">
                <button className="px-4 py-3 text-sm font-bold text-gray-800 border-b-2 border-blue-600">Principal</button>
                <button className="px-4 py-3 text-sm font-bold text-gray-400 hover:text-gray-600">Estatísticas</button>
                <button className="px-4 py-3 text-sm font-bold text-gray-400 hover:text-gray-600">Mídia</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                {/* INFO GERAL */}
                <div className="space-y-4">
                    {/* OWNER */}
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2 min-h-[30px]">
                        <span className="text-gray-400 text-xs font-bold uppercase">Responsável</span>
                        {editingOwner ? (
                            <div className="flex items-center gap-1 animate-in fade-in">
                                <select
                                    value={selectedOwner}
                                    onChange={(e) => setSelectedOwner(e.target.value)}
                                    className="w-full border border-blue-300 rounded px-1 py-0.5 text-xs font-medium focus:outline-none"
                                    autoFocus
                                >
                                    <option value="">Sem dono</option>
                                    {teamMembers.map((m: any) => (
                                        <option key={m.id} value={m.id}>{m.full_name}</option>
                                    ))}
                                </select>
                                <button onClick={handleSaveOwner} disabled={loadingField === 'owner'} className="text-green-600 hover:bg-green-50 p-1 rounded shrink-0"><Check size={14} /></button>
                                <button onClick={() => { setEditingOwner(false); setSelectedOwner(deal.owner_id || ""); }} className="text-red-500 hover:bg-red-50 p-1 rounded shrink-0"><X size={14} /></button>
                            </div>
                        ) : (
                            <div onClick={() => { setSelectedOwner(deal.owner_id || ""); setEditingOwner(true); }} className="flex items-center gap-2 group cursor-pointer relative hover:bg-gray-50 px-1 -ml-1 rounded transition-colors">
                                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold shrink-0">
                                    {deal.owner_id && teamMembers.find((m: any) => m.id === deal.owner_id)?.full_name ? teamMembers.find((m: any) => m.id === deal.owner_id).full_name.charAt(0).toUpperCase() : "?"}
                                </div>
                                <span className="text-sm font-medium text-blue-600 truncate">
                                    {teamMembers.find((m: any) => m.id === deal.owner_id)?.full_name || "Sem dono"}
                                </span>
                                <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                            </div>
                        )}
                    </div>

                    {/* VALUE */}
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2 min-h-[30px]">
                        <span className="text-gray-400 text-xs font-bold uppercase">Venda</span>
                        {editingValue ? (
                            <div className="flex items-center gap-1 animate-in fade-in">
                                <input
                                    type="number"
                                    value={tempValue}
                                    onChange={e => setTempValue(Number(e.target.value))}
                                    className="w-24 border border-blue-300 rounded px-1 py-0.5 text-sm font-bold"
                                    autoFocus
                                />
                                <button onClick={handleSaveValue} disabled={loadingField === 'value'} className="text-green-600 hover:bg-green-50 p-1 rounded"><Check size={14} /></button>
                                <button onClick={() => setEditingValue(false)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={14} /></button>
                            </div>
                        ) : (
                            <div onClick={() => { setTempValue(dealValue); setEditingValue(true); }} className="flex items-center gap-1 font-bold text-gray-800 cursor-pointer hover:bg-gray-50 px-1 -ml-1 rounded group transition-colors">
                                <span className="text-xs">R$</span>
                                <span className="text-lg">{Number(dealValue).toLocaleString('pt-BR')}</span>
                                <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                            </div>
                        )}
                    </div>

                    {/* TAGS */}
                    <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                        <span className="text-gray-400 text-xs font-bold uppercase pt-1">Etiquetas</span>
                        <div className="flex flex-wrap gap-1">
                            {deal.deal_tags?.map((dt: any) => (
                                <span key={dt.tags.id} className="bg-gray-100 group text-gray-600 text-[10px] px-2 py-0.5 rounded-sm uppercase font-bold tracking-wide flex items-center gap-1">
                                    {dt.tags.name}
                                    <button onClick={() => handleTagRemove(dt.tags.id, dt.tags.name)} className="text-gray-400 hover:text-red-500 hidden group-hover:inline"><X size={10} /></button>
                                </span>
                            ))}

                            <div className="relative">
                                <button onClick={() => setShowTagInput(!showTagInput)} className="text-[10px] text-gray-400 hover:text-blue-500 font-bold uppercase border border-dashed border-gray-300 px-2 py-0.5 rounded hover:border-blue-300 transition-colors">
                                    + Tag
                                </button>
                                {showTagInput && (
                                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-md p-2 z-20 w-48 max-h-48 overflow-y-auto">
                                        <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Selecionar Etiqueta</div>
                                        {availableTags.filter((t: any) => !deal.deal_tags?.some((dt: any) => dt.tags.id === t.id)).map((tag: any) => (
                                            <button
                                                key={tag.id}
                                                onClick={() => handleTagAdd(tag.id)}
                                                className="block w-full text-left px-2 py-1 text-xs hover:bg-blue-50 text-gray-700 rounded mb-1"
                                                style={{ borderLeft: `3px solid ${tag.color}` }}
                                            >
                                                {tag.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* LOST REASON SECTION */}
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2 min-h-[30px]">
                        <span className="text-gray-400 text-xs font-bold uppercase">Motivo de Perda</span>

                        <div className="relative w-full">
                            <select
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-500 transition-all cursor-pointer appearance-none truncate pr-6 hover:border-gray-300"
                                value={deal.lost_reason_id || ""}
                                onChange={async (e) => {
                                    const newId = e.target.value;
                                    const reasonName = lossReasons.find((r: any) => r.id === newId)?.name || null;

                                    const res = await updateDeal(deal.id, {
                                        lost_reason_id: newId || null,
                                        lost_reason: reasonName
                                    });

                                    if (res.success) {
                                        await logSystemActivity(deal.id, `Atualizou o motivo de perda para "${reasonName || "Nenhum"}"`);
                                        router.refresh();
                                    } else {
                                        alert("Erro ao atualizar motivo de perda");
                                    }
                                }}
                            >
                                <option value="">-</option>
                                {lossReasons.map((r: any) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                <span className="text-[10px]">▼</span>
                            </div>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* PRODUTOS (NOVO) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-xs font-bold uppercase">Produtos</span>
                            <button onClick={() => setIsAddingProduct(!isAddingProduct)} className="text-[10px] text-blue-500 font-bold hover:underline">+ Adicionar</button>
                        </div>

                        {isAddingProduct && (
                            <div className="bg-gray-50 p-2 rounded border border-gray-200 mb-2">
                                <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Selecione um produto</div>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {products.map((p: any) => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleAddProduct(p.id)}
                                            className="w-full text-left bg-white border border-gray-200 px-2 py-1.5 rounded text-xs hover:border-blue-300 flex justify-between"
                                        >
                                            <span>{p.name}</span>
                                            <span className="font-bold">R$ {p.price}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            {items.length === 0 && <span className="text-xs text-gray-400 italic">Nenhum produto adicionado.</span>}
                            {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center text-sm group">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-blue-50 p-1 rounded text-blue-500"><ShoppingCart size={12} /></div>
                                        <span className="text-gray-700">{item.products?.name} <span className="text-gray-400 text-xs">x{item.quantity}</span></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900">R$ {item.unit_price * item.quantity}</span>
                                        <button onClick={() => handleRemoveProduct(item.product_id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* CONTATO */}
                    <div className="space-y-3">
                        {/* IF NO CONTACT: SHOW ADD BUTTON */}
                        {!contact && !isAddingContact && (
                            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setIsAddingContact(true)}>
                                <div className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center bg-white group-hover:border-blue-500 transition-colors">
                                    <Plus size={16} className="text-gray-400 group-hover:text-blue-500" />
                                </div>
                                <span className="text-gray-400 text-sm group-hover:text-blue-500 transition-colors">Adicionar contato</span>
                            </div>
                        )}

                        {/* ADDING CONTACT FORM */}
                        {!contact && isAddingContact && (
                            <div className="bg-white p-1 rounded animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center">
                                        <Plus size={16} className="text-gray-400" />
                                    </div>
                                    <input
                                        className="border-b border-blue-500 w-full text-sm p-1 focus:outline-none placeholder:text-gray-300"
                                        placeholder="Nome do contato"
                                        autoFocus
                                        value={newContactData.name}
                                        onChange={e => setNewContactData({ ...newContactData, name: e.target.value })}
                                    />
                                </div>

                                <div className="pl-10 space-y-3">
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-gray-400 text-xs">Empresa</span>
                                        <input className="border-b border-gray-200 w-full text-sm p-0.5 focus:border-blue-500 focus:outline-none placeholder:text-gray-300" placeholder="Nome da empresa" />
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-gray-400 text-xs">Tel. comercial</span>
                                        <input
                                            className="border-b border-gray-200 w-full text-sm p-0.5 focus:border-blue-500 focus:outline-none placeholder:text-gray-300"
                                            placeholder="..."
                                            value={newContactData.phone}
                                            onChange={e => setNewContactData({ ...newContactData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-gray-400 text-xs">Email comercial</span>
                                        <input
                                            className="border-b border-gray-200 w-full text-sm p-0.5 focus:border-blue-500 focus:outline-none placeholder:text-gray-300"
                                            placeholder="..."
                                            value={newContactData.email}
                                            onChange={e => setNewContactData({ ...newContactData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-gray-400 text-xs">Posição</span>
                                        <input
                                            className="border-b border-gray-200 w-full text-sm p-0.5 focus:border-blue-500 focus:outline-none placeholder:text-gray-300"
                                            placeholder="..."
                                            value={newContactData.position}
                                            onChange={e => setNewContactData({ ...newContactData, position: e.target.value })}
                                        />
                                    </div>

                                    <div className="flex items-center gap-3 pt-2">
                                        <button
                                            onClick={handleCreateContact}
                                            disabled={loadingField === 'create_contact'}
                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded font-bold"
                                        >
                                            {loadingField === 'create_contact' ? "Salvando..." : "Salvar"}
                                        </button>
                                        <button onClick={() => setIsAddingContact(false)} className="text-xs text-gray-400 hover:text-red-500 underline decoration-dashed">cancelar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* EXISTING CONTACT DISPLAY */}
                        {contact && (
                            <>
                                <div className="flex items-center gap-2 group">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                        <User size={16} className="text-gray-500" />
                                    </div>
                                    {editingName ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                value={tempName}
                                                onChange={e => setTempName(e.target.value)}
                                                className="border border-blue-300 rounded px-1 py-0.5 text-sm font-bold w-40"
                                                autoFocus
                                            />
                                            <button onClick={() => handleSaveContactField('name', tempName, setEditingName)} className="text-green-600"><Check size={14} /></button>
                                            <button onClick={() => setEditingName(false)} className="text-red-500"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <h3 onClick={() => { setTempName(contact.name); setEditingName(true); }} className="font-bold text-gray-800 text-sm cursor-pointer hover:text-blue-600 flex items-center gap-2">
                                            {contact.name || "Sem Nome"}
                                            <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                                        </h3>
                                    )}
                                </div>

                                <div className="pl-10 space-y-2">
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2 group min-h-[24px]">
                                        <span className="text-gray-400 text-xs">Tel. comercial</span>
                                        {editingPhone ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    value={tempPhone}
                                                    onChange={e => setTempPhone(e.target.value)}
                                                    className="border border-blue-300 rounded px-1 py-0 text-xs w-32"
                                                    autoFocus
                                                />
                                                <button onClick={() => handleSaveContactField('phone', tempPhone, setEditingPhone)} className="text-green-600"><Check size={12} /></button>
                                                <button onClick={() => setEditingPhone(false)} className="text-red-500"><X size={12} /></button>
                                            </div>
                                        ) : (
                                            <span onClick={() => { setTempPhone(contact.phone); setEditingPhone(true); }} className="text-sm font-medium text-gray-700 cursor-pointer hover:text-blue-600 flex items-center gap-2">
                                                {contact.phone || "-"}
                                                <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2 group min-h-[24px]">
                                        <span className="text-gray-400 text-xs">Email comercial</span>
                                        {editingEmail ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    value={tempEmail}
                                                    onChange={e => setTempEmail(e.target.value)}
                                                    className="border border-blue-300 rounded px-1 py-0 text-xs w-48"
                                                    autoFocus
                                                />
                                                <button onClick={() => handleSaveContactField('email', tempEmail, setEditingEmail)} className="text-green-600"><Check size={12} /></button>
                                                <button onClick={() => setEditingEmail(false)} className="text-red-500"><X size={12} /></button>
                                            </div>
                                        ) : (
                                            <span onClick={() => { setTempEmail(contact.email); setEditingEmail(true); }} className="text-sm font-medium text-gray-700 cursor-pointer hover:text-blue-600 flex items-center gap-2 truncate">
                                                {contact.email || "-"}
                                                <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                                        <span className="text-gray-400 text-xs">Posição</span>
                                        <span className="text-sm text-gray-500">...</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <hr className="border-gray-100" />

                    {/* EMPRESA */}
                    <div className="space-y-3">
                        {!company && !isAddingCompany && (
                            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setIsAddingCompany(true)}>
                                <div className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center bg-white group-hover:border-blue-500 transition-colors">
                                    <Plus size={16} className="text-gray-400 group-hover:text-blue-500" />
                                </div>
                                <span className="text-gray-400 text-sm group-hover:text-blue-500 transition-colors">Adicionar empresa</span>
                            </div>
                        )}

                        {/* ADD COMPANY FORM */}
                        {!company && isAddingCompany && (
                            <div className="bg-white p-1 rounded animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center">
                                        <Plus size={16} className="text-gray-400" />
                                    </div>
                                    <input
                                        className="border-b border-blue-500 w-full text-sm p-1 focus:outline-none placeholder:text-gray-300"
                                        placeholder="Nome da empresa"
                                        autoFocus
                                        value={newCompanyName}
                                        onChange={e => setNewCompanyName(e.target.value)}
                                    />
                                </div>

                                <div className="pl-10 flex items-center gap-3 pt-2">
                                    <button
                                        onClick={handleCreateCompany}
                                        disabled={loadingField === 'create_company'}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded font-bold"
                                    >
                                        {loadingField === 'create_company' ? "Salvando..." : "Salvar"}
                                    </button>
                                    <button onClick={() => setIsAddingCompany(false)} className="text-xs text-gray-400 hover:text-red-500 underline decoration-dashed">cancelar</button>
                                </div>
                            </div>
                        )}

                        {company && (
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                    <Building size={16} className="text-gray-500" />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="font-bold text-gray-800 text-sm">{company.name}</h3>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">Empresa vinculada</span>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
