import { Card, CardContent } from "@/components/ui/card";
import { Phone, MessageSquare, Mail, RefreshCw, Calendar, CheckCircle2, MoreVertical, AlertCircle, Clock } from "lucide-react";

interface FollowUpRowProps {
    followup: any;
    onActionClick: (followupId: string, actionType: string) => void;
    onRowClick?: (followup: any) => void;
}

export function FollowUpRow({ followup, onActionClick, onRowClick }: FollowUpRowProps) {
    const isAtrasado = followup.status === 'atrasado';

    // Determine priority color
    let priorityColor = "bg-slate-100 text-slate-600";
    if (followup.prioridade === 'alta') priorityColor = "bg-orange-100 text-orange-700";
    if (followup.prioridade === 'urgente') priorityColor = "bg-red-100 text-red-700";

    const leadName = followup.cold_leads?.nome || "Sem Nome";
    const leadCompany = followup.cold_leads?.nicho || "Sem Nicho";
    const leadPhone = followup.cold_leads?.telefone || "Sem Telefone";

    return (
        <div className={`group flex items-center justify-between p-3 mb-2 rounded-lg border transition-all hover:shadow-md cursor-pointer ${isAtrasado ? 'bg-red-50/50 border-red-100' : 'bg-white border-slate-200'}`}>

            {/* Left Col: Status & Info */}
            <div className="flex items-center gap-4 flex-1 overflow-hidden" onClick={() => onRowClick?.(followup)}>
                <div className={`w-2 h-10 rounded-full ${isAtrasado ? 'bg-red-500' : 'bg-blue-500'}`}></div>

                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 truncate text-sm">{leadName}</span>
                        <span className="text-xs text-slate-500 truncate hidden sm:inline-block">• {leadCompany}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${priorityColor}`}>
                            {followup.prioridade}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400" /> {leadPhone}
                        </span>

                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {followup.horario_especifico ? followup.horario_especifico.substring(0, 5) : 'Qualquer horário'}
                        </span>

                        <span className="flex items-center gap-1 text-slate-400 italic truncate max-w-[200px]">
                            - {followup.tipo_acao.replace('_', ' ')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Right Col: Quick Actions */}
            <div className="flex items-center gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                {/* MicroSIP or Quick Call trigger */}
                <button
                    onClick={() => onActionClick(followup.id, 'call')}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors shadow-sm bg-white border border-slate-100"
                    title="Realizar Ligação"
                >
                    <Phone className="w-4 h-4" />
                </button>

                <button
                    onClick={() => onActionClick(followup.id, 'whatsapp')}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors shadow-sm bg-white border border-slate-100"
                    title="Enviar WhatsApp"
                >
                    <MessageSquare className="w-4 h-4" />
                </button>

                <div className="w-px h-6 bg-slate-200 mx-1"></div>

                <button
                    onClick={() => onActionClick(followup.id, 'complete')}
                    className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-md transition-all font-semibold text-xs flex items-center gap-1"
                >
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="hidden sm:inline-block">Concluir</span>
                </button>
            </div>
        </div>
    );
}

// -------------------------------------------------------------
// MAIN BOARD COMPONENT
// -------------------------------------------------------------

export function FollowUpBoard({ followups, onActionClick, onRowClick }: { followups: any[], onActionClick: (id: string, action: string) => void, onRowClick?: (followup: any) => void }) {

    // Simple grouping logic
    const atrasados = followups.filter(f => f.status === 'atrasado');
    const manha = followups.filter(f => f.status !== 'atrasado' && f.periodo === 'manha');
    const tarde = followups.filter(f => f.status !== 'atrasado' && (f.periodo === 'tarde' || f.periodo === 'noite' || f.periodo === 'qualquer'));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full p-2 place-content-start">

            {/* Bloco: Atrasados */}
            <div className="flex flex-col bg-slate-50/50 rounded-xl p-4 border border-slate-200 shadow-sm h-full max-h-[70vh]">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                    <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Atrasados</h3>
                        <p className="text-xs text-slate-500 font-medium">{atrasados.length} pendências para agir AGORA</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {atrasados.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                            <CheckCircle2 className="w-6 h-6 mb-2 text-slate-300" />
                            <span className="text-sm">Nenhum atraso!</span>
                        </div>
                    ) : (
                        atrasados.map((f, i) => <FollowUpRow key={i} followup={f} onActionClick={onActionClick} onRowClick={onRowClick} />)
                    )}
                </div>
            </div>

            {/* Bloco: Manhã */}
            <div className="flex flex-col bg-white rounded-xl p-4 border border-slate-200 shadow-sm h-full max-h-[70vh]">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                    <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Manhã (08h - 12h)</h3>
                        <p className="text-xs text-slate-500 font-medium">{manha.length} contatos programados</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {manha.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                            <span className="text-sm">Nada para a manhã.</span>
                        </div>
                    ) : (
                        manha.map((f, i) => <FollowUpRow key={i} followup={f} onActionClick={onActionClick} onRowClick={onRowClick} />)
                    )}
                </div>
            </div>

            {/* Bloco: Tarde/Noite */}
            <div className="flex flex-col bg-white rounded-xl p-4 border border-slate-200 shadow-sm h-full max-h-[70vh]">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                    <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Tarde (13h - 18h+)</h3>
                        <p className="text-xs text-slate-500 font-medium">{tarde.length} contatos programados</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {tarde.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                            <span className="text-sm">Nada para a tarde.</span>
                        </div>
                    ) : (
                        tarde.map((f, i) => <FollowUpRow key={i} followup={f} onActionClick={onActionClick} onRowClick={onRowClick} />)
                    )}
                </div>
            </div>

        </div>
    );
}
