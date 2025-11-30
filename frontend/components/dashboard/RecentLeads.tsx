import { User, ArrowRight } from "lucide-react";
import Link from "next/link";

interface RecentLeadsProps {
    leads: {
        id: string;
        title: string;
        value: number;
        contactName: string;
        stageName: string;
        updatedAt: string;
    }[];
}

export default function RecentLeads({ leads }: RecentLeadsProps) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Leads Recentes</h3>
                <Link href="/leads" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    Ver todos <ArrowRight size={14} />
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-gray-200">
                {leads.length === 0 ? (
                    <p className="text-gray-400 text-center py-10">Nenhum lead recente.</p>
                ) : (
                    leads.map((lead) => (
                        <div key={lead.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm">
                                {lead.contactName?.charAt(0).toUpperCase() || <User size={16} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-800 text-sm truncate">{lead.contactName || "Sem nome"}</h4>
                                <p className="text-xs text-gray-500 truncate">{lead.title}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-gray-700">
                                    {lead.value > 0 ? `R$ ${lead.value.toLocaleString('pt-BR', { notation: "compact" })}` : "-"}
                                </p>
                                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {lead.stageName}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
