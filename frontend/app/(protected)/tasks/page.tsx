"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { CheckSquare, Square, Calendar, User, Briefcase, Loader2, Clock } from "lucide-react";
import { toggleTask } from "@/app/actions";
import DealModal from "@/components/DealModal";
import { ColdLeadModal } from "@/components/cold-call/ColdLeadModal";
import { Phone } from "lucide-react";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TasksPage() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
    const [selectedColdLead, setSelectedColdLead] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);

    useEffect(() => {
        fetchTasks();
        fetchTeam();
    }, []);

    async function fetchTeam() {
        const { data } = await supabase.from('profiles').select('*').eq('is_active', true);
        if (data) setTeamMembers(data);
    }

    async function fetchTasks() {
        setLoading(true);
        const { data, error } = await supabase
            .from("tasks")
            .select(`
                *,
                deals (
                    id,
                    title,
                    value,
                    contacts (
                        id,
                        name,
                        phone
                    )
                ),
                cold_leads (
                    id,
                    nome,
                    telefone,
                    nicho,
                    responsavel_id,
                    site_url,
                    instagram_url,
                    google_meu_negocio_url,
                    tentativas,
                    ultimo_resultado
                )
            `)
            .eq("is_completed", false)
            .order("due_date", { ascending: true });

        if (error) {
            console.error("Erro ao buscar tarefas:", error);
        } else {
            setTasks(data || []);
        }
        setLoading(false);
    }

    async function handleToggle(taskId: string) {
        // Optimistic Update
        setTasks(prev => prev.filter(t => t.id !== taskId));

        const result = await toggleTask(taskId, true);
        if (!result.success) {
            alert("Erro ao concluir tarefa");
            fetchTasks(); // Revert
        }
    }

    function openDeal(deal: any) {
        if (deal) {
            // Normaliza a estrutura para o DealModal se necessário
            const dealData = {
                ...deal,
                contacts: deal.contacts // Já está na estrutura correta pelo select
            };
            setSelectedDeal(dealData);
            setIsModalOpen(true);
        }
    }

    // Agrupamento
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const overdueTasks = tasks.filter(t => new Date(t.due_date) < now);
    const todayTasks = tasks.filter(t => {
        const d = new Date(t.due_date);
        return d >= now && d < tomorrowStart;
    });
    const upcomingTasks = tasks.filter(t => new Date(t.due_date) >= tomorrowStart);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7f8] text-gray-800 font-sans">

            <main className="flex-1 p-8">
                <header className="mb-8 border-b border-gray-200 pb-4">
                    <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900">
                        <CheckSquare className="text-blue-600" size={32} />
                        Minhas Tarefas
                    </h1>
                    <p className="text-gray-500 mt-2 font-medium">Organize seu dia e não perca nenhum follow-up.</p>
                </header>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="animate-spin text-blue-600" size={48} />
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 text-center opacity-70">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                            <CheckSquare size={40} className="text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800">Tudo limpo por aqui!</h2>
                        <p className="text-gray-500 mt-2">Você não tem tarefas pendentes. Aproveite o dia! 😎</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* COLUNA 1: ATRASADAS */}
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center text-red-600 font-bold uppercase text-xs tracking-wider border-b-2 border-red-500/20 pb-2">
                                <span className="flex items-center gap-2"><Clock size={16} /> Atrasadas</span>
                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px]">{overdueTasks.length}</span>
                            </div>
                            {overdueTasks.map(task => (
                                <TaskCard key={task.id} task={task} onToggle={handleToggle} onOpenDeal={openDeal} onOpenColdLead={setSelectedColdLead} variant="overdue" />
                            ))}
                            {overdueTasks.length === 0 && <p className="text-gray-400 text-xs italic text-center py-4 bg-gray-50 rounded-lg dashed-border">Nenhuma tarefa atrasada.</p>}
                        </div>

                        {/* COLUNA 2: HOJE */}
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center text-yellow-600 font-bold uppercase text-xs tracking-wider border-b-2 border-yellow-500/20 pb-2">
                                <span className="flex items-center gap-2"><Calendar size={16} /> Hoje</span>
                                <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-[10px]">{todayTasks.length}</span>
                            </div>
                            {todayTasks.map(task => (
                                <TaskCard key={task.id} task={task} onToggle={handleToggle} onOpenDeal={openDeal} onOpenColdLead={setSelectedColdLead} variant="today" />
                            ))}
                            {todayTasks.length === 0 && <p className="text-gray-400 text-xs italic text-center py-4 bg-gray-50 rounded-lg dashed-border">Nada agendado para o resto do dia.</p>}
                        </div>

                        {/* COLUNA 3: PRÓXIMAS */}
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center text-blue-600 font-bold uppercase text-xs tracking-wider border-b-2 border-blue-500/20 pb-2">
                                <span className="flex items-center gap-2"><Calendar size={16} /> Próximas</span>
                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px]">{upcomingTasks.length}</span>
                            </div>
                            {upcomingTasks.map(task => (
                                <TaskCard key={task.id} task={task} onToggle={handleToggle} onOpenDeal={openDeal} onOpenColdLead={setSelectedColdLead} variant="upcoming" />
                            ))}
                            {upcomingTasks.length === 0 && <p className="text-gray-400 text-xs italic text-center py-4 bg-gray-50 rounded-lg dashed-border">Sem tarefas futuras.</p>}
                        </div>

                    </div>
                )}
            </main>

            {/* Modal para abrir o Deal ao clicar */}
            {selectedDeal && (
                <DealModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    deal={selectedDeal}
                    onUpdate={() => { fetchTasks(); setIsModalOpen(false); }}
                />
            )}

            {selectedColdLead && (
                <ColdLeadModal
                    isOpen={!!selectedColdLead}
                    lead={selectedColdLead}
                    onClose={() => setSelectedColdLead(null)}
                    teamMembers={teamMembers}
                    onActionComplete={(updated) => {
                        // Update local task list if needed or just re-fetch
                        fetchTasks();
                    }}
                />
            )}
        </div>
    );
}

