import Link from "next/link";
import { LayoutDashboard, Users, MessageSquare, Zap, CheckSquare } from "lucide-react";

export default function Sidebar() {
    return (
        <aside className="w-16 bg-[#153046] flex flex-col items-center py-6 gap-6 z-20 shadow-lg h-screen fixed left-0 top-0">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md">
                E
            </div>

            <nav className="flex flex-col gap-4 w-full items-center">
                <Link href="/" className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Dashboard">
                    <LayoutDashboard size={24} />
                </Link>
                <Link href="/leads" className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Leads">
                    <Users size={24} />
                </Link>
                <Link href="/tasks" className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Tarefas">
                    <CheckSquare size={24} />
                </Link>
                <Link href="/settings" className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Respostas Rápidas">
                    <Zap size={24} />
                </Link>
            </nav>

            <div className="mt-auto flex flex-col gap-4">
                <div className="w-8 h-8 bg-gray-500 rounded-full border-2 border-gray-700"></div>
            </div>
        </aside>
    );
}
