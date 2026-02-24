"use client";

import { useNotifications } from "./NotificationProvider";
import { Bell } from "lucide-react";

export function NotificationBell() {
    const { unreadCount, setIsOpen } = useNotifications();

    return (
        <button
            onClick={() => setIsOpen(true)}
            className={`relative p-2 rounded-full transition-colors ${unreadCount > 0 ? 'text-red-500 animate-bounce' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
            <Bell size={20} />
            {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border border-white dark:border-slate-900">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}
