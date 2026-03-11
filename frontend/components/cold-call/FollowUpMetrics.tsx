import { Card, CardContent } from "@/components/ui/card";
import { Clock, Sun, Sunset, AlertCircle, CheckCircle } from "lucide-react";

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
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
            {/* Total Hoje */}
            <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
                <CardContent className="p-4 flex flex-col justify-center h-full relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Clock className="w-8 h-8 text-blue-900" />
                    </div>
                    <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Para Hoje</span>
                    <span className="text-3xl font-extrabold text-blue-900">{metrics.totalHoje}</span>
                </CardContent>
            </Card>

            {/* Manhã */}
            <Card className="border border-slate-200 shadow-sm bg-white">
                <CardContent className="p-4 flex items-center justify-between h-full">
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Manhã</span>
                        <span className="text-2xl font-bold text-slate-800">{metrics.manha}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                        <Sun className="w-5 h-5" />
                    </div>
                </CardContent>
            </Card>

            {/* Tarde */}
            <Card className="border border-slate-200 shadow-sm bg-white">
                <CardContent className="p-4 flex items-center justify-between h-full">
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tarde</span>
                        <span className="text-2xl font-bold text-slate-800">{metrics.tarde}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <Sunset className="w-5 h-5" />
                    </div>
                </CardContent>
            </Card>

            {/* Atrasados */}
            <Card className="border border-red-200 shadow-sm bg-red-50 relative overflow-hidden group hover:bg-red-100 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between h-full">
                    <div className="flex flex-col relative z-10">
                        <span className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Atrasados</span>
                        <span className="text-3xl font-black text-red-700">{metrics.atrasados}</span>
                    </div>
                    <div className="relative z-10">
                        <AlertCircle className="w-8 h-8 text-red-500" strokeWidth={2.5} />
                    </div>
                    {/* Decorative Background Icon */}
                    <AlertCircle className="absolute -bottom-4 -right-4 w-24 h-24 text-red-500 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity" />
                </CardContent>
            </Card>

            {/* Concluídos */}
            <Card className="border border-emerald-200 shadow-sm bg-emerald-50 relative overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between h-full">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Criados/Feitos</span>
                        <span className="text-2xl font-bold text-emerald-800">{metrics.concluidosHoje}</span>
                    </div>
                    <div>
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                    </div>
                </CardContent>
            </Card>

            {/* Sem Follow-up (Alerta) */}
            <Card className="border border-amber-200 shadow-sm bg-amber-50">
                <CardContent className="p-4 flex flex-col justify-center h-full">
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Sem Agendamento
                    </span>
                    <span className="text-2xl font-bold text-amber-800">{metrics.semFollowup}</span>
                </CardContent>
            </Card>
        </div>
    );
}
