import { Sun, Sunset, AlertCircle, CheckCircle } from "lucide-react";

interface FollowUpMetricsProps {
    metrics: {
        totalHoje: number;
        manha: number;
        tarde: number;
        atrasados: number;
        concluidosHoje: number;
        semFollowup: number;
    }
}

export function FollowUpMetrics({ metrics }: FollowUpMetricsProps) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex flex-wrap items-stretch divide-x divide-slate-100">
                {/* Métrica primária — Para Hoje */}
                <div className="flex flex-col justify-center px-5 py-4 min-w-[140px]">
                    <span className="text-sm font-semibold text-slate-700">Para hoje</span>
                    <span className="text-4xl font-extrabold text-slate-900 leading-tight">{metrics.totalHoje}</span>
                    <span className="text-xs text-slate-500">follow-ups agendados</span>
                </div>

                {/* Manhã */}
                <div className="flex items-center gap-3 px-5 py-4 min-w-[120px]">
                    <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                        <Sun className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-slate-800 leading-tight">{metrics.manha}</span>
                        <span className="text-xs font-medium text-slate-600">Manhã</span>
                    </div>
                </div>

                {/* Tarde */}
                <div className="flex items-center gap-3 px-5 py-4 min-w-[120px]">
                    <div className="h-9 w-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Sunset className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-slate-800 leading-tight">{metrics.tarde}</span>
                        <span className="text-xs font-medium text-slate-600">Tarde</span>
                    </div>
                </div>

                {/* Atrasados */}
                <div className="flex items-center gap-3 px-5 py-4 min-w-[120px]">
                    <div className="h-9 w-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                        <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-rose-700 leading-tight">{metrics.atrasados}</span>
                        <span className="text-xs font-medium text-rose-700">Atrasados</span>
                    </div>
                </div>

                {/* Concluídos */}
                <div className="flex items-center gap-3 px-5 py-4 min-w-[120px]">
                    <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                        <CheckCircle className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-slate-800 leading-tight">{metrics.concluidosHoje}</span>
                        <span className="text-xs font-medium text-slate-600">Criados/feitos</span>
                    </div>
                </div>

                {/* Sem agendamento */}
                <div className="flex items-center gap-3 px-5 py-4 min-w-[120px]">
                    <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-slate-800 leading-tight">{metrics.semFollowup}</span>
                        <span className="text-xs font-medium text-slate-600">Sem agendamento</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