function TaskCard({ task, onToggle, onOpenDeal, onOpenColdLead, variant }: any) {
    const cardStyle =
        variant === 'overdue' ? 'border-l-4 border-l-red-500' :
            variant === 'today' ? 'border-l-4 border-l-yellow-500' :
                'border-l-4 border-l-blue-500';

    const timeColor =
        variant === 'overdue' ? 'text-red-500' :
            variant === 'today' ? 'text-yellow-600' : 'text-gray-500';

    return (
        <div className={`bg-white p-4 rounded-xl border border-gray-100 ${cardStyle} transition-all shadow-sm hover:shadow-md group relative`}>
            <div className="flex items-start gap-3">
                <button
                    onClick={() => onToggle(task.id)}
                    className="mt-1 text-gray-300 hover:text-green-500 transition-colors"
                    title="Concluir Tarefa"
                >
                    <Square size={20} />
                </button>

                <div className="flex-1">
                    <p className="text-gray-800 font-medium mb-2 text-sm leading-relaxed">{task.description}</p>

                    <div className="flex flex-col gap-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <Clock size={12} className={timeColor} />
                            <span className={`font-semibold ${timeColor}`}>
                                {new Date(task.due_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                        </div>

                        {task.deals && (
                            <div
                                onClick={() => onOpenDeal(task.deals)}
                                className="flex items-center gap-2 cursor-pointer hover:bg-blue-50 transition-colors mt-1 bg-gray-50 p-2 rounded-lg border border-gray-100"
                            >
                                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                    <User size={10} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="font-bold text-gray-700 truncate text-[11px] group-hover:text-blue-600">
                                        {task.deals.contacts?.name || "Sem contato"}
                                    </span>
                                    <span className="truncate text-gray-400 text-[10px]">{task.deals.title}</span>
                                </div>
                            </div>
                        )}

                        {task.cold_leads && (
                            <div
                                onClick={() => onOpenColdLead(task.cold_leads)}
                                className="flex items-center gap-2 cursor-pointer hover:bg-pink-50 transition-colors mt-1 bg-gray-50 p-2 rounded-lg border border-gray-100"
                            >
                                <div className="w-5 h-5 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 shrink-0">
                                    <Phone size={10} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="font-bold text-gray-700 truncate text-[11px] group-hover:text-pink-600">
                                        {task.cold_leads.nome || "Sem nome"}
                                    </span>
                                    <span className="truncate text-gray-400 text-[10px]">Cold Call • {task.cold_leads.telefone}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
