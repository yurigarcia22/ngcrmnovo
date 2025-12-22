"use client";

import { Search, Settings, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DashboardHeader() {
    return (
        <div className="flex items-center justify-between mb-8 gap-4">
            <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    placeholder="Buscar"
                    className="pl-10 bg-[#0f172a]/50 border-gray-600 text-white placeholder:text-gray-400 focus-visible:ring-offset-0 focus-visible:ring-cyan-500 rounded-lg"
                />
            </div>
            <Button variant="default" className="bg-[#0f172a] hover:bg-[#1e293b] text-white border border-gray-600">
                <Calendar className="mr-2 h-4 w-4" />
                EVENTOS
            </Button>
        </div>
    );
}

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

interface User {
    id: string;
    full_name: string;
    avatar_url?: string;
}

export function DashboardFilterBar({
    currentPeriod,
    currentUserId,
    users
}: {
    currentPeriod: string;
    currentUserId: string;
    users: User[]
}) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Optimistic UI states
    const [activePeriod, setActivePeriod] = useState(currentPeriod);
    const [activeUserId, setActiveUserId] = useState(currentUserId);

    // Sync with props if they change externally (e.g. browser back button)
    useEffect(() => {
        setActivePeriod(currentPeriod);
    }, [currentPeriod]);

    useEffect(() => {
        setActiveUserId(currentUserId);
    }, [currentUserId]);

    const handlePeriodChange = (period: string) => {
        setActivePeriod(period); // Immediate visual update
        const params = new URLSearchParams(searchParams.toString());
        params.set("period", period);
        router.push(`?${params.toString()}`);
    };

    const handleUserChange = (userId: string) => {
        setActiveUserId(userId); // Immediate visual update
        const params = new URLSearchParams(searchParams.toString());
        if (userId === "all") {
            params.delete("userId");
        } else {
            params.set("userId", userId);
        }
        router.push(`?${params.toString()}`);
    };

    const periods = [
        { label: "Hoje", value: "today" },
        { label: "Ontem", value: "yesterday" },
        { label: "Semana", value: "week" },
        { label: "Mês", value: "month" },
        { label: "Todos", value: "all" },
    ];

    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
            {/* Date Toggles */}
            <div className="bg-[#0f172a]/50 p-1 rounded-full border border-gray-600 flex overflow-hidden">
                {periods.map((p) => (
                    <button
                        key={p.value}
                        onClick={() => handlePeriodChange(p.value)}
                        className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${activePeriod === p.value
                            ? "bg-[#0ea5e9] text-white"
                            : "text-gray-300 hover:text-white hover:bg-white/10"
                            }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* User & Settings */}
            <div className="flex items-center gap-3">
                <div className="relative bg-[#0f172a]/50 px-4 py-2 rounded-full border border-gray-600 text-gray-300 text-sm flex items-center gap-2 hover:bg-white/10 transition-colors group">
                    <span>{users.find(u => u.id === activeUserId)?.full_name || "Todos"}</span>
                    <span className="w-px h-4 bg-gray-600 mx-1"></span>

                    {/* Native Select Overlay */}
                    <select
                        value={activeUserId}
                        onChange={(e) => handleUserChange(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    >
                        <option value="all">Todos os usuários</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.full_name}</option>
                        ))}
                    </select>

                    <span className="text-gray-400 text-xs">▼</span>
                </div>
                <Button size="icon" variant="ghost" className="rounded-full border border-gray-600 text-white hover:bg-[#1e293b] hover:text-cyan-400">
                    <Settings className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
