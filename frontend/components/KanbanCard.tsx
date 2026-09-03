import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Draggable } from "@hello-pangea/dnd";
import { User, Link as LinkIcon, MessageCircle, Calendar, Package, MoreHorizontal, Trophy, XCircle, Trash2, Briefcase, Check, Phone, UserCircle2, PhoneCall } from "lucide-react";
import { useRouter } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAsWon, markAsLost, deleteDeal, registerTouchpoint } from "@/app/actions";
import LossReasonDialog from "@/components/deal/LossReasonDialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import confetti from "canvas-confetti";

interface KanbanCardProps {
    deal: any; // Using any for now to match page.tsx
    index: number;
    fields: any[];
    onClick?: (deal: any) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (id: string) => void;
}

export default function KanbanCard({ deal, index, fields, onClick, isSelectionMode, isSelected, onToggleSelection }: KanbanCardProps) {
    const router = useRouter();
    const confirm = useConfirm();

    // Cadencia: FONTE UNICA e o cache do board (deal.touchpoints via prop).
    // Antes havia um contador local + useEffect de sincronizacao, e qualquer
    // refetch no meio do clique derrubava o valor otimista de volta ("clico e
    // as vezes nao soma"). Agora o otimismo e a confirmacao acontecem SO no
    // cache — o card apenas renderiza o que o cache diz.
    const touchCount = deal.touchpoints ?? 0;
    const lastTouch: string | null = deal.last_touch_at ?? null;
    const [touchSaving, setTouchSaving] = useState(false);

    const patchBoardTouch = (touchpoints: number, last_touch_at: string | null) => {
        queryClient.setQueriesData({ queryKey: ["deals", "board"] }, (old: any) =>
            old ? { ...old, deals: (old.deals ?? []).map((d: any) => d.id === deal.id ? { ...d, touchpoints, last_touch_at } : d) } : old
        );
    };

    const handleTouchpoint = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (touchSaving) return;
        setTouchSaving(true);
        // Otimista no cache: soma na hora (e o filtro "Sem contato hoje" reage ja)
        patchBoardTouch(touchCount + 1, new Date().toISOString());

        const res = await registerTouchpoint(deal.id);
        if (res?.success === false) {
            toast.error("Erro ao registrar contato", res.error);
            patchBoardTouch(touchCount, lastTouch); // desfaz
        } else if (typeof (res as any)?.touchpoints === "number") {
            // Fixa o valor AUTORITATIVO do servidor no cache (incremento atomico
            // no banco: dois cliques rapidos somam 2, nunca 1)
            patchBoardTouch((res as any).touchpoints, (res as any).last_touch_at ?? new Date().toISOString());
        }
        setTouchSaving(false);
    };

    const handleMarkAsWon = async (e: React.MouseEvent) => {
        e.stopPropagation();

        // Primeiro confirma no servidor; so comemora se deu certo (antes o confete
        // disparava mesmo quando markAsWon falhava e o card nem se movia).
        const res = await markAsWon(deal.id);
        if (res?.success === false) {
            toast.error("Erro ao marcar como ganho", res.error);
            return;
        }

        toast.success("Negocio marcado como ganho!");
        router.refresh();

        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    // Perda exige MOTIVO (modal compartilhado com os motivos de Configuracoes).
    const [showLostDialog, setShowLostDialog] = useState(false);
    const queryClient = useQueryClient();

    const handleMarkAsLost = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowLostDialog(true);
    };

    const handleConfirmLost = async (payload: { lossReasonId?: string; reasonName?: string; details?: string }) => {
        // OTIMISTA: fecha o modal e some da visao "Ativas" na hora; o servidor
        // confirma em segundo plano (o invalidate final consolida a verdade).
        setShowLostDialog(false);
        queryClient.setQueriesData({ queryKey: ["deals", "board"] }, (old: any) =>
            old ? { ...old, deals: (old.deals ?? []).map((d: any) => d.id === deal.id ? { ...d, status: "lost", closed_at: new Date().toISOString() } : d) } : old
        );

        const res = await markAsLost(deal.id, payload.reasonName, payload.details, payload.lossReasonId);
        if (res?.success === false) {
            toast.error("Erro ao marcar como perdido", res.error);
        } else {
            toast.success("Negocio marcado como perdido");
        }
        // Em sucesso consolida; em erro restaura o estado real do servidor.
        queryClient.invalidateQueries({ queryKey: ["deals", "board"] });
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const ok = await confirm({
            title: "Excluir este lead?",
            description: "Esta acao e irreversivel. Todas as informacoes vinculadas serao perdidas.",
            tone: "danger",
            confirmText: "Excluir definitivamente",
        });
        if (!ok) return;
        const res = await deleteDeal(deal.id);
        if (res?.success === false) {
            toast.error("Erro ao excluir", res.error);
        } else {
            toast.success("Lead excluido");
        }
    };

    // Clean title function to remove "Oportunidade: " prefix if present
    const cleanTitle = (title: string) => {
        return title.replace(/^Oportunidade:\s*/i, '');
    };

    // Formata phone brasileiro: 5551992753409 → +55 (51) 99275-3409
    function formatPhone(p: any): string {
        if (!p) return "";
        const d = String(p).replace(/\D/g, "");
        if (d.length === 13 && d.startsWith("55")) {
            return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
        }
        if (d.length === 12 && d.startsWith("55")) {
            return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
        }
        if (d.length === 11) {
            return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
        }
        if (d.length === 10) {
            return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
        }
        return String(p);
    }

    return (
        <>
        <Draggable draggableId={String(deal.id)} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={(e) => {
                        if (isSelectionMode && onToggleSelection) {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleSelection(deal.id);
                        } else {
                            if (onClick) onClick(deal);
                            else router.push(`/deals/${deal.id}`);
                        }
                    }}
                    style={{ ...provided.draggableProps.style }}
                    className={`
                        group relative w-full mb-3 rounded-2xl p-5 cursor-pointer transition-all duration-300
                        bg-white border shadow-sm
                        ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20' : 'border-slate-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-300'}
                        ${snapshot.isDragging ? "shadow-2xl ring-2 ring-indigo-500 rotate-1 scale-[1.02] z-[999]" : ""}
                        ${deal.status === 'lost' ? 'opacity-60 grayscale' : ''}
                    `}
                >
                    {/* Selection Checkbox Overlay */}
                    {isSelectionMode && (
                        <div className="absolute top-4 right-4 z-20">
                            <div
                                role="checkbox"
                                aria-checked={isSelected}
                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}
                            >
                                {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
                            </div>
                        </div>
                    )}
                    {/* Header: Label, Title & Actions */}
                    <div className="flex justify-between items-start gap-4 mb-3">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                            {/* Restored "Light Blue Emoji" Label */}
                            <div className="flex items-center gap-1.5 text-blue-600 mb-0.5">
                                <Briefcase size={12} strokeWidth={2.5} />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600/80">Oportunidade</span>
                            </div>

                            {/* Title Section - Cleaned and allowed to wrap */}
                            <h4 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-3" title={deal.title}>
                                {cleanTitle(deal.title)}
                            </h4>
                        </div>

                        {/* Context Menu (Actions) */}
                        <div onClick={(e) => e.stopPropagation()} className="-mr-2 -mt-1 shrink-0">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                        <MoreHorizontal size={18} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 bg-white border border-gray-200 text-gray-700 shadow-xl rounded-xl p-1.5 z-[9999]">
                                    <DropdownMenuLabel className="text-xs text-gray-500 font-bold uppercase tracking-widest px-2 py-1.5">Gerenciar</DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-gray-100 my-1" />
                                    <DropdownMenuItem onClick={handleMarkAsWon} className="text-emerald-600 text-sm py-2 px-2 cursor-pointer hover:bg-emerald-50 rounded-md transition-colors">
                                        <Trophy className="mr-2 h-4 w-4" />
                                        <span>Marcar como Ganho</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleMarkAsLost} className="text-orange-600 text-sm py-2 px-2 cursor-pointer hover:bg-orange-50 rounded-md transition-colors">
                                        <XCircle className="mr-2 h-4 w-4" />
                                        <span>Marcar como Perdido</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-gray-100 my-1" />
                                    <DropdownMenuItem onClick={handleDelete} className="text-red-600 text-sm py-2 px-2 cursor-pointer hover:bg-red-50 rounded-md transition-colors">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        <span>Excluir</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Tags (etiquetas coloridas) */}
                    {deal.deal_tags && deal.deal_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {deal.deal_tags.map((dt: any, i: number) => {
                                const tag = dt.tags;
                                if (!tag) return null;
                                return (
                                    <span
                                        key={tag.id ?? i}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                                        style={{
                                            backgroundColor: `${tag.color}15`,
                                            borderColor: `${tag.color}40`,
                                            color: tag.color,
                                        }}
                                    >
                                        {tag.name}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {/* Canal de aquisição */}
                    {deal.acquisition_channels?.name && (
                        <div className="mb-3">
                            <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                                style={{
                                    backgroundColor: `${deal.acquisition_channels.color || '#6366f1'}12`,
                                    borderColor: `${deal.acquisition_channels.color || '#6366f1'}40`,
                                    color: deal.acquisition_channels.color || '#6366f1',
                                }}
                                title={`Canal de aquisição: ${deal.acquisition_channels.name}`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: deal.acquisition_channels.color || '#6366f1' }} />
                                {deal.acquisition_channels.name}
                            </span>
                        </div>
                    )}

                    {/* Value */}
                    {deal.value > 0 && (
                        <div className="mb-4">
                            <span className="text-lg font-bold text-emerald-600 tracking-tight">
                                R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}

                    {/* Produtos negociados */}
                    {deal.deal_items && deal.deal_items.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {deal.deal_items.map((it: any, i: number) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 border border-violet-100 text-violet-700 text-[11px] font-semibold"
                                    title={it.products?.name || 'Produto'}
                                >
                                    <Package size={11} strokeWidth={2.5} className="shrink-0" />
                                    <span className="truncate max-w-[140px]">{it.products?.name || 'Produto'}</span>
                                    {it.quantity > 1 && <span className="text-violet-400">x{it.quantity}</span>}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Decisor (responsible_name de custom_values) */}
                    {deal.custom_values?.responsible_name && (
                        <div className="flex items-center gap-2 mb-2 text-gray-700">
                            <UserCircle2 size={14} className="text-indigo-500 shrink-0" strokeWidth={2.5} />
                            <span className="text-xs font-semibold truncate" title={`Decisor: ${deal.custom_values.responsible_name}`}>
                                {deal.custom_values.responsible_name}
                            </span>
                        </div>
                    )}

                    {/* Telefones */}
                    <div className="flex flex-col gap-1 mb-3">
                        {/* Abrir conversa no chat interno do CRM (preserva historico/contexto) */}
                        <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/chat?dealId=${deal.id}`); }}
                            className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-900 w-fit"
                            title="Abrir conversa no CRM"
                        >
                            <MessageCircle size={13} className="shrink-0" strokeWidth={2.5} />
                            <span className="text-xs font-semibold">Abrir conversa</span>
                        </button>
                        {deal.contacts?.phone && (
                            <a
                                href={`https://wa.me/${String(deal.contacts.phone).replace(/\D/g,'')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-900"
                                title="Abrir no WhatsApp externo"
                            >
                                <Phone size={13} className="shrink-0" strokeWidth={2.5} />
                                <span className="text-xs font-semibold tabular-nums">
                                    {formatPhone(deal.contacts.phone)}
                                </span>
                            </a>
                        )}
                        {deal.custom_values?.responsible_direct_phone &&
                         String(deal.custom_values.responsible_direct_phone).replace(/\D/g,'') !== String(deal.contacts?.phone || '').replace(/\D/g,'') && (
                            <a
                                href={`https://wa.me/${String(deal.custom_values.responsible_direct_phone).replace(/\D/g,'')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-2 text-indigo-700 hover:text-indigo-900"
                                title="Telefone direto do decisor"
                            >
                                <Phone size={13} className="shrink-0" strokeWidth={2.5} />
                                <span className="text-xs font-semibold tabular-nums">
                                    {formatPhone(deal.custom_values.responsible_direct_phone)}
                                </span>
                                <span className="text-[9px] uppercase tracking-wider text-indigo-500 font-bold">direto</span>
                            </a>
                        )}
                    </div>

                    {/* Empresa (contato — só mostra se diferente do title) */}
                    {deal.contacts?.name && deal.contacts.name !== deal.title && (
                        <div className="mb-3">
                            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600 w-auto max-w-full">
                                <User size={11} className="text-gray-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[11px] font-medium truncate">{deal.contacts.name}</span>
                            </div>
                        </div>
                    )}

                    {/* Separator */}
                    <div className="h-px w-full bg-gray-100 mb-3" />

                    {/* Footer em 2 linhas: atividade (cadência + reunião) e meta (criação + donos) */}
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        {/* Linha 1: cadência + próxima reunião */}
                        <div className="flex items-center justify-between gap-2">
                            <button
                                onClick={handleTouchpoint}
                                disabled={touchSaving}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors disabled:opacity-50 shrink-0 ${
                                    touchCount > 0
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                                }`}
                                title={`Cadência: ${touchCount} ponto(s) de contato${lastTouch ? ` · último em ${new Date(lastTouch).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}` : ''}. Clique para registrar +1.`}
                                aria-label="Registrar ponto de contato"
                            >
                                <PhoneCall size={10} strokeWidth={3} />
                                {touchCount}
                                {touchCount > 0 && lastTouch && (
                                    <span className="font-semibold opacity-70">· {new Date(lastTouch).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
                                )}
                                <span className="text-indigo-400 font-black">+</span>
                            </button>

                            {/* Próxima reunião (se houver) */}
                            {(() => {
                                const incompleteTasks = deal.tasks?.filter((t: any) => !t.is_completed && t.due_date) || [];
                                if (incompleteTasks.length === 0) return null;

                                incompleteTasks.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
                                const nextTask = incompleteTasks[0];
                                const nextDate = new Date(nextTask.due_date);
                                const isToday = new Date().toDateString() === nextDate.toDateString();
                                const isLate = nextDate < new Date() && !isToday;

                                return (
                                    <div
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${isLate ? 'bg-red-50 text-red-600 border-red-100' : isToday ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}
                                        title={`Próxima reunião/tarefa: ${nextTask.description || 'Sem descrição'}`}
                                    >
                                        <Calendar size={10} strokeWidth={3} />
                                        <span>Reunião {nextDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Linha 2: data de criação + responsáveis */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-gray-400 group-hover:text-gray-500 transition-colors" title="Data de criação">
                                <Calendar size={13} strokeWidth={2.5} />
                                <span className="text-[11px] font-medium tracking-wide">
                                    {new Date(deal.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                                </span>
                            </div>

                        {/* Owners / Responsibles */}
                        <div className="flex items-center -space-x-2 overflow-hidden pl-1">
                            {(() => {
                                const owners = [];
                                // 1. Primary Owner
                                if (deal.owner) {
                                    owners.push({ ...deal.owner, id: 'owner', isPrimary: true });
                                }
                                // 2. Members
                                if (deal.deal_members && deal.deal_members.length > 0) {
                                    deal.deal_members.forEach((m: any) => {
                                        if (m.profiles) {
                                            // Avoid duplicates if owner is also in members (shouldn't happen with correct logic but good to be safe)
                                            // Since we don't have IDs easily for 'deal.owner' alias from the specific query sometimes, we just append.
                                            // Visual duplication is better than missing.
                                            owners.push({ ...m.profiles, id: m.user_id, isPrimary: false });
                                        }
                                    });
                                }

                                if (owners.length === 0) return null;

                                return owners.slice(0, 4).map((user: any, idx: number) => (
                                    <div key={idx} className="relative group/avatar" title={user.full_name || "Sem Nome"}>
                                        {user.avatar_url ? (
                                            <img
                                                src={user.avatar_url}
                                                alt={user.full_name}
                                                className={`h-6 w-6 rounded-full border-2 border-white object-cover shadow-sm ${user.isPrimary ? 'z-10' : 'z-0'}`}
                                            />
                                        ) : (
                                            <div className={`h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shadow-sm ${user.isPrimary ? 'bg-indigo-100 text-indigo-700 z-10' : 'bg-gray-100 text-gray-600 z-0'}`}>
                                                {(user.full_name || "?").charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                ));
                            })()}

                            {/* Overflow Indicator */}
                            {(() => {
                                const count = (deal.owner ? 1 : 0) + (deal.deal_members?.length || 0);
                                if (count > 4) {
                                    return (
                                        <div className="h-6 w-6 rounded-full border-2 border-white bg-gray-50 flex items-center justify-center text-[8px] font-bold text-gray-500 shadow-sm z-20">
                                            +{count - 4}
                                        </div>
                                    )
                                }
                            })()}
                        </div>
                        </div>
                    </div>
                </div>
            )}
        </Draggable>

        {/* Modal de motivo de perda (portal; fora do card pra clique nao navegar) */}
        <LossReasonDialog
            open={showLostDialog}
            onOpenChange={setShowLostDialog}
            onConfirm={handleConfirmLost}
        />
        </>
    );
}
