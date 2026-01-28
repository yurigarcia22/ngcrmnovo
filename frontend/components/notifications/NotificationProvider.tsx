"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "@/app/actions";
import { toast } from "sonner";
import { usePathname } from "next/navigation";

interface Notification {
    id: string;
    title: string;
    message: string;
    kind: string;
    read_at: string | null;
    created_at: string;
    sent_at: string | null;
    task_id?: string;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    refresh: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const supabase = createClient();
    const pathname = usePathname();

    // Initialize Audio
    useEffect(() => {
        // We need a user interaction to play audio usually, but let's try.
        // Also ensure the file exists.
        audioRef.current = new Audio("/sounds/notification.mp3");
        audioRef.current.volume = 0.5;
    }, []);

    const fetchNotifications = async () => {
        const res = await getNotifications();
        if (res.success && res.data) {
            setNotifications(res.data);
        }
    };

    // Initial Fetch & Poll
    useEffect(() => {
        fetchNotifications();

        // Poll for updates and TRIGGER cron (for local dev environments where external cron isn't set up)
        const interval = setInterval(() => {
            fetchNotifications();
            // Trigger the cron endpoint to process scheduled notifications
            fetch('/api/cron/notifications').catch(err => console.error("Auto-cron failed", err));
        }, 60000);

        return () => clearInterval(interval);
    }, []);

    // Realtime Subscription
    useEffect(() => {
        const channel = supabase
            .channel('notifications-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications'
                },
                (payload) => {
                    const newNotif = payload.new as Notification;

                    // Only care if sent_at is present (it might have been NULL before)
                    if (!newNotif.sent_at) return;

                    // Update list
                    setNotifications(prev => {
                        const exists = prev.find(n => n.id === newNotif.id);
                        if (exists) {
                            // If it was already in the list (e.g. read status update), update it
                            return prev.map(n => n.id === newNotif.id ? newNotif : n);
                        }
                        // If it wasn't in list, it's new for us (was pending, now sent)
                        return [newNotif, ...prev];
                    });

                    // Alert if it's new (sent recently) and unread
                    // We check if we already had it? No, if it wasn't in `prev` or if `prev` had sent_at=null (which we filter out of `getNotifications` anyway), it's new.
                    // But to be safe against duplicates on re-render/network:

                    // Simple check: Is it unread?
                    if (!newNotif.read_at) {
                        // Check if this notification is "fresh" (sent in last 10 seconds)? 
                        // Or just rely on the fact that the Update event happened NOW.
                        playSound();
                        toast(newNotif.title, {
                            description: newNotif.message,
                            duration: 5000,
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    const playSound = () => {
        if (audioRef.current) {
            audioRef.current.play().catch(e => console.log("Audio blocked:", e));
        }
    };

    const unreadCount = notifications.filter(n => !n.read_at).length;

    const markAsRead = async (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
        await markNotificationAsRead(id);
    };

    const markAllAsReadAction = async () => {
        setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
        await markAllNotificationsAsRead();
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead: markAllAsReadAction,
            isOpen,
            setIsOpen,
            refresh: fetchNotifications
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error("useNotifications must be used within a NotificationProvider");
    }
    return context;
}
