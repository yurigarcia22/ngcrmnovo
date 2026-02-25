"use client";

import { useState } from "react";
import { StatCard } from "./cards";
import { WonLeadsModal } from "@/components/dashboard/WonLeadsModal";
import { useRouter } from "next/navigation";

interface WonLeadsWidgetProps {
    wonDealsCount: number;
    formattedWonValue: string;
    period: string;
    userId: string;
    startDate?: string;
    endDate?: string;
}

export function WonLeadsWidget({ wonDealsCount, formattedWonValue, period, userId, startDate, endDate }: WonLeadsWidgetProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const router = useRouter();

    const handleDataChanged = () => {
        router.refresh(); // Refresh the Server Component to update numbers
    };

    return (
        <>
            <StatCard
                title="LEADS GANHOS"
                value={wonDealsCount}
                trend="up"
                trendValue="Vendas"
                onClick={() => setIsModalOpen(true)}
            >
                <div className="mt-4 pointer-events-none">
                    <div className="text-4xl font-bold text-white">{wonDealsCount}</div>
                    <p className="text-lg font-medium text-emerald-400 mt-1">{formattedWonValue}</p>
                </div>
            </StatCard>

            <WonLeadsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                period={period}
                userId={userId}
                startDate={startDate}
                endDate={endDate}
                onDataChanged={handleDataChanged}
            />
        </>
    );
}
