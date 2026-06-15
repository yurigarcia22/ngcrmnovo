"use client";
import { useEffect, useState, useRef, Fragment } from "react";
import { sendMessage, sendMedia, getMessages, getConversationNumberInfo, transcribeMessageAudio, importWhatsappHistory } from "../app/actions";
import { createClient } from "@/utils/supabase/client";
import { Send, Paperclip, FileText, Download, StickyNote, CalendarCheck, Zap, Loader2, Mic, Check, CheckCheck, Clock, ChevronDown, Trash2, AlertCircle, RotateCw, ImageOff, History } from "lucide-react";
import NotesPanel from "./NotesPanel";
import TasksPanel from "./TasksPanel";
import { toast } from "@/lib/toast";

interface ChatWindowProps {
    deal: any;
    theme?: 'light' | 'dark'; // Kept for interface compat, but implementation forces light
}

// Preserva quebras de linha (via whitespace-pre-wrap no parent) e transforma
// URLs em links clicaveis. Sem isso, mensagens multi-linha colapsavam numa
// unica linha e links longos quebravam o bubble.
function renderMessageContent(text: string | null | undefined) {
    if (!text) return null;
    const urlRegex = /(https?:\/\/\S+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
            return (
                <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-blue-700 hover:text-blue-800 break-all"
                >
                    {part}
                </a>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

// Separador de data estilo WhatsApp (Hoje / Ontem / 12 de junho [de 2025]).
function formatDayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hoje";
    if (d.toDateString() === yest.toDateString()) return "Ontem";
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long" };
    if (d.getFullYear() !== today.getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString("pt-BR", opts);
}

// Label do documento a partir da extensao do nome (antes era "PDF" fixo).
function docLabel(filename?: string): string {
    const ext = (filename?.split(".").pop() || "").toUpperCase();
    return ext && ext.length >= 2 && ext.length <= 5 ? ext : "ARQUIVO";
}

// Imagem do chat com fallback visivel quando a URL quebra (em vez de sumir).
function ChatImage({ src }: { src: string }) {
    const [err, setErr] = useState(false);
    if (err) {
        return (
            <div className="flex items-center gap-2 text-gray-400 text-xs p-4 justify-center">
                <ImageOff size={16} /> Imagem indisponível
            </div>
        );
    }
    return (
        <a href={src} target="_blank" rel="noopener noreferrer">
            <img
                src={src}
                alt="Imagem da conversa"
                className="max-w-full max-h-[300px] object-cover hover:opacity-95 transition-opacity cursor-pointer"
                onError={() => setErr(true)}
                loading="lazy"
            />
        </a>
    );
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
    const [pendingMediaConfirm, setPendingMediaConfirm] = useState<{ file: File; current: any; wouldUse: any } | null>(null);
    const [transcribingId, setTranscribingId] = useState<string | null>(null);

    const [importingHistory, setImportingHistory] = useState(false);

    async function handleImportHistory() {
        if (importingHistory || !deal?.contacts?.phone) return;
        setImportingHistory(true);
        try {
            const res = await importWhatsappHistory(deal.id, deal.contacts.phone);
            if (res.success) {
                if ((res.imported ?? 0) > 0) {
                    toast.success(`${res.imported} mensagem(ns) do WhatsApp importada(s)`);
                    const r = await getMessages(deal.id);
                    if (r.success && r.data) setMessages(r.data);
                } else {
                    toast.info("Nenhuma mensagem nova encontrada no WhatsApp");
                }
            } else {
                toast.error(res.error || "Falha ao importar histórico");
            }
        } finally {
            setImportingHistory(false);
        }
    }

    // Gravacao de audio (nota de voz)
    const [isRecording, setIsRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordChunksRef = useRef<Blob[]>([]);
    const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordCancelledRef = useRef(false);

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
    // Painel minimizavel; preferencia persiste entre conversas/sessoes.
    const [showQuickReplies, setShowQuickReplies] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem("crm:showQuickReplies") === "1";
    });
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem("crm:showQuickReplies", showQuickReplies ? "1" : "0");
    }, [showQuickReplies]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Rola pro fim so se o usuario JA estava perto do fim (igual WhatsApp Web):
    // se ele subiu pra reler o historico, uma msg nova nao arrasta a tela.
    function scrollToBottomIfNear(force = false) {
        const c = scrollContainerRef.current;
        if (!c) { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); return; }
        const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 160;
        if (force || nearBottom) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }

    useEffect(() => {
        if (!deal?.id) return;
        async function fetchMessages() {
            const result = await getMessages(deal.id);
            if (result.success && result.data) {
                setMessages((curr) => {
                    // Merge: mantem otimistas pendentes (enviando ou que falharam) e
                    // injeta os dados do servidor. Otimistas ja persistidos saem.
                    const optimistic = curr.filter((m: any) =>
                        (m.status === 'sending' || m.status === 'failed') && String(m.id).startsWith('temp-'));
                    const serverContentKeys = new Set((result.data as any[]).map((m: any) => `${m.direction}|${m.type}|${m.content}`));
                    const stillOptimistic = optimistic.filter((m: any) =>
                        m.status === 'failed' || !serverContentKeys.has(`${m.direction}|${m.type}|${m.content}`));
                    return [...(result.data as any[]), ...stillOptimistic];
                });
            }
        }
        // Refetch periodico como rede de seguranca caso o realtime perca eventos.
        const pollId = setInterval(fetchMessages, 15_000);
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
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `deal_id=eq.${deal.id}` },
                (payload: any) => {
                    if (payload.new.deal_id !== deal.id) return;
                    setMessages((current) => {
                        // Ja existe a row real -> nada a fazer (evita duplicata poll x realtime).
                        if (current.find(m => m.id === payload.new.id)) return current;
                        if (payload.new.direction === 'outbound') {
                            // Reconcilia a bolha otimista: casa por evolution_message_id
                            // (preciso) ou, como fallback, por content+type.
                            const optimisticIndex = current.findIndex(m =>
                                String(m.id).startsWith('temp-') &&
                                ((m.evolution_message_id && m.evolution_message_id === payload.new.evolution_message_id) ||
                                 (m.content === payload.new.content && m.type === payload.new.type))
                            );
                            if (optimisticIndex !== -1) {
                                const newMessages = [...current];
                                const old = newMessages[optimisticIndex];
                                // Libera o blob do preview otimista pra nao vazar memoria.
                                if (old?.media_url && String(old.media_url).startsWith('blob:')) {
                                    try { URL.revokeObjectURL(old.media_url); } catch { /* noop */ }
                                }
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
            .on('postgres_changes',
                // Status de entrega/leitura muda via UPDATE (webhook). Sem este handler,
                // os checkmarks so atualizavam no poll de 15s.
                { event: 'UPDATE', schema: 'public', table: 'messages', filter: `deal_id=eq.${deal.id}` },
                (payload: any) => {
                    if (payload.new.deal_id !== deal.id) return;
                    setMessages((current) => current.map(m =>
                        m.id === payload.new.id ? { ...m, ...payload.new } : m));
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollId);
        };
    }, [deal?.id]);

    useEffect(() => {
        scrollToBottomIfNear();
    }, [messages]);

    // Auto-resize do textarea conforme o usuario digita (ate o max-h do CSS).
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    }, [newMessage]);

    async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = "";
        await sendFileMessage(file);
    }

    // Envia um arquivo (anexo ou audio gravado) com bolha otimista, reconciliacao
    // por id real e estado de erro visivel (toast + bolha "falhou").
    async function sendFileMessage(file: File | undefined | null, force = false) {
        if (!file || !deal.contacts?.phone) return;
        if (file.size > 45 * 1024 * 1024) {
            toast.warning("Arquivo muito grande (máximo 45MB)");
            return;
        }

        const tempId = "temp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
        const mediaType = file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : file.type.startsWith('audio/') ? 'audio'
            : 'document';
        const blobUrl = URL.createObjectURL(file);
        const tempMessage = {
            id: tempId, content: mediaType === 'audio' ? '' : file.name, direction: 'outbound', status: 'sending',
            created_at: new Date().toISOString(), type: mediaType, media_url: blobUrl,
        };

        setMessages(curr => [...curr, tempMessage]);
        setIsSending(true);
        setTimeout(() => scrollToBottomIfNear(true), 100);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('phone', deal.contacts.phone);
            formData.append('dealId', deal.id);
            formData.append('contactId', deal.contacts.id || deal.contact_id);
            if (force) formData.append('force', 'true');
            const result: any = await sendMedia(formData);

            if (result?.needsConfirmation) {
                setMessages(curr => curr.filter(m => m.id !== tempId));
                try { URL.revokeObjectURL(blobUrl); } catch { /* noop */ }
                setPendingMediaConfirm({ file, current: result.current, wouldUse: result.wouldUse });
                return;
            }
            if (!result?.success) {
                // Marca a bolha como falha (com retry) em vez de sumir sem aviso.
                setMessages(curr => curr.map(m => m.id === tempId ? { ...m, status: 'failed', _retryFile: file } : m));
                toast.error(result?.error || "Falha ao enviar arquivo");
                return;
            }
            // Sucesso: troca a bolha otimista pela row real (id do banco) e libera o blob.
            if (result.messageId) {
                setMessages(curr => curr.map(m => m.id === tempId
                    ? { ...m, id: result.messageId, status: 'sent', evolution_message_id: result.evolutionMessageId ?? null }
                    : m));
                try { URL.revokeObjectURL(blobUrl); } catch { /* noop */ }
            }
        } catch (error: any) {
            setMessages(curr => curr.map(m => m.id === tempId ? { ...m, status: 'failed', _retryFile: file } : m));
            toast.error(error?.message || "Falha ao enviar arquivo");
        } finally {
            setIsSending(false);
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
                // Marca como falha (com retry) em vez de sumir sem aviso.
                setMessages((curr) => curr.map(m => m.id === tempId ? { ...m, status: 'failed', _retryText: text } : m));
                toast.error(result?.error || "Falha ao enviar mensagem");
                return;
            }
            // Sucesso: troca a bolha otimista pela row real (id do banco) p/ reconciliar.
            if (result.messageId) {
                setMessages((curr) => curr.map(m => m.id === tempId
                    ? { ...m, id: result.messageId, status: 'sent', evolution_message_id: result.evolutionMessageId ?? null }
                    : m));
            }
            // Atualiza qual numero esta falando com o lead.
            getConversationNumberInfo(deal.id).then(r => { if (r.success) setNumberInfo(r.data); });
        } catch (error: any) {
            setMessages((curr) => curr.map(m => m.id === tempId ? { ...m, status: 'failed', _retryText: text } : m));
            toast.error(error?.message || "Falha ao enviar mensagem");
            console.error("Error during message send:", error);
        } finally {
            setIsSending(false);
        }
    }

    // Reenvia uma mensagem/arquivo que falhou (remove a bolha de falha e tenta de novo).
    function retryFailed(msg: any) {
        setMessages(curr => curr.filter(m => m.id !== msg.id));
        if (msg._retryFile) { sendFileMessage(msg._retryFile, true); return; }
        if (msg._retryText) { doSend(msg._retryText, true); return; }
    }

    function handleSendMessage() {
        if (!newMessage.trim() || !deal.contacts?.phone || isSending) return;
        const text = newMessage;
        setNewMessage("");
        doSend(text, false);
    }

    // ---- Gravacao de audio (nota de voz, estilo WhatsApp) ----
    async function startRecording() {
        if (isRecording || isSending) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Escolhe um mimeType que o navegador suporte (ogg/opus de preferencia).
            const preferred = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
            const mimeType = preferred.find(t => (window as any).MediaRecorder?.isTypeSupported?.(t)) || '';
            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recordChunksRef.current = [];
            recordCancelledRef.current = false;
            mr.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
                setIsRecording(false);
                const cancelled = recordCancelledRef.current;
                setRecordSeconds(0);
                if (cancelled) return;
                const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || 'audio/ogg' });
                if (blob.size < 1000) { toast.warning("Áudio muito curto"); return; }
                const ext = (mr.mimeType || 'audio/ogg').includes('webm') ? 'webm'
                    : (mr.mimeType || '').includes('mp4') ? 'mp4' : 'ogg';
                const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
                await sendFileMessage(file);
            };
            mediaRecorderRef.current = mr;
            mr.start();
            setIsRecording(true);
            setRecordSeconds(0);
            recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
        } catch {
            toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
        }
    }

    function stopRecording(cancel = false) {
        recordCancelledRef.current = cancel;
        const mr = mediaRecorderRef.current;
        if (mr && mr.state !== 'inactive') mr.stop();
    }

    // Limpa gravacao ao desmontar / trocar de conversa.
    useEffect(() => {
        return () => {
            if (recordTimerRef.current) clearInterval(recordTimerRef.current);
            const mr = mediaRecorderRef.current;
            if (mr && mr.state !== 'inactive') { recordCancelledRef.current = true; mr.stop(); }
        };
    }, [deal?.id]);

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
                            onClick={handleImportHistory}
                            disabled={importingHistory}
                            className="p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-all disabled:opacity-50"
                            title="Importar histórico do WhatsApp"
                        >
                            {importingHistory ? <Loader2 size={20} className="animate-spin" /> : <History size={20} />}
                        </button>
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
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-1.5 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="flex justify-center mt-10">
                            <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm text-xs text-gray-500 uppercase tracking-wide">
                                Início da conversa
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => {
                        const type = msg.type || msg.mediatype;
                        const isImage = type === 'image';
                        const isVideo = type === 'video';
                        const isDoc = type === 'document' || type === 'pdf' || type === 'file';
                        const isAudio = type === 'audio';
                        const isOutbound = msg.direction === 'outbound';
                        const isFailed = msg.status === 'failed';

                        // Separador de data quando muda o dia em relacao a msg anterior.
                        const prev = messages[idx - 1];
                        const showDay = !prev ||
                            new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();

                        const bubbleClass = isFailed
                            ? 'bg-rose-50 text-gray-900 rounded-br-none border border-rose-200'
                            : isOutbound
                                ? 'bg-[#d9fdd3] text-gray-900 rounded-br-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]'
                                : 'bg-white text-gray-900 rounded-bl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]';

                        return (
                            <Fragment key={msg.id}>
                                {showDay && (
                                    <div className="flex justify-center my-3">
                                        <span className="bg-white/90 text-gray-500 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm uppercase tracking-wide">
                                            {formatDayLabel(msg.created_at)}
                                        </span>
                                    </div>
                                )}
                                <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] p-2 rounded-lg text-sm relative group ${bubbleClass}`}>

                                        {isImage && (
                                            <div className="mb-1 rounded-lg overflow-hidden bg-gray-100">
                                                {msg.media_url ? (
                                                    <ChatImage src={msg.media_url} />
                                                ) : msg.status === 'sending' ? (
                                                    <div className="flex items-center gap-2 text-gray-500 italic text-xs p-4 justify-center">
                                                        <Loader2 size={16} className="animate-spin" />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-400 text-xs p-4 justify-center">
                                                        <ImageOff size={16} /> Imagem indisponível
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isVideo && (
                                            <div className="mb-1 rounded-lg overflow-hidden bg-black/5">
                                                {msg.media_url ? (
                                                    <video
                                                        controls
                                                        preload="metadata"
                                                        src={msg.media_url}
                                                        className="max-w-full max-h-[320px] rounded-lg"
                                                    />
                                                ) : msg.status === 'sending' ? (
                                                    <div className="flex items-center gap-2 text-gray-500 italic text-xs p-4 justify-center">
                                                        <Loader2 size={16} className="animate-spin" />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-400 text-xs p-4 justify-center">
                                                        <ImageOff size={16} /> Vídeo indisponível
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isDoc && (
                                            <div className="mb-1">
                                                {msg.media_url ? (
                                                    <a
                                                        href={msg.media_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-black/5"
                                                    >
                                                        <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                                            <FileText size={20} />
                                                        </div>
                                                        <div className="flex flex-col overflow-hidden">
                                                            <span className="text-sm font-medium text-gray-800 truncate">
                                                                {msg.content || "Documento"}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400 uppercase font-bold">{docLabel(msg.content)}</span>
                                                        </div>
                                                        <Download size={16} className="text-gray-400 ml-auto shrink-0" />
                                                    </a>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-500 italic text-xs p-3">
                                                        <FileText size={16} /> {msg.content || "Documento indisponível"}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isAudio && (
                                            <div className="mb-1 min-w-[240px] pt-1">
                                                {msg.media_url ? (
                                                    <>
                                                        <audio controls className="w-full h-8">
                                                            <source src={msg.media_url} type="audio/ogg; codecs=opus" />
                                                            <source src={msg.media_url} type="audio/ogg" />
                                                            <source src={msg.media_url} type="audio/webm" />
                                                            <source src={msg.media_url} type="audio/mpeg" />
                                                        </audio>
                                                        {msg.transcription ? (
                                                            <p className="px-1 pt-2 mt-1 text-[13px] text-gray-600 italic border-t border-black/5 whitespace-pre-wrap break-words">
                                                                {msg.transcription}
                                                            </p>
                                                        ) : !isOutbound && (
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
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-500 italic text-xs p-2">
                                                        <Mic size={14} /> Áudio indisponível
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {!isImage && !isVideo && !isDoc && !isAudio && (
                                            <p className="px-1 pt-1 pb-0 leading-relaxed text-[15px] whitespace-pre-wrap break-words">
                                                {renderMessageContent(msg.content)}
                                            </p>
                                        )}

                                        <div className="flex justify-end items-center gap-1 mt-0.5 select-none">
                                            {isFailed && (
                                                <button
                                                    onClick={() => retryFailed(msg)}
                                                    className="text-rose-600 hover:text-rose-700 inline-flex items-center gap-0.5 text-[10px] font-semibold mr-1"
                                                    title="Reenviar"
                                                >
                                                    <RotateCw size={11} /> tentar de novo
                                                </button>
                                            )}
                                            <span className={`text-[10px] ${isOutbound ? 'text-gray-500' : 'text-gray-400'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {isOutbound && (
                                                isFailed ? (
                                                    <span title="Falha ao enviar"><AlertCircle size={13} className="text-rose-500" /></span>
                                                ) : msg.status === 'read' ? (
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
                            </Fragment>
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
                            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                            onChange={handleFileSelect}
                        />

                        {isRecording ? (
                            /* Barra de gravacao de audio */
                            <div className="flex-1 flex items-center justify-between gap-3 px-2 py-1.5">
                                <button
                                    onClick={() => stopRecording(true)}
                                    title="Cancelar gravação"
                                    aria-label="Cancelar gravação"
                                    className="p-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
                                >
                                    <Trash2 size={22} />
                                </button>
                                <div className="flex items-center gap-2 text-rose-600 font-medium">
                                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                                    <span className="tabular-nums">{Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</span>
                                    <span className="text-gray-400 text-xs font-normal">Gravando áudio...</span>
                                </div>
                                <button
                                    onClick={() => stopRecording(false)}
                                    title="Enviar áudio"
                                    aria-label="Enviar áudio"
                                    className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95"
                                >
                                    <Send size={22} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isSending}
                                    className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
                                    title="Anexar"
                                    aria-label="Anexar arquivo"
                                >
                                    <Paperclip size={24} strokeWidth={1.5} />
                                </button>

                                <div className="flex-1 bg-gray-50 rounded-lg border border-transparent focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all flex items-end">
                                    <textarea
                                        ref={inputRef}
                                        rows={1}
                                        className="w-full bg-transparent px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none resize-none max-h-[140px] overflow-y-auto leading-relaxed custom-scrollbar"
                                        placeholder="Digite uma mensagem ou / para ver comandos..."
                                        value={newMessage}
                                        onChange={(e) => {
                                            setNewMessage(e.target.value);
                                            if (e.target.value === '/') setShowShortcuts(true);
                                            else if (showShortcuts && e.target.value === '') setShowShortcuts(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                            if (e.key === 'Escape') setShowShortcuts(false);
                                        }}
                                    />
                                </div>

                                {newMessage.trim() || isSending ? (
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={isSending}
                                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none hover:scale-105 active:scale-95"
                                        aria-label="Enviar mensagem"
                                    >
                                        {isSending ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                                    </button>
                                ) : (
                                    <button
                                        onClick={startRecording}
                                        className="p-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Gravar áudio"
                                        aria-label="Gravar áudio"
                                    >
                                        <Mic size={24} strokeWidth={1.5} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Quick Replies (Chips moved below) */}
                    {quickReplies.length > 0 && (
                        <div className="mt-2">
                            <button
                                onClick={() => setShowQuickReplies(v => !v)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                                title={showQuickReplies ? "Ocultar respostas rápidas" : "Mostrar respostas rápidas"}
                            >
                                <Zap size={11} className="text-yellow-500" />
                                Respostas rápidas
                                <ChevronDown
                                    size={14}
                                    className={`transition-transform ${showQuickReplies ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {showQuickReplies && (
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
                        </div>
                    )}

                    <div className="text-[10px] text-gray-400 text-center font-medium">
                        Enter envia · Shift+Enter quebra linha
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

            {/* Confirmacao de divergencia de numero ao enviar ANEXO/AUDIO */}
            {pendingMediaConfirm && (
                <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base">Enviar arquivo por outro número?</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            Este lead estava conversando com <b className="text-gray-900">{pendingMediaConfirm.current?.label}</b>.
                            Você vai enviar pelo <b className="text-gray-900">{pendingMediaConfirm.wouldUse?.label}</b>.
                        </p>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setPendingMediaConfirm(null)}
                                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { const f = pendingMediaConfirm.file; setPendingMediaConfirm(null); sendFileMessage(f, true); }}
                                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                            >
                                Enviar mesmo assim
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
