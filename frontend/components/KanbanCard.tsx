import { Draggable } from "@hello-pangea/dnd";
import { User, Link as LinkIcon, MessageCircle, Calendar, Package, MoreHorizontal, Trophy, XCircle, Trash2, Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAsWon, markAsLost, deleteDeal } from "@/app/actions";
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

    const handleMarkAsWon = async (e: React.MouseEvent) => {
        e.stopPropagation();

        // Confetti Effect
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

        await markAsWon(deal.id);
    };

    const handleMarkAsLost = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Marcar lead como PERDIDO?")) {
            await markAsLost(deal.id);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Tem certeza que deseja EXCLUIR este lead? Esta ação é irreversível.")) {
            await deleteDeal(deal.id);
        }
    };

    // Clean title function to remove "Oportunidade: " prefix if present
    const cleanTitle = (title: string) => {
        return title.replace(/^Oportunidade:\s*/i, '');
    };

    return (
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
                        ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10' : 'border-gray-200 hover:shadow-lg hover:translate-y-[-2px] hover:border-blue-300'}
                        ${snapshot.isDragging ? "shadow-2xl ring-2 ring-blue-500 rotate-2 scale-105 z-50 z-[999]" : ""}
                        ${deal.status === 'lost' ? 'opacity-60 grayscale' : ''}
                    `}
                >
                    {/* Selection Checkbox Overlay */}
                    {isSelectionMode && (
                        <div className="absolute top-4 right-4 z-20">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                                {isSelected && <User size={12} className="text-white" />}
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

                    {/* Value */}
                    {deal.value > 0 && (
                        <div className="mb-4">
                            <span className="text-lg font-bold text-emerald-600 tracking-tight">
                                R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}

                    {/* Contact Badge (Pill) */}
                    {deal.contacts?.name && (
                        <div className="mb-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-blue-200 transition-colors w-auto max-w-full">
                                <User size={12} className="text-gray-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-xs font-medium truncate">{deal.contacts.name}</span>
                            </div>
                        </div>
                    )}

                    {/* Separator */}
                    <div className="h-px w-full bg-gray-100 mb-3" />

                    {/* Footer: Date & Avatar */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-3">
                            {/* Creation Date */}
                            <div className="flex items-center gap-1.5 text-gray-400 group-hover:text-gray-500 transition-colors" title="Data de criação">
                                <Calendar size={13} strokeWidth={2.5} />
                                <span className="text-[11px] font-medium tracking-wide">
                                    {new Date(deal.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                                </span>
                            </div>

                            {/* Next Meeting Date (if any) */}
                            {(() => {
                                const incompleteTasks = deal.tasks?.filter((t: any) => !t.is_completed && t.due_date) || [];
                                if (incompleteTasks.length === 0) return null;

                                // Sort by date ascending to find the next one
                                incompleteTasks.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
                                const nextTask = incompleteTasks[0];
                                const nextDate = new Date(nextTask.due_date);
                                const isToday = new Date().toDateString() === nextDate.toDateString();
                                const isLate = nextDate < new Date() && !isToday;

                                return (
                                    <div
                                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isLate ? 'bg-red-50 text-red-600 border-red-100' : isToday ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}
                                        title={`Próxima reunião/tarefa: ${nextTask.description || 'Sem descrição'}`}
                                    >
                                        <Calendar size={10} strokeWidth={3} />
                                        <span>
                                            {nextDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                                        </span>
                                    </div>
                                );
                            })()}
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
            )}
        </Draggable>
    );
}
