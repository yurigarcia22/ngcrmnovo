"use client";
import { useEffect, useState, useRef } from "react";
import { sendMessage, sendMedia, getMessages, getConversationNumberInfo, transcribeMessageAudio } from "../app/actions";
import { createClient } from "@/utils/supabase/client";
import { Send, Paperclip, FileText, Download, StickyNote, CalendarCheck, Zap, Loader2, Smile, Mic, Check, CheckCheck, Clock } from "lucide-react";
import NotesPanel from "./NotesPanel";
import TasksPanel from "./TasksPanel";
import { toast } from "@/lib/toast";

interface ChatWindowProps {
    deal: any;
    theme?: 'light' | 'dark'; // Kept for interface compat, but implementation forces light
}

export default function ChatWindow({ deal, theme }: ChatWindowProps) {
    const supabase = createClient();
    const [messages, setMessages] = useState<any[]>(() => {
        if (!Array.isArray(deal?.messages)) return [];
        return [...deal.messages].sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
    });
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [activePanel, setActivePanel] = useState<'none' | 'notes' | 'tasks'>('none');
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Numero (instancia) da conversa: qual fala com o lead, qual foi o primeiro,
    // e a confirmacao quando o numero que vai responder diverge.
    const [numberInfo, setNumberInfo] = useState<any>(null);
    const [pendingConfirm, setPendingConfirm] = useState<{ text: string; current: any; wouldUse: any } | null>(null);
    const [transcribingId, setTranscribingId] = useState<string | null>(null);

    async function handleTranscribe(msg: any) {
        setTranscribingId(msg.id);
        try {
            const res = await transcribeMessageAudio(msg.id);
            if (res.success) {
                setMessages(curr => curr.map(m => m.id === msg.id ? { ...m, transcription: res.data } : m));
            } else {
                toast.error(res.error || "Falha ao transcrever");
            }
        } finally {
            setTranscribingId(null);
        }
    }

    // Quick Replies State
    const [quickReplies, setQuickReplies] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
    const [categories, setCategories] = useState<string[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!deal?.id) return;
        async function fetchMessages() {
            const result = await getMessages(deal.id);
            if (result.success && result.data) {
                setMessages(result.data);
            }
        }
        async function fetchQuickReplies() {
            const { data } = await supabase
                .from("quick_replies")
                .select("*")
                .order("category", { ascending: true });

            if (data) {
                setQuickReplies(data);
                const uniqueCategories = Array.from(new Set(data.map((item: any) => item.category))).filter(Boolean);
                setCategories(["Todos", ...uniqueCategories]);
            }
        }
        async function fetchNumberInfo() {
            const r = await getConversationNumberInfo(deal.id);
            if (r.success) setNumberInfo(r.data);
        }
        fetchMessages();
        fetchQuickReplies();
        fetchNumberInfo();

        const channelName = `chat:${deal.id}`;
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload: any) => {
                    if (payload.new.deal_id !== deal.id) return;
                    setMessages((current) => {
                        if (current.find(m => m.id === payload.new.id)) return current;
                        if (payload.new.direction === 'outbound') {
                            const optimisticIndex = current.findIndex(m =>
                                m.status === 'sending' &&
                                m.content === payload.new.content &&
                                m.type === payload.new.type
                            );
                            if (optimisticIndex !== -1) {
                                const newMessages = [...current];
                                newMessages[optimisticIndex] = payload.new;
                                return newMessages;
                            }
                        }
                        return [...current, payload.new];
                    });
                    // Mensagem nova pode mudar qual numero esta falando com o lead.
                    if (payload.new.direction === 'inbound') {
                        getConversationNumberInfo(deal.id).then(r => { if (r.success) setNumberInfo(r.data); });
                    }
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [deal?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, activePanel]);

    async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !deal.contacts?.phone) return;
        if (file.size > 60 * 1024 * 1024) {
            toast.warning("Arquivo muito grande (máximo 60MB)");
            return;
        }

        const tempId = "temp-" + Date.now();
        const mediaType = file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : 'document';
        const tempMessage = {
            id: tempId, content: file.name, direction: 'outbound', status: 'sending',
            created_at: new Date().toISOString(), type: mediaType, media_url: URL.createObjectURL(file)
        };

        setMessages(curr => [...curr, tempMessage]);
        setIsSending(true);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('phone', deal.contacts.phone);
            formData.append('dealId', deal.id);
            formData.append('contactId', deal.contacts.id || deal.contact_id);
            const result = await sendMedia(formData);
            if (!result.success) setMessages(curr => curr.filter(m => m.id !== tempId));
        } catch (error) {
            setMessages(curr => curr.filter(m => m.id !== tempId));
        } finally {
            setIsSending(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function doSend(text: string, force: boolean) {
        const tempId = "temp-" + Date.now();
        const tempMessage = {
            id: tempId, content: text, direction: 'outbound',
            created_at: new Date().toISOString(), type: 'text', status: 'sending'
        };

        setMessages((curr) => [...curr, tempMessage]);
        setIsSending(true);
        inputRef.current?.focus();
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            const result: any = await sendMessage(deal.contacts.phone, text, {
                dealId: deal.id, contactId: deal.contacts.id
            }, { force });

            if (result?.needsConfirmation) {
                // Numero diverge do que ja falava com o lead: remove o otimista e confirma.
                setMessages((curr) => curr.filter(m => m.id !== tempId));
                setPendingConfirm({ text, current: result.current, wouldUse: result.wouldUse });
                return;
            }
            if (!result?.success) {
                setMessages((curr) => curr.filter(m => m.id !== tempId));
                toast.error(result?.error || "Falha ao enviar mensagem");
                return;
            }
            // Sucesso: atualiza qual numero esta falando com o lead.
            getConversationNumberInfo(deal.id).then(r => { if (r.success) setNumberInfo(r.data); });
        } catch (error) {
            setMessages((curr) => curr.filter(m => m.id !== tempId));
            console.error("Error during message send:", error);
        } finally {
            setIsSending(false);
        }
    }

    function handleSendMessage() {
        if (!newMessage.trim() || !deal.contacts?.phone || isSending) return;
        const text = newMessage;
        setNewMessage("");
        doSend(text, false);
    }

    /**
     * Substitui variaveis no formato {{chave}} pelos valores do deal/contact.
     * Variaveis suportadas: nome, primeiro_nome, telefone, email, empresa,
     * valor, valor_extenso, titulo_deal, vendedor.
     */
    function renderTemplate(template: string): string {
        const contact = deal?.contacts ?? {};
        const ownerName = deal?.owner?.full_name ?? "";
        const firstName = (contact.name ?? "").split(" ")[0];
        const valorNum = Number(deal?.value ?? 0);
        const valorFmt = valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        const vars: Record<string, string> = {
            nome: contact.name ?? "",
            primeiro_nome: firstName,
            telefone: contact.phone ?? "",
            email: contact.email ?? "",
            empresa: deal?.companies?.name ?? contact.company ?? "",
            valor: valorFmt,
            titulo_deal: deal?.title ?? "",
            vendedor: ownerName,
        };

        return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => {
            const k = key.toLowerCase();
            return vars[k] !== undefined ? vars[k] : match;
        });
    }

    function handleQuickReply(content: string) {
        setNewMessage(renderTemplate(content));
        inputRef.current?.focus();
    }

    const filteredReplies = selectedCategory === "Todos"
        ? quickReplies
        : quickReplies.filter(qr => qr.category === selectedCategory);

    return (
        <div className="flex-1 flex relative overflow-hidden h-full bg-[#efeae2]">
            {/* CHAT MAIN AREA */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Header (Simplified for Context) */}
                <div className="p-4 bg-[#f0f2f5] border-b border-gray-200 flex justify-between items-center shrink-0 shadow-sm z-10">
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-800">{deal.contacts?.name || "Cliente"}</span>
                        <span className="text-xs text-gray-500">{deal.contacts?.phone}</span>
                        {numberInfo?.current && (
                            <span className={`text-[11px] mt-0.5 inline-flex items-center gap-1 ${numberInfo.diverges ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                                Falando via {numberInfo.current.label}
                                {numberInfo.first && numberInfo.first.instance_name !== numberInfo.current.instance_name && (
                                    <span className="text-gray-400">· 1º contato: {numberInfo.first.label}</span>
                                )}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setActivePanel(activePanel === 'notes' ? 'none' : 'notes')}
                            className={`p-2 rounded-full transition-all ${activePanel === 'notes' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                            title="Notas Internas"
                        >
                            <StickyNote size={20} />
                        </button>
                        <button
                            onClick={() => setActivePanel(activePanel === 'tasks' ? 'none' : 'tasks')}
                            className={`p-2 rounded-full transition-all ${activePanel === 'tasks' ? 'bg-green-100 text-green-600' : 'text-gray-500 hover:bg-gray-200'}`}
                            title="Tarefas"
                        >
                            <CalendarCheck size={20} />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="flex justify-center mt-10">
                            <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm text-xs text-gray-500 uppercase tracking-wide">
                                Início da conversa
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => {
                        const type = msg.type || msg.mediatype;
                        const isImage = type === 'image';
                        const isDoc = type === 'document' || type === 'pdf';
                        const isAudio = type === 'audio';
                        const isOutbound = msg.direction === 'outbound';

                        // LIGHT MODE BUBBLE STYLES
                        const bubbleClass = isOutbound
                            ? 'bg-[#d9fdd3] text-gray-900 rounded-br-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]' // WhatsApp Green
                            : 'bg-white text-gray-900 rounded-bl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]'; // White

                        return (
                            <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[70%] p-2 rounded-lg text-sm relative group ${bubbleClass}`}>

                                    {isImage && (
                                        <div className="mb-1 rounded-lg overflow-hidden bg-gray-100">
                                            {msg.media_url ? (
                                                <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                                                    <img
                                                        src={msg.media_url}
                                                        alt="Imagem"
                                                        className="max-w-full max-h-[300px] object-cover hover:opacity-95 transition-opacity cursor-pointer"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                                    />
                                                </a>
                                            ) : (
                                                <div className="flex items-center gap-2 text-gray-500 italic text-xs p-4 justify-center">
                                                    <Loader2 size={16} className="animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isDoc && (
                                        <div className="mb-1">
                                            <a
                                                href={msg.media_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-black/5"
                                            >
                                                <div className="bg-red-100 p-2 rounded-full text-red-500">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className="text-sm font-medium text-gray-800 truncate">
                                                        {msg.content || "Documento"}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold">PDF</span>
                                                </div>
                                            </a>
                                        </div>
                                    )}

                                    {isAudio && (
                                        <div className="mb-1 min-w-[240px] pt-1">
                                            <audio controls className="w-full h-8">
                                                <source src={msg.media_url} type="audio/ogg; codecs=opus" />
                                                <source src={msg.media_url} type="audio/ogg" />
                                                <source src={msg.media_url} type="audio/mpeg" />
                                            </audio>
                                            {msg.transcription ? (
                                                <p className="px-1 pt-2 mt-1 text-[13px] text-gray-600 italic border-t border-black/5">
                                                    {msg.transcription}
                                                </p>
                                            ) : (
                                                <button
                                                    onClick={() => handleTranscribe(msg)}
                                                    disabled={transcribingId === msg.id}
                                                    className="mt-1.5 text-[11px] text-blue-600 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                    {transcribingId === msg.id
                                                        ? <><Loader2 size={11} className="animate-spin" /> Transcrevendo...</>
                                                        : "Transcrever áudio"}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {!isImage && !isDoc && !isAudio && (
                                        <p className="px-1 pt-1 pb-0 leading-relaxed text-[15px]">{msg.content}</p>
                                    )}

                                    <div className="flex justify-end items-center gap-1 mt-0.5 select-none">
                                        <span className={`text-[10px] ${isOutbound ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {isOutbound && (
                                            msg.status === 'read' ? (
                                                <span title="Lida"><CheckCheck size={14} className="text-blue-500" /></span>
                                            ) : msg.status === 'delivered' ? (
                                                <span title="Entregue"><CheckCheck size={14} className="text-gray-400" /></span>
                                            ) : msg.status === 'sending' ? (
                                                <span title="Enviando"><Clock size={11} className="text-gray-300" /></span>
                                            ) : (
                                                <span title="Enviada"><Check size={14} className="text-gray-400" /></span>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Floating Input Area */}
                <div className="p-4 pt-1 bg-transparent flex flex-col gap-2 shrink-0 z-20">

                    {/* White Input Bar */}
                    <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex items-end gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                            onChange={handleFileSelect}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSending}
                            className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            title="Anexar"
                        >
                            <Paperclip size={24} strokeWidth={1.5} />
                        </button>

                        <div className="flex-1 bg-gray-50 rounded-lg border border-transparent focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all flex items-center">
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full bg-transparent px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none"
                                placeholder="Digite uma mensagem ou / para ver comandos..."
                                value={newMessage}
                                onChange={(e) => {
                                    setNewMessage(e.target.value);
                                    if (e.target.value === '/') setShowShortcuts(true);
                                    else if (showShortcuts && e.target.value === '') setShowShortcuts(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSendMessage();
                                    if (e.key === 'Escape') setShowShortcuts(false);
                                }}
                            />
                            {/* Optional: Emoji Button inside input */}
                            <button className="p-2 mr-1 text-gray-400 hover:text-yellow-500 transition-colors">
                                <Smile size={20} />
                            </button>
                        </div>

                        {newMessage.trim() || isSending ? (
                            <button
                                onClick={handleSendMessage}
                                disabled={isSending}
                                className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none hover:scale-105 active:scale-95"
                            >
                                {isSending ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                            </button>
                        ) : (
                            <button
                                className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            >
                                <Mic size={24} strokeWidth={1.5} />
                            </button>
                        )}
                    </div>

                    {/* Quick Replies (Chips moved below) */}
                    {quickReplies.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {/* Row 1: Categories (Groups) */}
                            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar px-1">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-sm ${selectedCategory === cat
                                            ? 'bg-blue-600 text-white font-bold'
                                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Row 2: Messages */}
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar px-1">
                                {filteredReplies.map((reply: any) => (
                                    <button
                                        key={reply.id}
                                        onClick={() => handleQuickReply(reply.content)}
                                        className="text-xs px-3 py-1.5 rounded-full bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all flex items-center gap-1 whitespace-nowrap"
                                        title={reply.content}
                                    >
                                        <Zap size={10} className="text-yellow-500" />
                                        {reply.shortcut}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="text-[10px] text-gray-400 text-center font-medium">
                        Pressione Enter para enviar
                    </div>
                </div>
            </div>

            {/* PAINEL LATERAL (Theme Light Forced) */}
            {activePanel === 'notes' && (
                <div className="w-80 border-l p-4 flex flex-col shrink-0 transition-all duration-300 bg-white border-gray-200">
                    <NotesPanel dealId={deal.id} onClose={() => setActivePanel('none')} theme="light" />
                </div>
            )}
            {activePanel === 'tasks' && (
                <div className="w-80 border-l p-4 flex flex-col shrink-0 transition-all duration-300 bg-white border-gray-200">
                    <TasksPanel dealId={deal.id} onClose={() => setActivePanel('none')} />
                </div>
            )}

            {/* Confirmacao: numero que vai responder diverge do que falava com o lead */}
            {pendingConfirm && (
                <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base">Responder por outro número?</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            Este lead estava conversando com <b className="text-gray-900">{pendingConfirm.current?.label}</b>.
                            Você vai responder pelo <b className="text-gray-900">{pendingConfirm.wouldUse?.label}</b>.
                            Trocar de número pode confundir o lead.
                        </p>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => { setNewMessage(pendingConfirm.text); setPendingConfirm(null); }}
                                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { const t = pendingConfirm.text; setPendingConfirm(null); doSend(t, true); }}
                                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                            >
                                Responder mesmo assim
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
