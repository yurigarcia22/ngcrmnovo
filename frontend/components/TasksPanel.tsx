"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { X, CalendarCheck, Loader2, Plus, Trash2, CheckSquare, Square, Calendar, Clock } from "lucide-react";
import { createTask, toggleTask, deleteTask } from "../app/actions";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface TasksPanelProps {
    dealId: string;
    onClose: () => void;
}

export default function TasksPanel({ dealId, onClose }: TasksPanelProps) {
    const [tasks, setTasks] = useState<any[]>([]);
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [showCustomDate, setShowCustomDate] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        fetchTasks();
    }, [dealId]);

    async function fetchTasks() {
        setFetching(true);
        const { data } = await supabase
            .from("tasks")
            .select("*")
            .eq("deal_id", dealId)
            .order("due_date", { ascending: true });

        if (data) setTasks(data);
        setFetching(false);
    }

    async function handleCreate() {
        if (!description.trim() || !dueDate) return;

        setLoading(true);
        try {
            const result = await createTask(dealId, description, dueDate);
            if (result.success) {
                setDescription("");
                setDueDate("");
                setShowCustomDate(false);
                fetchTasks();
            } else {
                alert("Erro ao criar tarefa: " + result.error);
            }
        } catch (error) {
            console.error("Erro ao criar tarefa:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleToggle(taskId: string, currentStatus: boolean) {
        // Optimistic Update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: !currentStatus } : t));

        const result = await toggleTask(taskId, !currentStatus);
        if (!result.success) {
            alert("Erro ao atualizar tarefa");
            fetchTasks(); // Revert
        }
    }

    async function handleDelete(taskId: string) {
        if (!confirm("Excluir tarefa?")) return;

        // Optimistic Update
        setTasks(prev => prev.filter(t => t.id !== taskId));

        const result = await deleteTask(taskId);
        if (!result.success) {
            alert("Erro ao excluir tarefa");
            fetchTasks(); // Revert
        }
    }

    // Verifica se a data já passou
    const isOverdue = (dateString: string) => {
        return new Date(dateString) < new Date();
    };

    // Helpers para datas rápidas
    const setToday = () => {
        const now = new Date();
        // Define para o final do dia ou +1 hora? Vamos colocar +1 hora como padrão prático
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        // Ajuste para fuso horário local no formato datetime-local
        const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setDueDate(localIso);
    };

    const setTomorrow = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9); // 09:00 da manhã
        tomorrow.setMinutes(0);
        const localIso = new Date(tomorrow.getTime() - (tomorrow.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setDueDate(localIso);
    };

    return (
        <div className="flex flex-col h-full text-gray-900">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <CalendarCheck size={18} className="text-green-600" />
                    <h3 className="font-bold">Tarefas</h3>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
                    <X size={18} />
                </button>
            </div>

            {/* Lista de Tarefas */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 custom-scrollbar">
                {fetching ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin text-gray-500" />
                    </div>
                ) : tasks.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center italic mt-4">Nenhuma tarefa pendente.</p>
                ) : (
                    tasks.map((task) => {
                        const overdue = !task.is_completed && isOverdue(task.due_date);
                        return (
                            <div key={task.id} className={`bg-white p-3 rounded border ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'} flex items-start gap-3 group shadow-sm`}>
                                <button
                                    onClick={() => handleToggle(task.id, task.is_completed)}
                                    className={`mt-1 ${task.is_completed ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}`}
                                >
                                    {task.is_completed ? <CheckSquare size={18} /> : <Square size={18} />}
                                </button>

                                <div className="flex-1">
                                    <p className={`text-sm ${task.is_completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                                        {task.description}
                                    </p>
                                    <span className={`text-[10px] block mt-1 ${overdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                        {new Date(task.due_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                        {overdue && " (Vencida)"}
                                    </span>
                                </div>

                                <button
                                    onClick={() => handleDelete(task.id)}
                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Formulário de Nova Tarefa */}
            <div className="mt-auto bg-gray-50 p-3 rounded border border-gray-200">
                <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded p-2 text-sm text-gray-900 focus:outline-none focus:border-green-500 mb-2"
                    placeholder="O que precisa ser feito?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />

                <div className="flex flex-col gap-2">
                    {/* Seletor de Data Rápida */}
                    {!showCustomDate && !dueDate ? (
                        <div className="flex gap-2">
                            <button
                                onClick={setToday}
                                className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-xs py-2 rounded text-gray-700 transition-colors"
                            >
                                Hoje (+1h)
                            </button>
                            <button
                                onClick={setTomorrow}
                                className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-xs py-2 rounded text-gray-700 transition-colors"
                            >
                                Amanhã (09h)
                            </button>
                            <button
                                onClick={() => setShowCustomDate(true)}
                                className="bg-white border border-gray-300 hover:bg-gray-50 px-3 rounded text-gray-700 transition-colors"
                                title="Personalizar Data"
                            >
                                <Calendar size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2 items-center animate-in fade-in slide-in-from-bottom-1 duration-200">
                            <input
                                type="datetime-local"
                                className="bg-white border border-gray-300 rounded p-2 text-xs text-gray-900 focus:outline-none focus:border-green-500 flex-1"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                            <button
                                onClick={() => { setDueDate(""); setShowCustomDate(false); }}
                                className="text-gray-400 hover:text-gray-700 p-1"
                                title="Limpar Data"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={handleCreate}
                        disabled={loading || !description.trim() || !dueDate}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Agendar Tarefa
                    </button>
                </div>
            </div>
        </div>
    );
}
