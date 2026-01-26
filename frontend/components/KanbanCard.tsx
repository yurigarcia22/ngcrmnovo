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
}

export default function KanbanCard({ deal, index, fields, onClick }: KanbanCardProps) {
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
                    onClick={() => router.push(`/deals/${deal.id}`)}
                    style={{ ...provided.draggableProps.style }}
                    className={`
                        group relative w-full mb-3 rounded-2xl p-5 cursor-pointer transition-all duration-300
                        bg-[#0f172a] border border-gray-800 shadow-md
                        hover:shadow-2xl hover:translate-y-[-2px] hover:bg-[#1e293b] hover:border-indigo-500/30
                        ${snapshot.isDragging ? "shadow-2xl ring-2 ring-indigo-500 rotate-2 scale-105 z-50 z-[999]" : ""}
                        ${deal.status === 'lost' ? 'opacity-60 grayscale' : ''}
                    `}
                >
                    {/* Header: Label, Title & Actions */}
                    <div className="flex justify-between items-start gap-4 mb-3">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                            {/* Restored "Light Blue Emoji" Label */}
                            <div className="flex items-center gap-1.5 text-indigo-400 mb-0.5">
                                <Briefcase size={12} strokeWidth={2.5} />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400/80">Oportunidade</span>
                            </div>

                            {/* Title Section - Cleaned and allowed to wrap */}
                            <h4 className="text-[15px] font-bold text-gray-100 leading-snug line-clamp-3" title={deal.title}>
                                {cleanTitle(deal.title)}
                            </h4>
                        </div>

                        {/* Context Menu (Actions) */}
                        <div onClick={(e) => e.stopPropagation()} className="-mr-2 -mt-1 shrink-0">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1.5 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                        <MoreHorizontal size={18} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 bg-[#0f172a] border border-gray-800 text-gray-300 shadow-2xl rounded-xl p-1.5 z-[9999]">
                                    <DropdownMenuLabel className="text-xs text-gray-500 font-bold uppercase tracking-widest px-2 py-1.5">Gerenciar</DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-gray-800 my-1" />
                                    <DropdownMenuItem onClick={handleMarkAsWon} className="text-emerald-400 text-sm py-2 px-2 cursor-pointer hover:bg-emerald-900/20 rounded-md transition-colors">
                                        <Trophy className="mr-2 h-4 w-4" />
                                        <span>Marcar como Ganho</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleMarkAsLost} className="text-orange-400 text-sm py-2 px-2 cursor-pointer hover:bg-orange-900/20 rounded-md transition-colors">
                                        <XCircle className="mr-2 h-4 w-4" />
                                        <span>Marcar como Perdido</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-gray-800 my-1" />
                                    <DropdownMenuItem onClick={handleDelete} className="text-red-400 text-sm py-2 px-2 cursor-pointer hover:bg-red-900/20 rounded-md transition-colors">
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
                            <span className="text-lg font-bold text-emerald-400 tracking-tight">
                                R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}

                    {/* Contact Badge (Pill) */}
                    {deal.contacts?.name && (
                        <div className="mb-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e293b] border border-gray-700/50 text-gray-300 hover:text-white hover:border-indigo-500/50 transition-colors w-auto max-w-full">
                                <User size={12} className="text-indigo-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-xs font-medium truncate">{deal.contacts.name}</span>
                            </div>
                        </div>
                    )}

                    {/* Separator */}
                    <div className="h-px w-full bg-gray-800 mb-3" />

                    {/* Footer: Date & Avatar */}
                    <div className="flex items-center justify-between text-gray-500">
                        <div className="flex items-center gap-1.5 group-hover:text-gray-400 transition-colors">
                            <Calendar size={13} strokeWidth={2.5} />
                            <span className="text-[11px] font-medium tracking-wide">
                                {new Date(deal.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                            </span>
                        </div>

                        <div className="flex items-center">
                            <div className="h-6 w-6 rounded-full bg-[#1e293b] border border-gray-700 flex items-center justify-center text-gray-500 shadow-sm">
                                <User size={12} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Draggable>
    );
}
