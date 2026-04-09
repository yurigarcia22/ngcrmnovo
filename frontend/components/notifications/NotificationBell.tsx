"use client";

import { useNotifications } from "./NotificationProvider";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotificationBell() {
    const { unreadCount, setIsOpen } = useNotifications();
    const hasUnread = unreadCount > 0;

    return (
        <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={hasUnread ? `${unreadCount} notificacoes nao lidas` : "Notificacoes"}
            className={cn(
                "relative p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                hasUnread
                    ? "text-indigo-600 hover:bg-indigo-50"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            )}
        >
            <Bell size={20} strokeWidth={2} />
            {hasUnread && (
                <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm"
                >
                    {unreadCount > 9 ? "9+" : unreadCount}
                </span>
            )}
        </button>
    );
}
