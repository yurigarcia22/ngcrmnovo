"use client";

import { useState, useEffect } from "react";
import { Loader2, Send, MessageSquare, FileText, Activity, Pin, PinOff } from "lucide-react";
import { addNote, sendMessage, toggleMessagePin } from "@/app/actions";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";

// Types
type TimelineItem = {
    id: string;
    type: 'note' | 'message' | 'system';
    content: string;
    created_at: string;
    isTemp?: boolean;
    sender?: any;
    body?: string;
    direction?: string; // 'outbound' or 'inbound'
    pinned?: boolean;
};

interface DealTimelineProps {
    dealId: string;
    initialNotes: any[];
    initialMessages: any[];
    contactPhone?: string;
    contactId?: string;
}

export default function DealTimeline({ dealId, initialNotes = [], initialMessages = [], contactPhone, contactId }: DealTimelineProps) {
    const supabase = createClient();

    // Merge and Normalize Data
    const normalizeNotes = (notes: any[]): TimelineItem[] => notes.map(n => ({
        id: n.id, // Ensure ID is string
        type: n.content.startsWith('[SYSTEM]') ? 'system' : 'note',
        content: n.content.replace('[SYSTEM] ', ''),
        created_at: n.created_at,
        sender: n.profiles // Assuming profiles is joined
    }));

    const normalizeMessages = (msgs: any[]): TimelineItem[] => msgs.map(m => ({
        id: m.id,
        type: 'message',
        content: m.body || m.content,
        created_at: m.created_at,
        sender: m.sender,
        direction: m.direction, // outbound (me) vs inbound (client)
        pinned: m.pinned ?? false,
    }));

    const [items, setItems] = useState<TimelineItem[]>([
        ...normalizeNotes(initialNotes),
        ...normalizeMessages(initialMessages)
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())); // Newest first

    async function handleTogglePin(item: TimelineItem) {
        const next = !item.pinned;
        // Optimistic
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, pinned: next } : i));
        const res = await toggleMessagePin(item.id, next);
        if (!res.success) {
            // Rollback
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, pinned: !next } : i));
            toast.error("Erro ao fixar mensagem");
        } else {
            toast.success(next ? "Mensagem fixada" : "Mensagem desafixada");
        }
    }

    // Mensagens fixadas (para destaque no topo)
    const pinnedMessages = items.filter(i => i.type === 'message' && i.pinned);

    const [newContent, setNewContent] = useState("");
    const [inputType, setInputType] = useState<'note' | 'message'>('note');
    const [saving, setSaving] = useState(false);

    // --- REALTIME SUBSCRIPTION ---
    useEffect(() => {
        const channel = supabase
            .channel(`deal_messages_${dealId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `deal_id=eq.${dealId}`
                },
                (payload) => {
                    const newMsg = payload.new as any;
                    // Avoid duplicate if optimistic update already added it (check ID or content overlap?)
                    // Realtime ID is UUID, Optimistic ID is temp-timestamp.
                    // We can just add it and filter out temp ones if we want, or just prepend.

                    const newItem: TimelineItem = {
                        id: newMsg.id,
                        type: 'message',
                        content: newMsg.body || newMsg.content,
                        created_at: newMsg.created_at,
                        direction: newMsg.direction
                    };

                    setItems(prev => {
                        // 1) Deduplica por ID real
                        if (prev.some(i => i.id === newItem.id)) return prev;

                        // 2) Substitui item OPTIMISTIC (temp-...) que bate por
                        //    content + direction + janela de tempo (10s).
                        //    Evita duplicacao quando voce envia uma msg: o temp
                        //    item entrou primeiro, agora o real chega via realtime.
                        const matchingTempIdx = prev.findIndex(i =>
                            i.isTemp === true &&
                            i.direction === newItem.direction &&
                            i.content === newItem.content &&
                            Math.abs(new Date(i.created_at).getTime() - new Date(newItem.created_at).getTime()) < 10000
                        );

                        let next: TimelineItem[];
                        if (matchingTempIdx >= 0) {
                            // Substitui temp pelo real (mantem posicao na lista)
                            next = [...prev];
                            next[matchingTempIdx] = newItem;
                        } else {
                            next = [newItem, ...prev];
                        }

                        return next.sort((a, b) =>
                            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        );
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [dealId, supabase]);


    async function handleSend() {
        if (!newContent.trim()) return;
        setSaving(true);

        // Optimistic Item
        const tempItem: TimelineItem = {
            id: `temp-${Date.now()}`,
            type: inputType,
            content: newContent,
            created_at: new Date().toISOString(),
            isTemp: true,
            direction: 'outbound' // Assume sent by us
        };

        // Add optimistic item
        setItems(prev => [tempItem, ...prev]);

        // Action
        let res;
        if (inputType === 'note') {
            res = await addNote(dealId, newContent);
        } else {
            if (!contactPhone || !contactId) {
                toast.error("Este negocio nao tem um contato com telefone vinculado");
                setItems(prev => prev.filter(i => i.id !== tempItem.id));
                setSaving(false);
                return;
            }
            res = await sendMessage(contactPhone, newContent, { dealId, contactId });
        }

        if (res.success) {
            setNewContent("");
            // If success, we keep temp item until Realtime replaces it or we refresh.
            // Ideally we'd replace temp ID with real ID if action returned it.
            // For now, duplicate handling in Realtime won't catch temp ID, so we might have duplicates until refresh
            // or we filter out temp items when real ones come in (complex to match).
            // Let's rely on Realtime adding the real one.
        } else {
            toast.error("Erro ao enviar", res.error || "Erro desconhecido");
            setItems(prev => prev.filter(i => i.id !== tempItem.id));
        }
        setSaving(false);
    }

    // Filter Items based on active tab
    const visibleItems = items.filter(item => {
        if (inputType === 'note') return item.type === 'note' || item.type === 'system';
        if (inputType === 'message') return item.type === 'message';
        return true;
    });

    return (
        <div className="flex flex-col h-full bg-[#fcfcfc] relative">

            {/* PINNED MESSAGES BAR — Mostra so se houver mensagens fixadas */}
            {inputType === 'message' && pinnedMessages.length > 0 && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 shrink-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Pin size={12} className="text-amber-700 fill-amber-700" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                            {pinnedMessages.length} mensage{pinnedMessages.length > 1 ? "ns" : "m"} fixada{pinnedMessages.length > 1 ? "s" : ""}
                        </span>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                        {pinnedMessages.map((p) => (
                            <div key={`pin-${p.id}`} className="flex items-start gap-2 text-xs text-amber-900 group">
                                <span className="text-amber-700 shrink-0">{p.direction === 'outbound' ? "↗" : "↙"}</span>
                                <span className="flex-1 truncate">{p.content}</span>
                                <button
                                    onClick={() => handleTogglePin(p)}
                                    className="opacity-0 group-hover:opacity-100 text-amber-600 hover:text-amber-800 shrink-0"
                                    title="Desfixar"
                                >
                                    <PinOff size={11} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TIMELINE BODY */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar flex flex-col-reverse">

                {visibleItems.length === 0 && (
                    <div className="text-center text-gray-300 text-sm py-10">
                        {inputType === 'note' ? "Nenhuma nota ou histórico." : "Nenhuma mensagem."}
                    </div>
                )}

                {visibleItems.map((item) => (
                    <div key={item.id} className={`flex flex-col gap-1 w-full animate-in fade-in slide-in-from-bottom-2 ${item.type === 'system' ? 'items-center my-2' :
                            item.type === 'message' ? (item.direction === 'outbound' ? 'items-end' : 'items-start') : 'items-end'
                        }`}>

                        {/* SYSTEM EVENT */}
                        {item.type === 'system' && (
                            <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold tracking-wide">
                                <Activity size={10} />
                                <span>{item.content}</span>
                                <span className="opacity-50">• {new Date(item.created_at).toLocaleString('pt-BR')}</span>
                            </div>
                        )}

                        {/* NOTE (User Internal) */}
                        {item.type === 'note' && (
                            <div className="max-w-[85%] flex flex-col items-end">
                                <div className="flex items-center gap-2 mb-1 px-1">
                                    <span className="text-[10px] text-gray-400 font-medium">
                                        {new Date(item.created_at).toLocaleString('pt-BR')} {item.isTemp && "..."}
                                    </span>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                        <FileText size={10} /> Nota Interna
                                    </div>
                                </div>
                                <div className="bg-[#fff9c4] text-gray-800 p-3 rounded-t-xl rounded-bl-xl shadow-sm border border-[#f0eeb0] text-sm whitespace-pre-wrap">
                                    {item.content}
                                </div>
                            </div>
                        )}

                        {/* MESSAGE (External) */}
                        {item.type === 'message' && (
                            <div className={`group max-w-[85%] flex flex-col ${item.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-center gap-2 mb-1 px-1">
                                    {item.direction !== 'outbound' && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-blue-500">
                                            <MessageSquare size={10} /> Client
                                        </div>
                                    )}
                                    <span className="text-[10px] text-gray-400 font-medium">
                                        {new Date(item.created_at).toLocaleString('pt-BR')}
                                    </span>
                                    {item.direction === 'outbound' && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                            Você
                                        </div>
                                    )}
                                </div>
                                <div className={`relative ${item.direction === 'outbound' ? 'bg-[#dcf8c6] border-green-200' : 'bg-white border-gray-200'} text-gray-800 p-3 rounded-xl shadow-sm border text-sm whitespace-pre-wrap ${item.direction === 'outbound' ? 'rounded-br-none' : 'rounded-bl-none'} ${item.pinned ? 'ring-2 ring-amber-300' : ''}`}>
                                    {item.content}
                                    {/* Botao pin (hover) */}
                                    {!item.isTemp && (
                                        <button
                                            onClick={() => handleTogglePin(item)}
                                            className={`absolute ${item.direction === 'outbound' ? '-left-7' : '-right-7'} top-1 transition-opacity ${item.pinned ? 'opacity-100 text-amber-600' : 'opacity-0 group-hover:opacity-70 text-gray-400 hover:text-amber-600'}`}
                                            title={item.pinned ? "Desfixar mensagem" : "Fixar mensagem"}
                                        >
                                            <Pin size={14} className={item.pinned ? 'fill-amber-500 text-amber-500' : ''} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                ))}
            </div>

            {/* FOOTER INPUT */}
            <div className="bg-white border-t border-gray-200 p-4 sticky bottom-0 z-10 w-full">
                <div className="flex gap-4 mb-2 px-1">
                    <button
                        onClick={() => setInputType('note')}
                        className={`text-xs font-bold pb-1 transition-colors ${inputType === 'note' ? 'text-black border-b-2 border-yellow-400' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Nota Interna
                    </button>
                    <button
                        onClick={() => setInputType('message')}
                        className={`text-xs font-bold pb-1 transition-colors ${inputType === 'message' ? 'text-blue-600 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Bate-papo (WhatsApp)
                    </button>
                </div>

                <div className="relative">
                    <textarea
                        value={newContent}
                        onChange={e => setNewContent(e.target.value)}
                        placeholder={inputType === 'note' ? "Escreva uma observação interna..." : "Escreva uma mensagem para o cliente..."}
                        className={`w-full border rounded-lg p-3 pr-12 text-sm focus:outline-none focus:ring-2 min-h-[80px] resize-none ${inputType === 'note' ? 'bg-yellow-50/30 border-yellow-200 focus:border-yellow-400 focus:ring-yellow-100' : 'bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-100'
                            }`}
                    />
                    <button
                        onClick={handleSend}
                        disabled={saving || !newContent.trim()}
                        className={`absolute bottom-3 right-3 p-2 text-white rounded-full transition-colors shadow-sm disabled:opacity-50 ${inputType === 'note' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
