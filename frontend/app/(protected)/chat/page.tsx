"use client";
import React, { useState, useEffect } from 'react';
import { getConversations, getTeamMembers } from '@/app/actions';
import ChatWindow from '@/components/ChatWindow';
import { createClient } from '@/utils/supabase/client';
import { Search, MessageSquare, User, Tag, Calendar, ChevronRight, Filter } from 'lucide-react';

export default function ChatPage() {
    const [conversations, setConversations] = useState<any[]>([]);
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    // Suppress unused warning if relevant, assuming createClient is used
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [supabase] = useState(() => createClient()); // Initialize directly

    // Filter State
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [filterOwner, setFilterOwner] = useState<string>("all");

    useEffect(() => {
        async function fetchTeam() {
            const res = await getTeamMembers();
            if (res.success && res.data) {
                setTeamMembers(res.data);
            }
        }
        fetchTeam();
    }, []);

    // Debounce search + Filter effect
    useEffect(() => {
        const timer = setTimeout(() => {
            loadConversations();
        }, 300);
        return () => clearTimeout(timer);
    }, [search, filterOwner]);

    // Realtime Subscription
    useEffect(() => {
        console.log("Subscribing to global messages for list updates...");

        const channel = supabase
            .channel('chat_list_updates')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload: any) => {
                    console.log("[ChatList] New message received!", payload.new);
                    // Refresh conversations to update order and snippets
                    // Ideally optimization: update local state instead of full fetch
                    loadConversations();
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'deals' },
                (payload: any) => {
                    console.log("[ChatList] Deal updated!", payload.new);
                    loadConversations();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [search, filterOwner]); // Re-subscribe if filters change? Actually loadConversations depends on them.

    async function loadConversations() {
        // setLoading(true); // Don't show loading spinner on background updates
        const res = await getConversations(search, filterOwner);
        if (res.success && res.data) {
            setConversations(res.data);
        } else {
            console.error("Failed to load conversations in background");
        }
        setLoading(false);
    }

    function formatTime(dateString: string) {
        if (!dateString) return "";
        const date = new Date(dateString);
        const now = new Date();
        const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden text-gray-800 font-sans">
            {/* LADO ESQUERDO: Lista de Conversas (Light Theme: White bg, gray borders) */}
            <div className="w-[400px] border-r border-gray-200 flex flex-col bg-white transition-all">
                {/* Header */}
                <div className="h-16 px-4 bg-gray-50 flex items-center justify-between shrink-0 border-b border-gray-200">
                    <h1 className="text-xl font-bold text-gray-700">Conversas</h1>
                    <div className="flex gap-3 text-gray-500">
                        <MessageSquare className="cursor-pointer hover:text-blue-600 transition-colors" />
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="p-3 bg-white border-b border-gray-100 space-y-3">
                    {/* Owner Filter */}
                    <div className="relative">
                        <select
                            value={filterOwner}
                            onChange={(e) => setFilterOwner(e.target.value)}
                            className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none cursor-pointer transition-all"
                        >
                            <option value="all">Todas as Conversas</option>
                            {teamMembers.map(member => (
                                <option key={member.id} value={member.id}>
                                    {member.full_name}
                                </option>
                            ))}
                        </select>
                        <Filter size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                    </div>

                    {/* Search Bar */}
                    <div className="bg-gray-50 rounded-lg flex items-center px-3 py-1.5 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-blue-400 transition-all">
                        <Search size={18} className="text-gray-400 mr-3" />
                        <input
                            className="bg-transparent border-none text-gray-700 w-full focus:outline-none placeholder-gray-400 text-sm py-1"
                            placeholder="Pesquisar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading && conversations.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm animate-pulse">Carregando conversas...</div>
                    ) : (
                        conversations.map(conv => {
                            const active = selectedDeal?.id === conv.id;
                            const personName = conv.contacts?.name || conv.title || "Desconhecido";
                            const lastMsgTime = formatTime(conv.last_message?.created_at || conv.updated_at);
                            const lastMsgContent = conv.last_message?.content || (conv.last_message?.type === 'image' ? '📸 Imagem' : 'Nenhuma mensagem');

                            return (
                                <div
                                    key={conv.id}
                                    onClick={() => setSelectedDeal(conv)}
                                    className={`flex items-center gap-3 p-3 px-4 cursor-pointer transition-all border-b border-gray-50 group hover:bg-gray-50 ${active ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                                >
                                    <div className="relative shrink-0">
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 ring-2 ring-transparent group-hover:ring-blue-100 transition-all">
                                            {conv.contacts?.profile_pic_url ? (
                                                <img src={conv.contacts.profile_pic_url} className="w-full h-full object-cover" alt="Avatar" />
                                            ) : (
                                                <div className="flex items-center justify-center w-full h-full text-gray-400">
                                                    <User size={24} />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className={`font-medium text-base truncate transition-colors ${active ? 'text-blue-700' : 'text-gray-800'}`}>{personName}</span>
                                            <span className={`text-xs ${active ? 'text-blue-600' : 'text-gray-400'}`}>{lastMsgTime}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className={`text-sm truncate transition-colors ${active ? 'text-blue-600/80' : 'text-gray-500 group-hover:text-gray-600'}`}>
                                                {lastMsgContent}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    {!loading && conversations.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            Nenhum contato encontrado.
                        </div>
                    )}
                </div>
            </div>

            {/* CENTRO: Janela de Chat */}
            <div className="flex-1 bg-[#efeae2] relative flex flex-col min-w-[500px] border-r border-gray-200 pattern-isometric pattern-gray-100 pattern-bg-white pattern-size-4 pattern-opacity-10">
                {/* Note: Keeping ChatWindow properly encapsulated, may need style tweaks inside it if we want FULL white theme, 
                    but usually Chat Window simulates WhatsApp which IS dark or specific colors. 
                    The user asked for "White", so I changed the surrounding containers. 
                    If ChatWindow itself needs to be white, that's a change inside ChatWindow. 
                    Assuming "make it white" refers to the Page Layout initially. */}
                {selectedDeal ? (
                    <div className="flex-1 flex flex-col h-full bg-[#efeae2] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed">
                        <ChatWindow deal={selectedDeal} theme="light" />
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-6 bg-gray-50">
                        <div className="relative p-6 bg-white rounded-full shadow-sm">
                            <MessageSquare size={64} className="text-gray-300" />
                            <div className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                        </div>
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-light text-gray-600">Selecione uma conversa</h2>
                            <p className="text-sm text-gray-500">Escolha um contato na lista para iniciar o atendimento.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* DIREITA: Detalhes do Lead */}
            {selectedDeal && (
                <div className="w-[350px] bg-white border-l border-gray-200 flex flex-col animate-in slide-in-from-right-10 duration-200 shadow-xl z-10">
                    <div className="h-16 px-6 bg-gray-50 flex items-center shrink-0 border-b border-gray-200">
                        <span className="text-gray-700 font-medium">Dados do Contato</span>
                    </div>

                    <div className="p-8 flex flex-col items-center border-b border-gray-100 bg-white">
                        <div className="w-32 h-32 rounded-full overflow-hidden mb-4 ring-4 ring-gray-50 shadow-inner">
                            {selectedDeal.contacts?.profile_pic_url ? (
                                <img src={selectedDeal.contacts.profile_pic_url} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                    <User size={48} className="text-gray-300" />
                                </div>
                            )}
                        </div>
                        <h2 className="text-xl text-gray-800 font-semibold text-center">{selectedDeal.contacts?.name || "Sem Nome"}</h2>
                        <p className="text-gray-500 text-lg mt-1 font-light">{selectedDeal.contacts?.phone}</p>
                    </div>

                    <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">

                        <div className="space-y-2">
                            <label className="text-xs text-blue-600 uppercase font-bold tracking-wider mb-2 block px-1">Negócio</label>

                            <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg shadow-sm text-gray-400"><Tag size={16} /></div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-400">Título</span>
                                        <span className="text-gray-700 font-medium text-sm">{selectedDeal.title}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg shadow-sm text-gray-400"><span className="font-bold text-xs">R$</span></div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-400">Valor</span>
                                        <span className="text-gray-700 font-medium text-sm">{Number(selectedDeal.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg shadow-sm text-gray-400"><Calendar size={16} /></div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-400">Data</span>
                                        <span className="text-gray-700 font-medium text-sm">{new Date(selectedDeal.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6">
                            <button className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors text-sm font-medium border border-red-100">
                                <Tag size={16} />
                                Gerenciar Etiquetas
                            </button>
                        </div>

                        {/* Details place holder */}
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h4 className="text-blue-800 text-sm font-medium mb-1">Nota Rápida</h4>
                            <p className="text-blue-600 text-xs">Este contato está interessado no plano anual. Ligar novamente amanhã.</p>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
