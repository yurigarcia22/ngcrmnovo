"use client";

import { Draggable } from "@hello-pangea/dnd";
import Link from "next/link";
import { MessageCircle, Image as ImageIcon, FileText, Mic, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    deal: any;
    index: number;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (dealId: string) => void;
}

/**
 * Card compacto usado APENAS em stages com is_inbox=true.
 *
 * Mostra: nome do contato, telefone, preview da ultima mensagem
 * recebida e tempo desde o ultimo update.
 *
 * Funciona como onboarding visual do conceito "Lead Entrada":
 * a coluna virou uma especie de inbox de WhatsApp dentro do kanban.
 */
export default function InboxKanbanCard({
    deal,
    index,
    isSelectionMode,
    isSelected,
    onToggleSelection,
}: Props) {
    const contactName = deal?.contacts?.name ?? deal?.title ?? "Sem nome";
    const phone = deal?.contacts?.phone ?? "";
    const lastMsg = deal?.last_message;

    const previewText = renderPreview(lastMsg);
    const previewTime = lastMsg?.created_at
        ? formatRelativeTime(lastMsg.created_at)
        : null;
    const direction = lastMsg?.direction;

    return (
        <Draggable draggableId={String(deal.id)} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={provided.draggableProps.style}
                    className={cn(
                        "group relative bg-white rounded-lg border transition-all",
                        snapshot.isDragging
                            ? "shadow-xl border-indigo-300 rotate-1"
                            : "border-slate-200 hover:border-indigo-300 hover:shadow-sm",
                        isSelected && "border-indigo-500 ring-2 ring-indigo-200"
                    )}
                >
                    {isSelectionMode && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleSelection?.(deal.id);
                            }}
                            className="absolute top-2 right-2 z-10 w-4 h-4 border-2 border-current rounded text-indigo-500 bg-white flex items-center justify-center"
                        >
                            {isSelected && <div className="w-2 h-2 bg-current rounded-[1px]" />}
                        </button>
                    )}

                    <Link
                        href={`/deals/${deal.id}`}
                        className="block px-3 py-2.5"
                    >
                        {/* Avatar + Nome + Tempo */}
                        <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {initials(contactName)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-slate-900 truncate">
                                        {contactName}
                                    </span>
                                    {previewTime && (
                                        <span className="text-[10px] text-slate-400 shrink-0">
                                            {previewTime}
                                        </span>
                                    )}
                                </div>
                                {phone && (
                                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                        {formatPhone(phone)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Preview da ultima mensagem */}
                        {lastMsg ? (
                            <div className="mt-2 pl-[42px]">
                                <div
                                    className={cn(
                                        "text-xs text-slate-600 flex items-start gap-1.5",
                                        direction === "outbound" && "italic text-slate-500"
                                    )}
                                >
                                    {direction === "outbound" && (
                                        <span className="text-[10px] font-semibold text-emerald-600">
                                            voce:
                                        </span>
                                    )}
                                    {previewText}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 pl-[42px] text-[11px] text-slate-400 italic">
                                Sem mensagens
                            </div>
                        )}
                    </Link>
                </div>
            )}
        </Draggable>
    );
}

// =====================================================================
// Helpers
// =====================================================================

function initials(name: string): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPhone(phone: string): string {
    if (!phone) return "";
    const d = phone.replace(/\D/g, "");
    if (d.length === 13 && d.startsWith("55")) {
        return `+55 ${d.substring(2, 4)} ${d.substring(4, 9)}-${d.substring(9)}`;
    }
    if (d.length === 12 && d.startsWith("55")) {
        return `+55 ${d.substring(2, 4)} ${d.substring(4, 8)}-${d.substring(8)}`;
    }
    return phone;
}

function formatRelativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.round((now - then) / 1000);
    if (diffSec < 60) return "agora";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function renderPreview(msg: any): React.ReactNode {
    if (!msg) return null;
    const type = msg.type ?? "text";

    if (type === "image") {
        return (
            <span className="flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> Imagem
            </span>
        );
    }
    if (type === "audio") {
        return (
            <span className="flex items-center gap-1">
                <Mic className="w-3 h-3" /> Audio
            </span>
        );
    }
    if (type === "video") {
        return (
            <span className="flex items-center gap-1">
                <Video className="w-3 h-3" /> Video
            </span>
        );
    }
    if (type === "document" || type === "pdf") {
        return (
            <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" /> Documento
            </span>
        );
    }
    if (type === "system") {
        return (
            <span className="text-slate-400">
                {msg.content}
            </span>
        );
    }

    // Texto: trunca em 80 chars
    const text = String(msg.content ?? "").trim();
    if (text.length > 80) return text.substring(0, 80) + "...";
    return text || <em className="text-slate-400">(vazio)</em>;
}
