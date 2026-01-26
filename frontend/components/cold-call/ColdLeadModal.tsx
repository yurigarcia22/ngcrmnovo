"use client";
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Textarea, Badge } from "@/components/ui/simple-ui";
import { ColdLead } from "@/types/cold-lead";
import { toast } from "sonner";
import { Phone, CheckCircle, XCircle, Calendar, X, Clock, Target, Trash2, Pencil, MapPin, Globe, MessageCircle, GitPullRequest, Check, Send } from "lucide-react";
import { addColdLeadNote, getColdLeadNotes, createTask, updateColdLeadNote } from "@/app/actions";

interface ColdLeadModalProps {
    lead: ColdLead;
    isOpen: boolean;
    onClose: () => void;
    teamMembers: any[];
    onNext?: () => void;
    hasNext?: boolean;
    onActionComplete: (updatedLead: ColdLead) => void;
}

export function ColdLeadModal({ lead, isOpen, onClose, teamMembers, onNext, hasNext, onActionComplete }: ColdLeadModalProps) {
    const [currentNote, setCurrentNote] = useState("");
    const [notesHistory, setNotesHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isMeetingMode, setIsMeetingMode] = useState(false);
    const [meetingDate, setMeetingDate] = useState("");

    // Pipelines for meeting
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [selectedPipeline, setSelectedPipeline] = useState("");
    const [stages, setStages] = useState<any[]>([]);
    const [selectedStage, setSelectedStage] = useState("");

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        nome: lead.nome || "",
        nicho: lead.nicho || "",
        telefone: lead.telefone || "",
        responsavel_id: lead.responsavel_id || "",
        site_url: lead.site_url || "",
        instagram_url: lead.instagram_url || "",
        google_meu_negocio_url: lead.google_meu_negocio_url || ""
    });



    // Notes Edit State
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

    function startEditing(note: any) {
        setEditingNoteId(note.id);
        setEditContent(note.content);
    }

    function cancelEditing() {
        setEditingNoteId(null);
        setEditContent("");
    }

    async function handleUpdateNote(id: string) {
        if (!editContent.trim()) return;
        setLoading(true);
        const res = await updateColdLeadNote(id, editContent);
        if (res.success) {
            toast.success("Nota atualizada");
            fetchNotes();
            setEditingNoteId(null);
        } else {
            toast.error("Erro ao atualizar nota");
        }
        setLoading(false);
    }

    const notesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setCurrentNote("");
            setIsMeetingMode(false);
            setMeetingDate("");
            setIsEditing(false);
            setEditForm({
                nome: lead.nome || "",
                nicho: lead.nicho || "",
                telefone: lead.telefone || "",
                responsavel_id: lead.responsavel_id || "",
                site_url: lead.site_url || "",
                instagram_url: lead.instagram_url || "",
                google_meu_negocio_url: lead.google_meu_negocio_url || ""
            });
            fetchPipelines();
            fetchNotes();
        }
    }, [isOpen, lead]);

    useEffect(() => {
        scrollToBottom();
    }, [notesHistory]);

    const scrollToBottom = () => {
        notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    async function fetchNotes() {
        const res = await getColdLeadNotes(lead.id);
        if (res.success) {
            setNotesHistory(res.data || []);
        }
    }

    async function fetchPipelines() {
        try {
            const res = await fetch('/api/crm/pipelines');
            if (res.ok) {
                const data = await res.json();
                setPipelines(data);
                if (data.length > 0) {
                    setSelectedPipeline(data[0].id);
                    setStages(data[0].stages || []);
                    if (data[0].stages?.length > 0) setSelectedStage(data[0].stages[0].id);
                }
            }
        } catch (e) { console.error(e) }
    }

    const handlePipelineChange = (pid: string) => {
        setSelectedPipeline(pid);
        const pipe = pipelines.find(p => String(p.id) === String(pid));
        if (pipe) {
            setStages(pipe.stages || []);
            if (pipe.stages?.length > 0) {
                setSelectedStage(pipe.stages[0].id);
            } else {
                setSelectedStage("");
            }
        } else {
            setStages([]);
            setSelectedStage("");
        }
    }

    const handleResult = async (result: string) => {
        setLoading(true);
        try {
            const payload: any = {
                resultado: result,
                notas: currentNote, // Optional: send current typed note if exists
            };

            if (result === 'reuniao_marcada') {
                if (!isMeetingMode) {
                    setIsMeetingMode(true);
                    setLoading(false);
                    return;
                }
                // Validar dados da reunião
                if (!meetingDate) {
                    toast.error("Selecione a data da reunião");
                    setLoading(false);
                    return;
                }
                payload.proxima_ligacao = meetingDate;
                payload.pipeline_id = selectedPipeline;
                payload.stage_id = selectedStage;
            }

            const res = await fetch(`/api/cold-leads/${lead.id}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Erro ao salvar resultado");

            const updatedLead = await res.json();
            toast.success("Resultado registrado!");
            setIsMeetingMode(false);

            // Callback to parent to update list
            onActionComplete(updatedLead);

            // Auto advance
            if (onNext && hasNext && !isMeetingMode) {
                // Small delay for UI
                setTimeout(() => onNext(), 300);
            } else {
                onClose();
            }

        } catch (error) {
            toast.error("Erro ao processar ação");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/cold-leads/${lead.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            if (!res.ok) throw new Error("Falha ao salvar");
            const updated = await res.json();
            onActionComplete(updated); // Update parent
            setIsEditing(false);
            toast.success("Lead atualizado!");
        } catch (e) {
            toast.error("Erro ao salvar alterações");
        } finally {
            setLoading(false);
        }
    }

    const handleDelete = async () => {
        if (!confirm("Tem certeza que deseja EXCLUIR este lead permanentemente?")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/cold-leads/${lead.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Falha ao excluir");
            onActionComplete({ ...lead, status: 'numero_inexistente' }); // Hacky way to remove locally 
            onClose();
            window.location.reload();
            toast.success("Lead excluído");
        } catch (e) {
            toast.error("Erro ao excluir");
        } finally {
            setLoading(false);
        }
    }

    const handleSendNote = async () => {
        if (!currentNote.trim()) return;
        const noteToSend = currentNote;
        setCurrentNote(""); // Optimistic clear

        // Add to list optimistically? Or wait? Wait is safer for ID. 
        // Let's rely on re-fetch or just push optimistic
        const tempNote = { id: "temp", content: noteToSend, created_at: new Date().toISOString(), profiles: { full_name: "Você" } };
        setNotesHistory(prev => [...prev, tempNote]);

        const res = await addColdLeadNote(lead.id, noteToSend);
        if (res.success) {
            fetchNotes(); // Sync real data
        } else {
            toast.error("Erro ao salvar nota");
            setNotesHistory(prev => prev.filter(n => n.id !== "temp"));
            setCurrentNote(noteToSend); // Restore
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendNote();
        }
    }

    // Date Shortcuts
    const setDateShortcut = (daysToAdd: number) => {
        const date = new Date();
        date.setDate(date.getDate() + daysToAdd);
        // Set to a reasonable time, e.g., next hour or same time?
        // Let's set to current hour + 1
        date.setHours(date.getHours() + 1, 0, 0, 0);

        // Format for datetime-local: YYYY-MM-DDTHH:mm
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        const dateString = `${year}-${month}-${day}T${hours}:${minutes}`;
        setMeetingDate(dateString);
    }

    const handleScheduleTask = async () => {
        if (!meetingDate) return;
        setLoading(true);
        try {
            // Convert local input time to UTC ISO string property
            const dateObj = new Date(meetingDate);
            const isoDate = dateObj.toISOString();

            const res = await createTask(null, `Follow-up: ${lead.nome}`, isoDate, lead.id);
            if (res.success) {
                toast.success("Tarefa agendada!");
                // Adiciona nota no histórico
                await addColdLeadNote(lead.id, `📅 Agendou follow-up para ${new Date(meetingDate).toLocaleString('pt-BR')}`);
                setMeetingDate("");
                fetchNotes(); // Atualiza notas
            } else {
                toast.error("Erro ao agendar tarefa");
            }
        } catch (error) {
            toast.error("Erro ao processar agendamento");
        } finally {
            setLoading(false);
        }
    }

    // Helper to open links
    const openLink = (url: string) => {
        if (!url) return;
        let target = url;
        if (!target.startsWith('http')) target = 'https://' + target;
        window.open(target, '_blank');
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden flex flex-col bg-white gap-0 border-none rounded-lg shadow-2xl">

                    {/* DARK HEADER */}
                    <div className="bg-[#0f172a] text-white px-6 py-5 flex justify-between items-start shrink-0">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                {isEditing ? (
                                    <Input
                                        value={editForm.nome}
                                        onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                        className="font-bold text-xl bg-slate-800 border-slate-700 text-white w-[300px] h-8 py-0 px-2"
                                    />
                                ) : (
                                    <h2 className="text-xl font-bold">{lead.nome}</h2>
                                )}
                                <Badge variant="secondary" className="bg-slate-700 text-slate-200 hover:bg-slate-600 border-none text-xs rounded-sm px-2">
                                    {lead.nicho}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 block"></span>
                                Em prospecção ativa
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {hasNext && (
                                <button
                                    onClick={onNext}
                                    className="flex items-center text-sm font-medium text-slate-300 hover:text-white transition-colors"
                                >
                                    Próximo <span className="ml-1 text-xs">›</span>
                                </button>
                            )}
                            <div className="w-px h-4 bg-slate-700 mx-2"></div>
                            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden grid grid-cols-12 h-full">

                        {/* LEFT SIDEBAR - INFO */}
                        <div className="col-span-4 bg-white p-6 border-r border-slate-100 flex flex-col gap-8 h-full overflow-y-auto">

                            {/* Responsible */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Responsável</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                                    value={lead.responsavel_id || ""}
                                    onChange={async (e) => {
                                        const newId = e.target.value;
                                        setLoading(true);
                                        try {
                                            const res = await fetch(`/api/cold-leads/${lead.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ responsavel_id: newId })
                                            });
                                            if (!res.ok) throw new Error("Falha ao salvar");
                                            const updated = await res.json();
                                            onActionComplete(updated);
                                            toast.success("Responsável atualizado!");
                                        } catch (err) {
                                            toast.error("Erro ao atualizar responsável");
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                >
                                    <option value="">Sem Responsável</option>
                                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                                </select>
                            </div>

                            {/* Phone Box */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telefone</label>
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 relative group">
                                    {isEditing ? (
                                        <Input value={editForm.telefone} onChange={e => setEditForm({ ...editForm, telefone: e.target.value })} className="bg-white" />
                                    ) : (
                                        <div className="text-lg font-mono text-slate-800 font-medium">
                                            {lead.telefone}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => { navigator.clipboard.writeText(lead.telefone); toast.success("Copiado!"); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Links */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Links</label>
                                <div className="space-y-2">
                                    <div
                                        className="flex items-center gap-3 p-2.5 rounded-md hover:bg-blue-50 text-slate-600 hover:text-blue-600 cursor-pointer transition-colors border border-transparent hover:border-blue-100 group"
                                        onClick={() => lead.google_meu_negocio_url && openLink(lead.google_meu_negocio_url)}
                                    >
                                        <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                            <MapPin size={16} />
                                        </div>
                                        <span className="text-sm font-medium">Google Meu Negócio</span>
                                    </div>

                                    <div
                                        className="flex items-center gap-3 p-2.5 rounded-md hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 cursor-pointer transition-colors border border-transparent hover:border-emerald-100 group"
                                        onClick={() => lead.site_url && openLink(lead.site_url)}
                                    >
                                        <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                            <Globe size={16} />
                                        </div>
                                        <span className="text-sm font-medium">Site Web</span>
                                    </div>

                                    {isEditing && (
                                        <div className="pt-2 flex flex-col gap-2">
                                            <Input placeholder="URL Google" value={editForm.google_meu_negocio_url} onChange={e => setEditForm({ ...editForm, google_meu_negocio_url: e.target.value })} className="h-8 text-xs" />
                                            <Input placeholder="URL Site" value={editForm.site_url} onChange={e => setEditForm({ ...editForm, site_url: e.target.value })} className="h-8 text-xs" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Custom Fields Display */}
                            {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Informações Adicionais</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {Object.entries(lead.custom_fields).map(([key, value]) => (
                                            <div key={key} className="bg-slate-50 p-2 rounded text-xs border border-slate-100">
                                                <span className="font-bold text-slate-500 block mb-0.5">
                                                    {key.replace('cf_', '').replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-slate-700 break-all">{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-auto grid grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tentativas</label>
                                    <span className="text-2xl font-bold text-slate-700">{lead.tentativas || 0}</span>
                                </div>
                                <div className="text-right">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Último Resultado</label>
                                    <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded font-medium">
                                        {lead.ultimo_resultado?.replace('_', ' ') || '-'}
                                    </span>
                                </div>
                            </div>

                            {/* Action Buttons for Edit/Delete at bottom left */}
                            {!isEditing ? (
                                <div className="flex gap-2 mt-4">
                                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="flex-1 text-slate-500 border-slate-200">
                                        <Pencil size={14} className="mr-2" /> Editar
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-400 hover:text-red-500 border-red-100 hover:bg-red-50">
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex gap-2 mt-4">
                                    <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="flex-1 text-slate-500">Cancelar</Button>
                                    <Button size="sm" onClick={handleSaveEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Salvar</Button>
                                </div>
                            )}

                        </div>

                        {/* RIGHT CONTENT - ACTIONS */}
                        <div className="col-span-8 p-0 flex flex-col bg-slate-50 h-full overflow-hidden">

                            {/* 1. RESULTADO DA LIGAÇÃO (Agora no Topo) */}
                            <div className="bg-white p-6 border-b border-slate-100 shadow-sm shrink-0">
                                <label className="text-sm font-bold text-slate-800 mb-3 block">Resultado da Ligação</label>
                                <div className="grid grid-cols-6 gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => handleResult('numero_inexistente')}
                                        className="col-span-2 h-10 border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 text-xs"
                                        disabled={loading}
                                    >
                                        <XCircle size={14} className="mr-2 text-red-500" /> Número Inexistente
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => handleResult('ligacao_feita')}
                                        className="col-span-2 h-10 border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 text-xs"
                                        disabled={loading}
                                    >
                                        <Phone size={14} className="mr-2 text-pink-500" /> Ligação Feita
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => handleResult('contato_realizado')}
                                        className="col-span-2 h-10 border-slate-200 text-slate-700 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 text-xs"
                                        disabled={loading}
                                    >
                                        <MessageCircle size={14} className="mr-2 text-purple-500" /> Contato Realizado
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => handleResult('contato_decisor')}
                                        className="col-span-3 h-10 border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 text-xs"
                                        disabled={loading}
                                    >
                                        <Target size={14} className="mr-2 text-indigo-600" /> Contato com Decisor
                                    </Button>

                                    <Button
                                        onClick={() => setIsMeetingMode(true)}
                                        className="col-span-3 h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                                        disabled={loading}
                                    >
                                        <Calendar size={14} className="mr-2" /> Reunião Marcada
                                    </Button>
                                </div>
                            </div>

                            {/* 2. AGENDAR FOLLOW UP (Meio) */}
                            <div className="p-6 shrink-0 bg-white border-b border-slate-100">
                                <label className="text-sm font-bold text-slate-800 mb-2 block">Agendar Follow-up</label>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setDateShortcut(0)} className="text-xs text-slate-600">Hoje</Button>
                                    <Button variant="outline" size="sm" onClick={() => setDateShortcut(1)} className="text-xs text-slate-600">Amanhã</Button>
                                    <Input
                                        type="datetime-local"
                                        value={meetingDate}
                                        onChange={e => setMeetingDate(e.target.value)}
                                        className="flex-1 text-xs h-9"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleScheduleTask}
                                        disabled={loading || !meetingDate}
                                        className="bg-slate-800 text-white hover:bg-slate-700 h-9"
                                    >
                                        Agendar
                                    </Button>
                                </div>
                            </div>

                            {/* 3. NOTES (Bottom - Chat Style) */}
                            <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
                                <div className="p-4 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                    <div className="text-center text-xs text-slate-400 py-2">Início do histórico</div>
                                    {notesHistory.map((note) => (
                                        <div key={note.id} className="group relative flex flex-col gap-1 items-start max-w-[90%]">
                                            {editingNoteId === note.id ? (
                                                <div className="w-full bg-white p-2 rounded-lg border border-blue-200 shadow-sm">
                                                    <Textarea
                                                        value={editContent}
                                                        onChange={e => setEditContent(e.target.value)}
                                                        className="min-h-[60px] text-sm mb-2"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <Button size="xs" variant="ghost" onClick={cancelEditing}>Cancelar</Button>
                                                        <Button size="xs" onClick={() => handleUpdateNote(note.id)}>Salvar</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm border border-slate-100 text-sm text-slate-700 pr-8 relative">
                                                        {note.content}
                                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 rounded px-1">
                                                            <button onClick={() => startEditing(note)} className="text-slate-400 hover:text-blue-500 p-1">
                                                                <Pencil size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 pl-1">
                                                        {note.profiles?.full_name || "Usuário"} • {new Date(note.created_at).toLocaleString('pt-BR')}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    <div ref={notesEndRef} />
                                </div>

                                <div className="p-4 bg-white border-t border-slate-200">
                                    <div className="relative">
                                        <Textarea
                                            className="w-full resize-none border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg pr-12 pl-4 py-3 text-sm min-h-[50px] max-h-[100px]"
                                            placeholder="Digite uma observação e pressione Enter..."
                                            value={currentNote}
                                            onChange={e => setCurrentNote(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                        />
                                        <button
                                            onClick={handleSendNote}
                                            className="absolute right-3 bottom-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded-full transition-colors"
                                            disabled={!currentNote.trim()}
                                        >
                                            <Send size={16} />
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <p className="text-[10px] text-slate-400">Pressione Enter para enviar</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* MEETING SCHEDULING MODE - OVERLAY MODAL */}
            <Dialog open={isMeetingMode} onOpenChange={setIsMeetingMode}>
                <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white rounded-xl">
                    {/* Header */}
                    <div className="bg-emerald-600 p-6 text-white relative">
                        <div className="absolute top-4 right-4">
                            <button onClick={() => setIsMeetingMode(false)} className="text-emerald-200 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2 mb-1 text-emerald-100 text-sm font-medium">
                            <Calendar size={16} /> Agendamento
                        </div>
                        <h2 className="text-2xl font-bold mb-1">Criar Oportunidade</h2>
                        <p className="text-emerald-100 text-sm opacity-90">Selecione o destino deste lead no funil.</p>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Funil de Vendas</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-slate-400"><GitPullRequest size={16} /></div>
                                    <select
                                        className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100 transition-all text-slate-700 appearance-none cursor-pointer"
                                        value={selectedPipeline}
                                        onChange={e => handlePipelineChange(e.target.value)}
                                    >
                                        {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Etapa do Funil</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-slate-400"><Target size={16} /></div>
                                    <select
                                        className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100 transition-all text-slate-700 appearance-none cursor-pointer"
                                        value={selectedStage}
                                        onChange={e => setSelectedStage(e.target.value)}
                                    >
                                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data da Reunião</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-slate-400"><Clock size={16} /></div>
                                    <Input
                                        type="datetime-local"
                                        value={meetingDate}
                                        onChange={e => setMeetingDate(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100 transition-all text-slate-700 h-auto"
                                    />
                                </div>
                            </div>

                            {/* Google Calendar Link Button */}
                            {meetingDate && (
                                <a
                                    href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Reunião com ${lead.nome}&details=Discussão sobre proposta comercial - Tel: ${lead.telefone}&dates=${new Date(meetingDate).toISOString().replace(/-|:|\.\d\d\d/g, "")}/${new Date(new Date(meetingDate).getTime() + 3600000).toISOString().replace(/-|:|\.\d\d\d/g, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-emerald-100 bg-white text-emerald-600 hover:bg-emerald-50 text-xs font-bold transition-colors w-full"
                                >
                                    <Calendar size={14} />
                                    Abrir no Google Agenda
                                </a>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="bg-emerald-50 rounded-xl p-4 flex gap-4 border border-emerald-100">
                            <div className="mt-1 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                <Check size={16} />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-emerald-900 mb-1">O que acontece agora?</h4>
                                <p className="text-xs text-emerald-700 leading-relaxed">
                                    O lead será movido para o Kanban na etapa selecionada e um evento de "Reunião Marcada" será registrado.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button variant="ghost" onClick={() => setIsMeetingMode(false)} className="text-slate-500 hover:text-slate-700">Cancelar</Button>
                            <Button
                                onClick={() => handleResult('reuniao_marcada')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-lg shadow-emerald-200"
                                disabled={loading}
                            >
                                <Check size={16} className="mr-2" /> Confirmar Agendamento
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
