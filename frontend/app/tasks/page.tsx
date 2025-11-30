"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Sidebar from "../../components/Sidebar";
import { CheckSquare, Square, Calendar, User, Briefcase, Loader2, Clock } from "lucide-react";
import { toggleTask } from "../../app/actions";
import DealModal from "../../components/DealModal";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TasksPage() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchTasks();
    }, []);

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
        <div className="flex min-h-screen bg-[#0b141a] text-white font-sans">
            <Sidebar />

            <main className="flex-1 ml-16 p-8">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <CheckSquare className="text-blue-500" size={32} />
                        Minhas Tarefas
                    </h1>
                    <p className="text-gray-400 mt-2">Organize seu dia e não perca nenhum follow-up.</p>
                </header>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="animate-spin text-blue-500" size={48} />
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 text-center opacity-50">
                        <CheckSquare size={64} className="mb-4 text-green-500" />
                        <h2 className="text-2xl font-bold text-gray-300">Tudo limpo por aqui!</h2>
                        <p className="text-gray-500">Você não tem tarefas pendentes. Aproveite o dia! 😎</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* COLUNA 1: ATRASADAS */}
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2 text-red-400 font-bold uppercase text-sm tracking-wider border-b border-red-500/30 pb-2">
                                <Clock size={16} /> Atrasadas ({overdueTasks.length})
                            </div>
                            {overdueTasks.map(task => (
                                <TaskCard key={task.id} task={task} onToggle={handleToggle} onOpenDeal={openDeal} variant="overdue" />
                            ))}
                            {overdueTasks.length === 0 && <p className="text-gray-600 text-sm italic">Nenhuma tarefa atrasada.</p>}
                        </div>

                        {/* COLUNA 2: HOJE */}
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2 text-yellow-400 font-bold uppercase text-sm tracking-wider border-b border-yellow-500/30 pb-2">
                                <Calendar size={16} /> Hoje ({todayTasks.length})
                            </div>
                            {todayTasks.map(task => (
                                <TaskCard key={task.id} task={task} onToggle={handleToggle} onOpenDeal={openDeal} variant="today" />
                            ))}
                            {todayTasks.length === 0 && <p className="text-gray-600 text-sm italic">Nada agendado para o resto do dia.</p>}
                        </div>

                        {/* COLUNA 3: PRÓXIMAS */}
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2 text-blue-400 font-bold uppercase text-sm tracking-wider border-b border-blue-500/30 pb-2">
                                <Calendar size={16} /> Próximas ({upcomingTasks.length})
                            </div>
                            {upcomingTasks.map(task => (
                                <TaskCard key={task.id} task={task} onToggle={handleToggle} onOpenDeal={openDeal} variant="upcoming" />
                            ))}
                            {upcomingTasks.length === 0 && <p className="text-gray-600 text-sm italic">Sem tarefas futuras.</p>}
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
        </div>
    );
}

function TaskCard({ task, onToggle, onOpenDeal, variant }: any) {
    const borderColor =
        variant === 'overdue' ? 'border-red-500/50 hover:border-red-500' :
            variant === 'today' ? 'border-yellow-500/50 hover:border-yellow-500' :
                'border-gray-700 hover:border-blue-500';

    return (
        <div className={`bg-gray-800 p-4 rounded-xl border ${borderColor} transition-all shadow-lg group relative`}>
            <div className="flex items-start gap-3">
                <button
                    onClick={() => onToggle(task.id)}
                    className="mt-1 text-gray-400 hover:text-green-500 transition-colors"
                    title="Concluir Tarefa"
                >
                    <Square size={20} />
                </button>

                <div className="flex-1">
                    <p className="text-gray-200 font-medium mb-2">{task.description}</p>

                    <div className="flex flex-col gap-1 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span className={variant === 'overdue' ? 'text-red-400 font-bold' : ''}>
                                {new Date(task.due_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                        </div>

                        {task.deals && (
                            <div
                                onClick={() => onOpenDeal(task.deals)}
                                className="flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors mt-1 bg-gray-900/50 p-1.5 rounded"
                            >
                                <User size={12} />
                                <span className="font-bold text-gray-300 group-hover:text-blue-400">
                                    {task.deals.contacts?.name || "Sem contato"}
                                </span>
                                <span className="mx-1">•</span>
                                <span className="truncate max-w-[120px]">{task.deals.title}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
