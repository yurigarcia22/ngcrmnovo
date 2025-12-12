"use client";
import { useEffect, useState, useRef } from "react";
import { sendMessage, sendMedia, getMessages } from "../app/actions";
import { createClient } from "@/utils/supabase/client";
import { Send, Paperclip, FileText, Download, StickyNote, CalendarCheck, Zap, Loader2, Smile, Mic } from "lucide-react";
import NotesPanel from "./NotesPanel";
import TasksPanel from "./TasksPanel";

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
        fetchMessages();
        fetchQuickReplies();

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
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            alert("Apenas imagens e PDFs são permitidos.");
            return;
        }

        const tempId = "temp-" + Date.now();
        const mediaType = file.type.startsWith('image/') ? 'image' : 'document';
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

    async function handleSendMessage() {
        if (!newMessage.trim() || !deal.contacts?.phone || isSending) return;
        const tempId = "temp-" + Date.now();
        const tempMessage = {
            id: tempId, content: newMessage, direction: 'outbound',
            created_at: new Date().toISOString(), type: 'text', status: 'sending'
        };

        setMessages((curr) => [...curr, tempMessage]);
        setNewMessage("");
        setIsSending(true);
        inputRef.current?.focus();
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            const result = await sendMessage(deal.contacts.phone, tempMessage.content, {
                dealId: deal.id, contactId: deal.contacts.id
            });
            if (!result.success) console.error("Message send failed:", result.error);
        } catch (error) {
            console.error("Error during message send:", error);
        } finally {
            setIsSending(false);
        }
    }

    function handleQuickReply(content: string) {
        setNewMessage(content);
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
                                        <div className="mb-1 min-w-[240px] flex items-center gap-2 pt-1">
                                            <audio controls className="w-full h-8">
                                                <source src={msg.media_url} type="audio/ogg; codecs=opus" />
                                                <source src={msg.media_url} type="audio/ogg" />
                                                <source src={msg.media_url} type="audio/mpeg" />
                                            </audio>
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
                                            <span className="text-blue-500">
                                                {/* Checks placeholder (would be double check if read) */}
                                                <svg viewBox="0 0 16 11" height="10" width="10" preserveAspectRatio="xMidYMid meet" className="" version="1.1" x="0px" y="0px" enableBackground="new 0 0 16 11"><path fill="currentColor" d="M11.55 0l1.2 1.2-7.55 7.55-4.2-4.2 1.2-1.2 3 3z"></path><path fill="currentColor" d="M15 1.2l-7.55 7.55-1.3-1.3-1.3 1.3 2.6 2.6 8.75-8.75z"></path></svg>
                                            </span>
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
                            accept="image/*,application/pdf"
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
        </div>
    );
}
