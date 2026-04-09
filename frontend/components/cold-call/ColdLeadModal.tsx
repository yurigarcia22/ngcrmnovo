"use client";
import { useState, useEffect, useRef, memo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Textarea, Badge } from "@/components/ui/simple-ui";
import { ColdLead } from "@/types/cold-lead";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Phone, CheckCircle, XCircle, Calendar, X, Clock, Target, Trash2, Pencil, MapPin, Globe, MessageCircle, GitPullRequest, Check, Send, AlertTriangle, Mail } from "lucide-react";
import { addColdLeadNote, getColdLeadNotes, createTask, updateColdLeadNote, createColdCallFollowup, getColdCallFollowups, updateColdCallFollowup } from "@/app/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface ColdLeadModalProps {
    lead: ColdLead;
    isOpen: boolean;
    onClose: () => void;
    teamMembers: any[];
    pipelines: any[];
    onNext?: () => void;
    hasNext?: boolean;
    onActionComplete: (updatedLead: ColdLead) => void;
    onLeadUpdate?: (updatedLead: ColdLead) => void;
}

function ColdLeadModalComponent({ lead, isOpen, onClose, teamMembers, pipelines, onNext, hasNext, onActionComplete, onLeadUpdate }: ColdLeadModalProps) {
    const router = useRouter();
    const confirm = useConfirm();
    const [currentNote, setCurrentNote] = useState("");
    const [notesHistory, setNotesHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isMeetingMode, setIsMeetingMode] = useState(false);
    const [meetingDate, setMeetingDate] = useState("");

    // Pipelines for meeting (received as prop, fetched once by parent)
    const [selectedPipeline, setSelectedPipeline] = useState("");
    const [stages, setStages] = useState<any[]>([]);
    const [selectedStage, setSelectedStage] = useState("");

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [localEmail, setLocalEmail] = useState(lead.email || "");
    const [editForm, setEditForm] = useState({
        nome: lead.nome || "",
        nicho: lead.nicho || "",
        telefone: lead.telefone || "",
        responsavel_id: lead.responsavel_id || "",
        site_url: lead.site_url || "",
        instagram_url: lead.instagram_url || "",
        google_meu_negocio_url: lead.google_meu_negocio_url || "",
        email: lead.email || ""
    });

    // Follow-up State
    const [isFollowupMode, setIsFollowupMode] = useState(false);
    const [fupPeriodo, setFupPeriodo] = useState('manha');
    const [fupData, setFupData] = useState('');
    const [fupTipoAcao, setFupTipoAcao] = useState('ligacao');
    const [fupPrioridade, setFupPrioridade] = useState('media');
    const [leadFollowups, setLeadFollowups] = useState<any[]>([]);

    const fetchLeadFollowups = async () => {
        const res = await getColdCallFollowups({ leadId: lead.id });
        if (res.success && res.data) {
            setLeadFollowups(res.data.filter((f: any) => f.status === 'pendente' || f.status === 'atrasado'));
        }
    };



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
            setLocalEmail(lead.email || "");
            setEditForm({
                nome: lead.nome || "",
                nicho: lead.nicho || "",
                telefone: lead.telefone || "",
                responsavel_id: lead.responsavel_id || "",
                site_url: lead.site_url || "",
                instagram_url: lead.instagram_url || "",
                google_meu_negocio_url: lead.google_meu_negocio_url || "",
                email: lead.email || ""
            });
            // Run notes + lead followups in parallel (pipelines now comes from parent prop)
            Promise.all([fetchNotes(), fetchLeadFollowups()]);
        }
    }, [isOpen, lead]);

    // Sync selected pipeline/stage defaults from pipelines prop (first load or when prop arrives)
    useEffect(() => {
        if (pipelines.length > 0 && !selectedPipeline) {
            setSelectedPipeline(pipelines[0].id);
            setStages(pipelines[0].stages || []);
            if (pipelines[0].stages?.length > 0) {
                setSelectedStage(pipelines[0].stages[0].id);
            }
        }
    }, [pipelines, selectedPipeline]);

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

    const handleSaveFollowup = async () => {
        if (!fupData) {
            toast.error("Selecione a data do follow-up");
            return;
        }
        setLoading(true);
        try {
            console.log('[FollowUp] Saving:', { cold_lead_id: lead.id, data_agendada: fupData, periodo: fupPeriodo, tipo_acao: fupTipoAcao, prioridade: fupPrioridade });
            const res = await createColdCallFollowup({
                cold_lead_id: lead.id,
                responsavel_id: lead.responsavel_id,
                data_agendada: fupData,
                periodo: fupPeriodo,
                tipo_acao: fupTipoAcao,
                prioridade: fupPrioridade,
                status: 'pendente'
            });

            console.log('[FollowUp] Server response:', res);

            if (res.success) {
                toast.success("Follow-up agendado com sucesso!");
                setIsFollowupMode(false);
                setFupData("");
                fetchLeadFollowups(); // Refresh after save
            } else {
                console.error('[FollowUp] Save error:', res.error);
                toast.error("Erro ao agendar follow-up: " + (res.error || "erro desconhecido"));
            }
        } catch (error) {
            console.error('[FollowUp] Exception:', error);
            toast.error("Erro no servidor");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmConversion = async () => {
        // Keeps old meeting scheduling logic if needed, but we replace the UI mostly.
        // Keeping it for the 'Reunião Marcada' flow.
        if (!meetingDate) {
            toast.error("Selecione uma data para a reunião.");
            return;
        }
        setLoading(true);
        try {
            const payload: any = {
                resultado: 'reuniao_marcada',
                proxima_ligacao: meetingDate,
                notas: currentNote || "Reunião marcada",
                pipeline_id: selectedPipeline,
                stage_id: selectedStage
            };
            const res = await fetch(`/api/cold-leads/${lead.id}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Erro");

            toast.success("Reunião agendada e Lead convertido!");
            setIsMeetingMode(false);
            onActionComplete(await res.json());
            setTimeout(() => onClose(), 500);

        } catch (e) {
            toast.error("Erro ao agendar reunião.");
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
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: "Excluir este lead permanentemente?",
            description: "Esta acao e irreversivel.",
            tone: "danger",
            confirmText: "Excluir",
        });
        if (!ok) return;
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
                <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden flex flex-col bg-white gap-0 border-none rounded-lg shadow-2xl [&>button]:hidden">

                    {/* LIGHT HEADER */}
                    <div className="bg-white text-gray-900 px-6 py-5 flex justify-between items-start shrink-0 border-b border-gray-200">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                {isEditing ? (
                                    <Input
                                        value={editForm.nome}
                                        onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                        className="font-bold text-xl bg-gray-50 border-gray-300 text-gray-900 w-[300px] h-8 py-0 px-2"
                                    />
                                ) : (
                                    <h2 className="text-xl font-bold text-gray-900">{lead.nome}</h2>
                                )}
                                <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 border-none text-xs rounded-sm px-2">
                                    {lead.nicho}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 block"></span>
                                Em prospecção ativa
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {hasNext && (
                                <button
                                    onClick={onNext}
                                    className="flex items-center text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
                                >
                                    Próximo <span className="ml-1 text-xs">›</span>
                                </button>
                            )}
                            <div className="w-px h-4 bg-gray-300 mx-2"></div>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden grid grid-cols-12 h-full">

                        {/* LEFT SIDEBAR - INFO */}
                        <div className="col-span-4 bg-white p-6 border-r border-slate-100 flex flex-col gap-8 h-full overflow-y-auto">

                            {/* Responsible */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Responsável</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer text-slate-800"
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
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Telefone</label>
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 relative group flex items-center justify-between">
                                    {isEditing ? (
                                        <Input value={editForm.telefone} onChange={e => setEditForm({ ...editForm, telefone: e.target.value })} className="bg-white text-slate-900 w-full mr-10" />
                                    ) : (
                                        <div className="text-lg font-mono text-slate-800 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                                            {lead.telefone}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                        {!isEditing && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const cleanPhone = lead.telefone.replace(/\D/g, "");
                                                    let sipPhone = cleanPhone;
                                                    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
                                                        sipPhone = "+55" + cleanPhone;
                                                    } else if (!cleanPhone.startsWith("+") && cleanPhone.length > 11) {
                                                        sipPhone = "+" + cleanPhone;
                                                    }
                                                    window.location.href = `sip:${sipPhone}`;
                                                }}
                                                className="w-8 h-8 flex items-center justify-center rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors"
                                                title="Ligar com MicroSIP"
                                            >
                                                <Phone className="h-4 w-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(lead.telefone); toast.success("Copiado!"); }}
                                            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                                            title="Copiar número"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Email Box */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">E-mail</label>
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 relative flex items-center justify-between min-h-[64px]">
                                    {isEditing ? (
                                        <Input type="email" placeholder="Sem e-mail" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} className="bg-white text-slate-900 w-full mr-10" />
                                    ) : (
                                        <div className="flex-1 flex items-center gap-2 mr-2 min-w-0">
                                            {localEmail ? (
                                                <div className="text-sm font-medium text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {localEmail}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 w-full max-w-[280px]">
                                                    <Input 
                                                        type="email" 
                                                        placeholder="Adicionar e-mail..." 
                                                        className="bg-white text-slate-900 w-full h-8 text-xs font-semibold focus:ring-blue-500"
                                                        value={editForm.email || ''}
                                                        onChange={e => setEditForm({...editForm, email: e.target.value})}
                                                    />
                                                    <Button 
                                                        size="sm" 
                                                        className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 font-bold shrink-0 shadow-sm"
                                                        onClick={async () => {
                                                            if (!editForm.email) return;
                                                            setLoading(true);
                                                            try {
                                                                const res = await fetch(`/api/cold-leads/${lead.id}`, {
                                                                    method: 'PATCH',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ email: editForm.email })
                                                                });
                                                                if (!res.ok) throw new Error("Falha ao salvar");
                                                                const updated = await res.json();
                                                                
                                                                // Mutate local lead prop for instant UI update before parent re-renders
                                                                lead.email = updated.email; 
                                                                setLocalEmail(updated.email); // explicitly update local state to trigger render
                                                                
                                                                if (onLeadUpdate) {
                                                                    onLeadUpdate(updated);
                                                                } else {
                                                                    // Fallback if not provided, but parent might navigate
                                                                    onActionComplete(updated); 
                                                                }
                                                                
                                                                toast.success("E-mail adicionado!");
                                                            } catch (err) {
                                                                toast.error("Erro ao salvar e-mail");
                                                            } finally {
                                                                setLoading(false);
                                                            }
                                                        }}
                                                        disabled={loading || !editForm.email}
                                                    >
                                                        Salvar
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                        {!isEditing && localEmail && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/emails?compose=true&to=${encodeURIComponent(localEmail)}`);
                                                }}
                                                className="w-8 h-8 flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                                                title="Enviar E-mail"
                                            >
                                                <Mail className="h-4 w-4" />
                                            </button>
                                        )}
                                        {localEmail && !isEditing && (
                                            <button
                                              onClick={() => { navigator.clipboard.writeText(localEmail); toast.success("Copiado!"); }}
                                              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                                              title="Copiar e-mail"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Links */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Links</label>
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
                                            <Input placeholder="URL Google" value={editForm.google_meu_negocio_url} onChange={e => setEditForm({ ...editForm, google_meu_negocio_url: e.target.value })} className="h-8 text-xs text-slate-900 border-slate-300" />
                                            <Input placeholder="URL Site" value={editForm.site_url} onChange={e => setEditForm({ ...editForm, site_url: e.target.value })} className="h-8 text-xs text-slate-900 border-slate-300" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Custom Fields Display */}
                            {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Informações Adicionais</label>
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
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tentativas</label>
                                    <span className="text-2xl font-bold text-slate-700">{lead.tentativas || 0}</span>
                                </div>
                                <div className="text-right">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Último Resultado</label>
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

                            {/* 1. RESULTADO DA LIGAÇÃO E CONVERSÃO (Topo) */}
                            {isMeetingMode ? (
                                <div className="bg-emerald-50 p-6 border-b border-emerald-100 shadow-sm shrink-0 animate-in fade-in">
                                    <h3 className="text-emerald-800 font-bold mb-3 flex items-center gap-2">
                                        <Calendar size={18} /> Agendar Reunião e Converter
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-xs font-bold text-emerald-700 block mb-1">Selecionar Funil</label>
                                            <select
                                                className="w-full bg-white border border-emerald-200 rounded px-3 py-2 text-sm text-slate-800 focus:ring-emerald-500"
                                                value={selectedPipeline}
                                                onChange={e => handlePipelineChange(e.target.value)}
                                            >
                                                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-emerald-700 block mb-1">Etapa Inicial</label>
                                            <select
                                                className="w-full bg-white border border-emerald-200 rounded px-3 py-2 text-sm text-slate-800 focus:ring-emerald-500"
                                                value={selectedStage}
                                                onChange={e => setSelectedStage(e.target.value)}
                                            >
                                                {stages.map(s => <option key={s.id} value={s.id}>{s.name || s.title}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-span-2 space-y-2 relative">
                                            <label className="text-xs font-bold text-emerald-700 block mb-1">Data da Reunião</label>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setDateShortcut(0)} className="text-xs bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100">Hoje</Button>
                                                <Button variant="outline" size="sm" onClick={() => setDateShortcut(1)} className="text-xs bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100">Amanhã</Button>
                                                <Input
                                                    type="datetime-local"
                                                    value={meetingDate}
                                                    onChange={e => setMeetingDate(e.target.value)}
                                                    className="flex-1 text-xs border-emerald-200"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="ghost" className="text-emerald-700 hover:bg-emerald-100" onClick={() => setIsMeetingMode(false)}>Cancelar</Button>
                                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirmConversion} disabled={loading || !meetingDate}>Confirmar Conversão</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white p-6 border-b border-slate-100 shadow-sm shrink-0">
                                            <label className="text-sm font-bold text-slate-800 mb-3 flex justify-between items-center">
                                                Ação Rápida
                                            </label>
                                            <div className="space-y-2 mt-2">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => handleResult('numero_inexistente')}
                                                        className="h-10 border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-600 hover:bg-red-50 text-xs"
                                                        disabled={loading}
                                                    >
                                                        <XCircle size={14} className="mr-2 text-red-500 shrink-0" /> Número Inexistente
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        onClick={() => handleResult('sem_interesse')}
                                                        className="h-10 border-slate-200 text-slate-600 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50 text-xs"
                                                        disabled={loading}
                                                    >
                                                        <XCircle size={14} className="mr-2 text-orange-500 shrink-0" /> Sem Interesse
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        onClick={() => handleResult('ligacao_feita')}
                                                        className="h-10 border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 text-xs"
                                                        disabled={loading}
                                                    >
                                                        <Phone size={14} className="mr-2 text-blue-500 shrink-0" /> Ligação Feita
                                                    </Button>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => handleResult('contato_realizado')}
                                                        className="h-10 border-slate-200 text-slate-700 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50 text-xs"
                                                        disabled={loading}
                                                    >
                                                        <CheckCircle size={14} className="mr-2 text-teal-500 shrink-0" /> Contato Realizado
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        onClick={() => handleResult('contato_decisor')}
                                                        className="h-10 border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-bold"
                                                        disabled={loading}
                                                    >
                                                        <Target size={14} className="mr-2 text-indigo-600 shrink-0" /> Contato com Decisor
                                                    </Button>

                                                    <Button
                                                        onClick={() => setIsMeetingMode(true)}
                                                        className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-200"
                                                        disabled={loading}
                                                    >
                                                        <Calendar size={14} className="mr-2 shrink-0" /> Reunião (Converter em Lead)
                                                    </Button>
                                                </div>
                                            </div>
                                </div>
                            )}

                            {/* 2. AGENDAR FOLLOW UP (Meio) */}
                            <div className="p-6 shrink-0 bg-slate-50 border-b border-slate-100">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <Clock size={16} className="text-blue-500" /> Próximo Passos (Follow-up)
                                    </label>
                                    {!isFollowupMode && (
                                        <Button size="sm" variant="outline" onClick={() => setIsFollowupMode(true)} className="h-8 text-xs border-blue-200 text-blue-600 hover:bg-blue-50">
                                            + Agendar Follow-up
                                        </Button>
                                    )}
                                </div>

                                {isFollowupMode ? (
                                    <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm animate-in fade-in space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Data</label>
                                                <Input type="date" value={fupData} onChange={e => setFupData(e.target.value)} className="h-9 text-xs" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Período</label>
                                                <select className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={fupPeriodo} onChange={e => setFupPeriodo(e.target.value)}>
                                                    <option value="manha">Manhã (08h - 12h)</option>
                                                    <option value="tarde">Tarde (13h - 18h)</option>
                                                    <option value="noite">Noite (Após 18h)</option>
                                                    <option value="qualquer">Qualquer horário</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Ação</label>
                                                <select className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={fupTipoAcao} onChange={e => setFupTipoAcao(e.target.value)}>
                                                    <option value="ligacao">Ligar Novamente</option>
                                                    <option value="whatsapp">Enviar WhatsApp</option>
                                                    <option value="email">Enviar E-mail</option>
                                                    <option value="retorno_prometido">Retorno Prometido (Eles ligam)</option>
                                                    <option value="nova_tentativa">Nova Tentativa (Geral)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Prioridade</label>
                                                <select className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs" value={fupPrioridade} onChange={e => setFupPrioridade(e.target.value)}>
                                                    <option value="baixa">Baixa</option>
                                                    <option value="media">Média</option>
                                                    <option value="alta">Alta</option>
                                                    <option value="urgente">Urgente 🔥</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
                                            <Button variant="ghost" size="sm" onClick={() => setIsFollowupMode(false)} className="text-slate-500 h-8 text-xs">Cancelar</Button>
                                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs" onClick={handleSaveFollowup} disabled={loading || !fupData}>
                                                Salvar Follow-up
                                            </Button>
                                        </div>
                                    </div>
                                ) : leadFollowups.length > 0 ? (
                                    <div className="space-y-2">
                                        {leadFollowups.map((fup: any) => (
                                            <div key={fup.id} className={`flex items-center justify-between p-3 rounded-lg border text-xs ${fup.status === 'atrasado' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
                                                }`}>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-bold text-slate-800">
                                                        📅 {new Date(fup.data_agendada + 'T00:00:00').toLocaleDateString('pt-BR')} — {fup.periodo === 'manha' ? '☀️ Manhã' : fup.periodo === 'tarde' ? '🌅 Tarde' : fup.periodo}
                                                    </span>
                                                    <span className="text-slate-500 capitalize">{fup.tipo_acao.replace('_', ' ')} • <span className={fup.prioridade === 'urgente' || fup.prioridade === 'alta' ? 'text-red-600 font-bold' : ''}>{fup.prioridade}</span></span>
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        const res = await updateColdCallFollowup(fup.id, { status: 'concluido' });
                                                        if (res.success) {
                                                            toast.success('Follow-up concluído!');
                                                            fetchLeadFollowups();
                                                        } else {
                                                            toast.error('Erro ao concluir follow-up.');
                                                        }
                                                    }}
                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors font-bold text-[11px] border border-emerald-200"
                                                >
                                                    <CheckCircle className="w-3 h-3" />
                                                    Concluir
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 rounded-lg border border-dashed border-amber-200 p-4 text-center">
                                        <AlertTriangle size={16} className="text-amber-500 mx-auto mb-1" />
                                        <p className="text-xs text-amber-700">Nenhum follow-up futuro agendado.</p>
                                    </div>
                                )}
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
                                                        <Button size="sm" variant="ghost" onClick={cancelEditing}>Cancelar</Button>
                                                        <Button size="sm" onClick={() => handleUpdateNote(note.id)}>Salvar</Button>
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

export const ColdLeadModal = memo(ColdLeadModalComponent);
