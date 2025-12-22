'use client';

import { useState } from 'react';
import { ColdLead, ColdLeadStatus } from '@/types/cold-lead';
import { Button, Badge } from '@/components/ui/simple-ui';
import {
    ChevronDown,
    ChevronRight,
    Phone,
    MapPin,
    Globe,
    Instagram,
    MoreHorizontal,
    ChevronDownCircle
} from 'lucide-react';

interface StatusGroupProps {
    status: ColdLeadStatus;
    leads: ColdLead[];
    colorClass: string;
    onCallClick: (lead: ColdLead) => void;
    onStatusChange: (leadId: string, newStatus: ColdLeadStatus) => void;
    selectedLeads?: string[];
    onToggleSelection?: (id: string) => void;
}

export function StatusGroup({ status, leads, colorClass, onCallClick, onStatusChange, selectedLeads = [], onToggleSelection }: StatusGroupProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const statusLabels: Record<ColdLeadStatus, string> = {
        'novo_lead': 'NOVO LEAD',
        'lead_qualificado': 'LEAD QUALIFICADO',
        'ligacao_feita': 'LIGAÇÃO FEITA',
        'contato_realizado': 'CONTATO REALIZADO',
        'contato_decisor': 'CONTATO COM DECISOR',
        'reuniao_marcada': 'REUNIÃO MARCADA',
        'numero_inexistente': 'NÚMERO INEXISTENTE'
    };

    const statusOptions: ColdLeadStatus[] = [
        'novo_lead',
        'lead_qualificado',
        'ligacao_feita',
        'contato_realizado',
        'contato_decisor',
        'reuniao_marcada'
    ];

    const toggleSelectAllGroup = (e: React.MouseEvent) => {
        e.stopPropagation();
        // If all selected, deselect all. Otherwise, select all.
        const allSelected = leads.every(l => selectedLeads.includes(l.id));
        leads.forEach(l => {
            if (allSelected) {
                if (selectedLeads.includes(l.id)) onToggleSelection(l.id);
            } else {
                if (!selectedLeads.includes(l.id)) onToggleSelection(l.id);
            }
        });
    };

    return (
        <div className="mb-4">
            {/* Group Header */}
            <div
                className="flex items-center gap-2 py-2 cursor-pointer group hover:bg-slate-50 rounded-md px-2 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <button className="text-slate-400 hover:text-slate-600 mr-1" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {onToggleSelection && (
                        <input
                            type="checkbox"
                            className="mr-2 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                            checked={leads.length > 0 && leads.every(l => selectedLeads.includes(l.id))}
                            // indeterminate={leads.some(l => selectedLeads.includes(l.id)) && !leads.every(l => selectedLeads.includes(l.id))} // React generic input doesn't support indeterminate prop easily without ref, skipping for simplicity
                            onChange={toggleSelectAllGroup}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>

                <Badge variant="outline" className={`${colorClass} text-white border-none px-3 py-1 font-bold uppercase tracking-wide text-xs`}>
                    {statusLabels[status]}
                </Badge>

                <span className="text-slate-500 text-sm font-medium">{leads.length}</span>

                <div className="flex-1 border-b border-dashed border-slate-200 mx-4 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 text-slate-400 text-xs">
                    + Adicionar Tarefa
                </Button>
            </div>

            {/* Group Body */}
            {isExpanded && (
                <div className="space-y-1 pl-2">
                    {leads.map(lead => {
                        const isSelected = selectedLeads.includes(lead.id);
                        return (
                            <div
                                key={lead.id}
                                className={`group flex items-center gap-4 py-2 px-4 bg-white border rounded-md hover:shadow-sm transition-all ${isSelected ? 'border-blue-400 bg-blue-50/30' : 'border-slate-100 hover:border-blue-100'}`}
                            >
                                { /* Selection Checkbox */}
                                { /* Selection Checkbox */}
                                {onToggleSelection && (
                                    <div className="shrink-0 mr-2">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                                            checked={isSelected}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => { onToggleSelection(lead.id); }}
                                        />
                                    </div>
                                )}

                                {/* Status Dropdown / "Setinha" */}
                                <div className="relative group/status shrink-0">
                                    <div className={`h-4 w-4 rounded-full ${colorClass} cursor-pointer flex items-center justify-center`}>
                                        <ChevronDownCircle className="h-3 w-3 text-white opacity-0 group-hover/status:opacity-100 transition-opacity" />
                                    </div>
                                    <select
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        value={lead.status}
                                        onChange={(e) => onStatusChange(lead.id, e.target.value as ColdLeadStatus)}
                                    >
                                        {statusOptions.map(opt => (
                                            <option key={opt} value={opt}>{statusLabels[opt]}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Lead Name */}
                                <span className="font-medium text-slate-700 min-w-[200px] truncate cursor-pointer hover:text-blue-600" onClick={() => onCallClick(lead)}>
                                    {lead.nome}
                                </span>

                                {/* Nicho Badge */}
                                <span className="hidden md:inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                    {lead.nicho}
                                </span>

                                {/* Contact Info */}
                                <div className="flex items-center gap-2 text-slate-500 text-sm flex-1">
                                    <Phone className="h-3 w-3" />
                                    <span className="font-mono text-xs">{lead.telefone}</span>
                                </div>

                                {/* Links */}
                                <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                    {lead.google_meu_negocio_url && <a href={lead.google_meu_negocio_url} target="_blank" className="text-blue-500 hover:scale-110"><MapPin className="h-3 w-3" /></a>}
                                    {lead.site_url && <a href={lead.site_url} target="_blank" className="text-cyan-500 hover:scale-110"><Globe className="h-3 w-3" /></a>}
                                    {lead.instagram_url && <a href={lead.instagram_url} target="_blank" className="text-pink-500 hover:scale-110"><Instagram className="h-3 w-3" /></a>}
                                </div>

                                {/* Cadence / Attempts */}
                                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-100 text-slate-500 text-xs font-medium" title="Tentativas de contato">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-400">Cad:</span>
                                    <span>{lead.tentativas || 0}</span>
                                </div>

                                {/* Next Call */}
                                <div className="text-xs text-slate-400 min-w-[80px] text-right">
                                    {lead.proxima_ligacao ? new Date(lead.proxima_ligacao).toLocaleDateString() : ''}
                                </div>

                                {/* Action */}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 w-7 p-0 rounded-full md:w-auto md:h-8 md:px-3 md:rounded-md bg-transparent border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                                    onClick={() => onCallClick(lead)}
                                >
                                    <Phone className="h-3 w-3 md:mr-2" />
                                    <span className="hidden md:inline">Ligar</span>
                                </Button>

                            </div>
                        );
                    })}
                    {leads.length === 0 && (
                        <div className="py-2 pl-10 text-xs text-slate-400 italic">
                            Nenhum lead nesta etapa.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
