'use client';

import { useState, useEffect } from 'react';
import { ColdLead } from '@/types/cold-lead';
import {
    ChevronDown, ChevronRight, Phone, MapPin, Globe, Instagram,
    Trash2, Clock, Trophy, Frown, Inbox,
} from 'lucide-react';

interface Stage {
    id: number | string;
    name: string;
    position: number;
    color?: string | null;
    is_inbox?: boolean;
    is_won?: boolean;
    is_lost?: boolean;
}

interface StageGroupProps {
    stage: Stage;
    leads: ColdLead[];
    onCallClick: (lead: ColdLead) => void;
    onMoveStage: (leadId: string, newStageId: number | string) => void;
    allStages: Stage[];
    selectedLeads?: string[];
    onToggleSelection?: (id: string) => void;
    isSelectionMode?: boolean;
    onDeleteClick?: (id: string) => void;
    followupLeadIds?: Set<string>;
}

export function StageGroup({
    stage, leads, onCallClick, onMoveStage, allStages,
    selectedLeads = [], onToggleSelection, isSelectionMode = false,
    onDeleteClick, followupLeadIds,
}: StageGroupProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [visibleCount, setVisibleCount] = useState(30);

    useEffect(() => {
        setVisibleCount(30);
    }, [leads.length]);

    const stageBg = stage.is_won ? "bg-emerald-500"
        : stage.is_lost ? "bg-rose-500"
        : stage.is_inbox ? "bg-indigo-500"
        : (stage.color ?? "bg-slate-500");

    return (
        <div className="mb-4">
            <div
                className="flex items-center gap-2 py-2 cursor-pointer group hover:bg-slate-50 rounded-md px-2 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <button
                    className="text-slate-500 hover:text-slate-700 mr-1 flex items-center justify-center h-9 w-9 rounded-md hover:bg-slate-100 transition-colors -ml-1.5"
                    aria-label={isExpanded ? `Recolher ${stage.name}` : `Expandir ${stage.name}`}
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: typeof stageBg === 'string' && stageBg.startsWith('#') ? stageBg : undefined }}
                    aria-hidden
                />
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    {stage.is_inbox && <Inbox className="h-3.5 w-3.5 text-indigo-500" />}
                    {stage.is_won && <Trophy className="h-3.5 w-3.5 text-emerald-500" />}
                    {stage.is_lost && <Frown className="h-3.5 w-3.5 text-rose-500" />}
                    {stage.name}
                </h2>
                <span className="text-xs text-slate-500 ml-1">({leads.length})</span>
            </div>

            {isExpanded && (
                <div className="space-y-1.5 ml-6 mt-2">
                    {leads.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">Nenhum lead nesta etapa</p>
                    ) : (
                        leads.slice(0, visibleCount).map((lead) => {
                            const isSelected = selectedLeads.includes(lead.id);
                            const hasFollowup = followupLeadIds?.has(lead.id);
                            return (
                                <div
                                    key={lead.id}
                                    onClick={() => { if (!isSelectionMode) onCallClick(lead); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all cursor-pointer ${
                                        isSelected
                                            ? "bg-indigo-50 border-indigo-200"
                                            : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm"
                                    }`}
                                >
                                    {isSelectionMode && onToggleSelection && (
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => onToggleSelection(lead.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="shrink-0"
                                        />
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-slate-800 truncate">
                                                {lead.nome || lead.telefone}
                                            </span>
                                            {hasFollowup && (
                                                <Clock className="h-3 w-3 text-amber-500 shrink-0" aria-label="Follow-up agendado" />
                                            )}
                                            {lead.nicho && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                                                    {lead.nicho}
                                                </span>
                                            )}
                                            {(lead.tentativas ?? 0) > 0 && (
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold shrink-0 flex items-center gap-0.5"
                                                    title={`Cadência: ${lead.tentativas} tentativa(s) de contato`}
                                                >
                                                    <Phone className="h-2.5 w-2.5" />
                                                    {lead.tentativas}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                            <Phone className="h-3 w-3" />
                                            {lead.telefone}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        {lead.site_url && (
                                            <a href={lead.site_url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} aria-label="Abrir site" className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors">
                                                <Globe className="h-4 w-4" />
                                            </a>
                                        )}
                                        {lead.instagram_url && (
                                            <a href={lead.instagram_url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} aria-label="Abrir Instagram" className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:text-pink-500 hover:bg-slate-100 transition-colors">
                                                <Instagram className="h-4 w-4" />
                                            </a>
                                        )}
                                        {lead.google_meu_negocio_url && (
                                            <a href={lead.google_meu_negocio_url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} aria-label="Abrir Google Meu Negócio" className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-slate-100 transition-colors">
                                                <MapPin className="h-4 w-4" />
                                            </a>
                                        )}

                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCallClick(lead); }}
                                            className="ml-1 px-3 h-9 text-[11px] font-semibold rounded-md bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1"
                                            title="Abrir lead"
                                        >
                                            <Phone className="h-3 w-3" />
                                            Abrir
                                        </button>

                                        {/* Move to stage */}
                                        <select
                                            value={String(stage.id)}
                                            onChange={(e) => onMoveStage(lead.id, isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label="Mover lead para etapa"
                                            className="text-[11px] h-9 border border-slate-200 rounded px-1.5 bg-white text-slate-600 hover:border-indigo-300 cursor-pointer"
                                        >
                                            {allStages.map((s) => (
                                                <option key={s.id} value={String(s.id)}>
                                                    → {s.name}
                                                </option>
                                            ))}
                                        </select>

                                        {onDeleteClick && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteClick(lead.id); }}
                                                className="flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                                                aria-label="Excluir lead"
                                                title="Excluir"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {leads.length > visibleCount && (
                        <button
                            onClick={() => setVisibleCount((v) => v + 30)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold ml-2 mt-1"
                        >
                            Mostrar mais ({leads.length - visibleCount} restantes)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
