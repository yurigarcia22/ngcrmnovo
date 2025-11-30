"use client";
import { useEffect, useState, useRef } from "react";
import { updateDeal, updateContact, deleteDeal, sendMessage, sendMedia, markAsLost, recoverDeal, addTagToDeal, removeTagFromDeal } from "../app/actions";
import { createClient } from "@supabase/supabase-js";
import { X, Send, User, Phone, DollarSign, Calendar, Trash2, Save, Loader2, Paperclip, FileText, Download, StickyNote, CalendarCheck, Zap, ThumbsDown, RefreshCw, Tag as TagIcon, Plus } from "lucide-react";
import NotesPanel from "./NotesPanel";
import TasksPanel from "./TasksPanel";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DealModal({ isOpen, onClose, deal, onUpdate }: any) {
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [activePanel, setActivePanel] = useState<'none' | 'notes' | 'tasks'>('none');

    // Quick Replies State
    const [quickReplies, setQuickReplies] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
    const [categories, setCategories] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<any[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!deal?.id) return;

        async function fetchMessages() {
            const { data } = await supabase
                .from("messages")
                .select("*")
                .eq("deal_id", deal.id)
                .order("created_at", { ascending: true });
            if (data) setMessages(data);
        }

        async function fetchQuickReplies() {
            const { data } = await supabase
                .from("quick_replies")
                .select("*")
                .order("category", { ascending: true });

            if (data) {
                setQuickReplies(data);
                const uniqueCategories = Array.from(new Set(data.map(item => item.category))).filter(Boolean);
                setCategories(["Todos", ...uniqueCategories]);
            }
        }

        async function fetchTags() {
            const { data } = await supabase
                .from("tags")
                .select("*")
                .order("name");
            if (data) setAvailableTags(data);
        }

        fetchMessages();
        fetchQuickReplies();
        fetchTags();

        // Canal único para este Deal
        const channelName = `chat:${deal.id}`;
        console.log(`Iniciando conexão Realtime no canal: ${channelName}`);

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `deal_id=eq.${deal.id}`
                },
                (payload) => {
                    console.log("Nova mensagem recebida via Realtime:", payload.new);
                    setMessages((current) => {
                        // 1. Evita duplicidade exata de ID
                        if (current.find(m => m.id === payload.new.id)) {
                            return current;
                        }

                        // 2. Substituição de Optimistic UI (Mensagem enviada por mim)
                        if (payload.new.direction === 'outbound') {
                            const optimisticIndex = current.findIndex(m =>
                                m.status === 'sending' &&
                                m.content === payload.new.content &&
                                m.type === payload.new.type
                            );

                            if (optimisticIndex !== -1) {
                                console.log("Substituindo mensagem otimista:", current[optimisticIndex].id, "por", payload.new.id);
                                const newMessages = [...current];
                                newMessages[optimisticIndex] = payload.new;
                                return newMessages;
                            }
                        }

                        // 3. Nova mensagem real
                        return [...current, payload.new];
                    });
                }
            )
            .subscribe((status) => {
                console.log("Status da conexão Realtime:", status);
            });

        return () => {
            console.log("Desinscrevendo do canal:", channelName);
            supabase.removeChannel(channel);
        };
    }, [deal?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !deal.contacts?.phone) return;

        // Validação básica
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            alert("Apenas imagens e PDFs são permitidos.");
            return;
        }

        setIsSending(true);
        try {
            // Optimistic UI para Imagem
            if (file.type.startsWith('image/')) {
                const tempUrl = URL.createObjectURL(file);
                const tempMessage = {
                    id: Date.now(),
                    content: "", // Não mostrar nome do arquivo
                    direction: 'outbound',
                    created_at: new Date().toISOString(),
                    type: 'image',
                    media_url: tempUrl,
                    status: 'sending'
                };
                setMessages(prev => [...prev, tempMessage]);
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 100);
            } else {
                // Optimistic UI para Documento
                const tempMessage = {
                    id: Date.now(),
                    content: file.name,
                    direction: 'outbound',
                    created_at: new Date().toISOString(),
                    type: 'document',
                    media_url: "", // URL ainda não disponível
                    status: 'sending'
                };
                setMessages(prev => [...prev, tempMessage]);
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 100);
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('phone', deal.contacts.phone);
            formData.append('dealId', deal.id);
            formData.append('contactId', deal.contacts.id);

            const result = await sendMedia(formData);

            if (!result.success) {
                alert("Erro ao enviar arquivo: " + result.error);
            }

        } catch (error) {
            console.error("Erro no upload:", error);
            alert("Erro ao enviar arquivo.");
        } finally {
            setIsSending(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    async function handleSendMessage() {
        if (!newMessage.trim() || !deal.contacts?.phone) return;

        setIsSending(true);

        try {
            // 1. Optimistic UI: Adiciona mensagem temporária na tela
            const tempMessage = {
                id: Date.now(), // ID temporário
                content: newMessage,
                direction: 'outbound',
                created_at: new Date().toISOString(),
                type: 'text',
                status: 'sending'
            };

            setMessages((current) => [...current, tempMessage]);
            setNewMessage(""); // Limpa input na hora

            // Scroll para baixo
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);

            // 2. Enviar via Evolution API (Server Action)
            const result = await sendMessage(deal.contacts.phone, tempMessage.content, {
                dealId: deal.id,
                contactId: deal.contacts.id
            });

            if (!result.success) {
                alert("Erro ao enviar mensagem: " + result.error);
                // Opcional: Remover mensagem da lista ou marcar como erro
                return;
            }

            // Sucesso! A mensagem real virá pelo Realtime.

        } catch (error) {
            console.error("Erro no envio:", error);
            alert("Erro inesperado ao enviar mensagem.");
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

    if (!isOpen || !deal) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 w-full max-w-7xl h-[85vh] rounded-2xl border border-gray-700 shadow-2xl flex overflow-hidden transition-all duration-300">

                {/* LADO ESQUERDO: Detalhes do Lead (Editável) */}
                <div className="w-1/4 bg-gray-800 p-6 border-r border-gray-700 flex flex-col min-w-[300px]">
                    <div className="flex justify-between items-start mb-6">
                        <h2 className="text-xl font-bold text-white">Detalhes</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
                    </div>

                    <EditForm deal={deal} onClose={onClose} onUpdate={onUpdate} availableTags={availableTags} />
                </div>

                {/* AREA CENTRAL: Chat + Painel Lateral */}
                <div className="flex-1 flex bg-[#0b141a] relative overflow-hidden">

                    {/* CHAT (Flexível) */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Header do Chat */}
                        <div className="p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center shrink-0">
                            <span className="text-gray-300 text-sm">Conversa via WhatsApp</span>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActivePanel(activePanel === 'notes' ? 'none' : 'notes')}
                                    className={`p-2 rounded transition-colors ${activePanel === 'notes' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    title="Notas Internas"
                                >
                                    <StickyNote size={20} />
                                </button>
                                <button
                                    onClick={() => setActivePanel(activePanel === 'tasks' ? 'none' : 'tasks')}
                                    className={`p-2 rounded transition-colors ${activePanel === 'tasks' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                    title="Tarefas"
                                >
                                    <CalendarCheck size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Área das Mensagens */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed opacity-95">
                            {messages.length === 0 && (
                                <div className="text-center text-gray-500 mt-10">Nenhuma mensagem ainda.</div>
                            )}

                            {messages.map((msg) => {
                                const type = msg.type || msg.mediatype;
                                const isImage = type === 'image';
                                const isDoc = type === 'document' || type === 'pdf';
                                const isAudio = type === 'audio';

                                return (
                                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-lg shadow-md text-sm ${msg.direction === 'outbound'
                                            ? 'bg-[#005c4b] text-white rounded-tr-none' // Cor do Zap Enviada
                                            : 'bg-[#202c33] text-gray-100 rounded-tl-none' // Cor do Zap Recebida
                                            }`}>

                                            {isImage && (
                                                <div className="mb-2">
                                                    {msg.media_url ? (
                                                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                                                            <img
                                                                src={msg.media_url}
                                                                alt="Imagem recebida"
                                                                className="max-w-[280px] max-h-[300px] rounded-lg cursor-pointer hover:opacity-90 object-cover"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                                            />
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-gray-400 italic text-xs p-2 bg-black/20 rounded">
                                                            <Loader2 size={12} className="animate-spin" /> Carregando imagem...
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {isDoc && (
                                                <div className="mb-2">
                                                    <a
                                                        href={msg.media_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-3 bg-black/20 p-3 rounded-lg hover:bg-black/30 transition-colors group"
                                                    >
                                                        <div className="bg-red-500/20 p-2 rounded-full group-hover:bg-red-500/30 transition-colors">
                                                            <FileText size={20} className="text-red-400" />
                                                        </div>
                                                        <div className="flex flex-col overflow-hidden">
                                                            <span className="text-sm font-medium truncate text-gray-200">
                                                                {msg.content || "Abrir Documento"}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400 uppercase">PDF</span>
                                                        </div>
                                                    </a>
                                                </div>
                                            )}

                                            {isAudio && (
                                                <div className="mb-2 min-w-[250px] flex items-center gap-2">
                                                    <audio controls className="w-full">
                                                        <source src={msg.media_url} type="audio/ogg; codecs=opus" />
                                                        <source src={msg.media_url} type="audio/ogg" />
                                                        <source src={msg.media_url} type="audio/mpeg" />
                                                        Seu navegador não suporta áudio.
                                                    </audio>
                                                    <a
                                                        href={msg.media_url}
                                                        download={`audio-${msg.id}.ogg`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors"
                                                        title="Baixar Áudio"
                                                    >
                                                        <Download size={16} />
                                                    </a>
                                                </div>
                                            )}

                                            {!isImage && !isDoc && !isAudio && (
                                                <p>{msg.content}</p>
                                            )}

                                            <span className="text-[10px] opacity-60 flex justify-end mt-1">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-gray-800 border-t border-gray-700 flex gap-2 items-center shrink-0">
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
                                className="text-gray-400 hover:text-white p-2 transition-colors disabled:opacity-50"
                                title="Anexar arquivo"
                            >
                                <Paperclip size={20} />
                            </button>
                            <input
                                ref={inputRef}
                                type="text"
                                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Digite uma mensagem..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={isSending}
                                className="bg-green-600 hover:bg-green-500 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={20} />}
                            </button>
                        </div>

                        {/* Quick Replies Bar */}
                        {quickReplies.length > 0 && (
                            <div className="bg-gray-800 border-t border-gray-700 p-2 flex flex-col gap-2 shrink-0">
                                {/* Categorias */}
                                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedCategory(cat)}
                                            className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${selectedCategory === cat
                                                ? 'bg-blue-600 text-white font-medium'
                                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                                                }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Chips */}
                                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                    {filteredReplies.map(reply => (
                                        <button
                                            key={reply.id}
                                            onClick={() => handleQuickReply(reply.content)}
                                            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded-lg border border-gray-600 hover:border-gray-500 whitespace-nowrap transition-all flex items-center gap-1 group"
                                            title={reply.content}
                                        >
                                            <Zap size={12} className="text-yellow-500 group-hover:text-yellow-400" />
                                            {reply.shortcut || reply.content.substring(0, 15) + "..."}
                                        </button>
                                    ))}
                                    {filteredReplies.length === 0 && (
                                        <span className="text-xs text-gray-500 italic px-2">Nenhuma resposta nesta categoria.</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* PAINEL LATERAL (Condicional) */}
                    {activePanel === 'notes' && (
                        <div className="w-80 border-l border-gray-700 bg-gray-800 p-4 flex flex-col shrink-0 transition-all duration-300">
                            <NotesPanel dealId={deal.id} onClose={() => setActivePanel('none')} />
                        </div>
                    )}

                    {activePanel === 'tasks' && (
                        <div className="w-80 border-l border-gray-700 bg-gray-800 p-4 flex flex-col shrink-0 transition-all duration-300">
                            <TasksPanel dealId={deal.id} onClose={() => setActivePanel('none')} />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}


function EditForm({ deal, onClose, onUpdate, availableTags }: { deal: any, onClose: () => void, onUpdate?: () => void, availableTags: any[] }) {
    const [name, setName] = useState(deal.contacts?.name || "");
    const [phone, setPhone] = useState(deal.contacts?.phone || "");
    const [value, setValue] = useState(deal.value || 0);
    const [loading, setLoading] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Loss State
    const [isLossMode, setIsLossMode] = useState(false);
    const [lossReason, setLossReason] = useState("Preço Alto");
    const [lossDetails, setLossDetails] = useState("");

    const [isAddingTag, setIsAddingTag] = useState(false);

    // Optimistic Tags State
    const [localTags, setLocalTags] = useState<any[]>(deal.deal_tags || []);

    // Detecta mudanças
    useEffect(() => {
        const isChanged =
            name !== deal.contacts?.name ||
            phone !== deal.contacts?.phone ||
            Number(value) !== Number(deal.value);
        setHasChanges(isChanged);
    }, [name, phone, value, deal]);

    // Sincroniza tags locais quando o deal muda (ex: refresh do pai)
    useEffect(() => {
        setLocalTags(deal.deal_tags || []);
    }, [deal.deal_tags]);

    async function handleSave() {
        // Fallback robusto para encontrar o ID do contato
        const contactId = deal.contacts?.id || deal.contact_id;

        console.log("handleSave called", {
            name,
            phone,
            value,
            dealId: deal.id,
            contactIdFound: contactId
        });

        setLoading(true);
        try {
            // Atualiza Contato
            if (name !== deal.contacts?.name || phone !== deal.contacts?.phone) {
                if (!contactId) {
                    alert("Erro: ID do contato não encontrado. Não é possível salvar as alterações do contato.");
                    setLoading(false);
                    return;
                }

                console.log("Updating contact...", { id: contactId, name, phone });
                await updateContact(contactId, { name, phone });
            }
            // Atualiza Deal
            if (Number(value) !== Number(deal.value)) {
                console.log("Updating deal...", { id: deal.id, value: Number(value) });
                await updateDeal(deal.id, { value: Number(value) });
            }
            alert("Salvo com sucesso!");
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Pequeno delay para garantir propagação
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
        if (!confirm("Tem certeza que deseja excluir este lead? Essa ação não pode ser desfeita.")) return;

        console.log("handleDelete called", deal.id);
        setLoading(true);
        try {
            await deleteDeal(deal.id);
            onClose();
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onUpdate();
            }
        } catch (error) {
            console.error("Error in handleDelete:", error);
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
            console.error("Error in handleMarkAsLost:", error);
            alert("Erro ao marcar como perdido");
            setLoading(false);
        }
    }

    async function handleRecover() {
        if (!confirm("Deseja recuperar este lead e reabri-lo?")) return;

        setLoading(true);
        try {
            await recoverDeal(deal.id);
            onClose();
            if (onUpdate) {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onUpdate();
            }
        } catch (error) {
            console.error("Error in handleRecover:", error);
            alert("Erro ao recuperar lead");
            setLoading(false);
        }
    }

    async function handleAddTag(tagId: string) {
        setIsAddingTag(false);

        // 1. Optimistic Update
        const tagToAdd = availableTags.find(t => t.id === tagId);
        if (tagToAdd) {
            const newTagEntry = {
                id: `temp-${Date.now()}`, // ID temporário
                tags: tagToAdd
            };
            setLocalTags(prev => [...prev, newTagEntry]);
        }

        try {
            await addTagToDeal(deal.id, tagId);
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error("Erro ao adicionar tag:", error);
            alert("Erro ao adicionar tag");
            // Rollback se falhar
            setLocalTags(deal.deal_tags || []);
        }
    }

    async function handleRemoveTag(tagId: string) {
        if (!confirm("Remover esta tag?")) return;

        // 1. Optimistic Update
        setLocalTags(prev => prev.filter(dt => dt.tags?.id !== tagId));

        try {
            await removeTagFromDeal(deal.id, tagId);
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error("Erro ao remover tag:", error);
            alert("Erro ao remover tag");
            // Rollback
            setLocalTags(deal.deal_tags || []);
        }
    }

    if (isLossMode) {
        return (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex items-center gap-2 mb-6 text-red-400">
                    <button
                        onClick={() => setIsLossMode(false)}
                        className="p-1 hover:bg-red-900/20 rounded-full transition-colors"
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
                        <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Motivo da Perda</label>
                        <div className="relative">
                            <select
                                value={lossReason}
                                onChange={e => setLossReason(e.target.value)}
                                className="w-full appearance-none bg-gray-700/50 text-white p-3 pr-10 rounded-lg border border-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all cursor-pointer"
                            >
                                <option value="Preço Alto">Preço Alto</option>
                                <option value="Concorrência">Concorrência</option>
                                <option value="Sem Interesse">Sem Interesse</option>
                                <option value="Contato Inválido">Contato Inválido</option>
                                <option value="Outro">Outro</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Detalhes (Opcional)</label>
                        <textarea
                            value={lossDetails}
                            onChange={e => setLossDetails(e.target.value)}
                            rows={5}
                            className="w-full bg-gray-700/50 text-white p-3 rounded-lg border border-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all resize-none placeholder-gray-500"
                            placeholder="Descreva o que aconteceu para perdermos este negócio..."
                        />
                    </div>
                </div>

                <div className="mt-auto pt-6 border-t border-gray-700">
                    <button
                        onClick={handleMarkAsLost}
                        disabled={loading}
                        className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg font-medium transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <ThumbsDown size={20} />}
                        Confirmar Perda
                    </button>
                    <button
                        onClick={() => setIsLossMode(false)}
                        className="w-full mt-3 text-gray-400 hover:text-white text-sm py-2 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="space-y-4 flex-1">
                {/* Nome */}
                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold">Nome do Cliente</label>
                    <div className="flex items-center gap-2 mt-1 bg-gray-700/50 p-2 rounded border border-transparent focus-within:border-blue-500 transition-colors">
                        <User size={16} className="text-gray-400" />
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="bg-transparent text-white w-full focus:outline-none text-sm"
                        />
                    </div>
                </div>

                {/* Telefone */}
                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold">WhatsApp</label>
                    <div className="flex items-center gap-2 mt-1 bg-gray-700/50 p-2 rounded border border-transparent focus-within:border-blue-500 transition-colors">
                        <Phone size={16} className="text-gray-400" />
                        <input
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            className="bg-transparent text-white w-full focus:outline-none text-sm"
                        />
                    </div>
                </div>

                {/* Valor */}
                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold">Valor (R$)</label>
                    <div className="flex items-center gap-2 mt-1 bg-gray-700/50 p-2 rounded border border-transparent focus-within:border-blue-500 transition-colors">
                        <DollarSign size={16} className="text-gray-400" />
                        <input
                            type="number"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            className="bg-transparent text-white w-full focus:outline-none text-sm"
                        />
                    </div>
                </div>

                {/* Tags */}
                <div>
                    <label className="text-xs text-gray-400 uppercase font-bold flex justify-between items-center">
                        Etiquetas
                        <button
                            onClick={() => setIsAddingTag(!isAddingTag)}
                            className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/20 transition-colors"
                            title="Adicionar Tag"
                        >
                            <Plus size={14} />
                        </button>
                    </label>

                    {isAddingTag && (
                        <div className="mt-2 mb-2 animate-in fade-in slide-in-from-top-2">
                            <select
                                className="w-full bg-gray-700 text-white p-2 rounded text-sm border border-gray-600 focus:border-blue-500 outline-none"
                                onChange={(e) => {
                                    if (e.target.value) handleAddTag(e.target.value);
                                }}
                                defaultValue=""
                            >
                                <option value="" disabled>Selecione uma tag...</option>
                                {availableTags
                                    .filter(t => !localTags.some((dt: any) => dt.tags?.id === t.id))
                                    .map(tag => (
                                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                                    ))}
                            </select>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                        {localTags.map((dt: any) => (
                            <span
                                key={dt.id || dt.tags.id}
                                className="text-xs px-2 py-1 rounded-full text-white font-medium flex items-center gap-1 group cursor-pointer hover:opacity-80 transition-opacity"
                                style={{ backgroundColor: dt.tags?.color || '#666' }}
                                onClick={() => handleRemoveTag(dt.tags?.id)}
                                title="Clique para remover"
                            >
                                {dt.tags?.name}
                                <X size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                        ))}
                        {(!localTags || localTags.length === 0) && !isAddingTag && (
                            <span className="text-xs text-gray-500 italic">Sem etiquetas</span>
                        )}
                    </div>
                </div>

                {/* Info de Perda (Se perdido) */}
                {deal.status === 'lost' && (
                    <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg">
                        <h4 className="text-red-400 font-bold text-sm flex items-center gap-2 mb-2">
                            <ThumbsDown size={14} />
                            Lead Perdido
                        </h4>
                        <p className="text-xs text-gray-300 mb-1"><span className="text-gray-500">Motivo:</span> {deal.lost_reason}</p>
                        {deal.lost_details && (
                            <p className="text-xs text-gray-300"><span className="text-gray-500">Detalhes:</span> {deal.lost_details}</p>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="mt-auto pt-6 flex flex-col gap-4 border-t border-gray-700">
                <div className="flex items-center justify-between">
                    <button
                        onClick={handleDelete}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-2 rounded transition-colors"
                        title="Excluir Lead"
                    >
                        <Trash2 size={20} />
                    </button>

                    {hasChanges && (
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded flex items-center gap-2 font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            Salvar Alterações
                        </button>
                    )}
                </div>

                {deal.status === 'lost' ? (
                    <button
                        onClick={handleRecover}
                        disabled={loading}
                        className="w-full group border border-green-600 hover:bg-green-600/10 text-green-500 hover:text-green-400 py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />}
                        Recuperar Lead
                    </button>
                ) : (
                    <button
                        onClick={() => setIsLossMode(true)}
                        className="w-full group border border-gray-700 hover:border-red-500/50 text-gray-400 hover:text-red-400 hover:bg-red-900/10 py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
                    >
                        <ThumbsDown size={16} className="group-hover:scale-110 transition-transform" />
                        Marcar como Perdido
                    </button>
                )}
            </div>
        </div>
    );
}
