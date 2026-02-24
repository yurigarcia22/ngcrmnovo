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
    meta_json?: any;
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

    // Alert State
    const [activeAlert, setActiveAlert] = useState<Notification | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const supabase = createClient();
    const pathname = usePathname();

    // Initialize Audio
    useEffect(() => {
        const initAudio = () => {
            if (!audioRef.current) {
                audioRef.current = new Audio("/sounds/notification.mp3");
                audioRef.current.volume = 0.5;
            }
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
        };
        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('keydown', initAudio, { once: true });
        return () => {
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
        };
    }, []);

    const fetchNotifications = async () => {
        const res = await getNotifications();
        if (res.success && res.data) {
            setNotifications(res.data);

            // Trigger popup for existing unread cold call follow ups
            setNotifications((current) => {
                // Determine if we need to show an initial alert
                const unreadColdCall = res.data.find((n: Notification) => !n.read_at && n.meta_json?.isColdCallFollowUp);
                if (unreadColdCall && !activeAlert) {
                    setActiveAlert(unreadColdCall);
                }
                return res.data;
            });
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
                    // Simple check: Is it unread?
                    if (!newNotif.read_at) {
                        playSound();

                        // Check if it's a cold call follow up needing a popup
                        if (newNotif.meta_json?.isColdCallFollowUp) {
                            setActiveAlert(newNotif);
                        } else {
                            toast(newNotif.title, {
                                description: newNotif.message,
                                duration: 5000,
                            });
                        }
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

            {/* HIGH PRIORITY COLD CALL MODAL */}
            {activeAlert && (
                <div className="fixed top-16 right-4 sm:right-8 z-[99999] w-full max-w-sm pointer-events-none">
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full p-6 animate-in slide-in-from-top-4 fade-in-0 duration-300 border-2 border-red-500 overflow-hidden pointer-events-auto">
                        {/* Red pulsating background effect */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-50 rounded-full blur-3xl"></div>

                        <div className="relative">
                            <div className="bg-red-100 text-red-600 w-12 h-12 rounded-full flex items-center justify-center mb-4 animate-bounce shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path><path d="M14.05 2a9 9 0 0 1 8 7.94"></path><path d="M14.05 6A5 5 0 0 1 18 10"></path></svg>
                            </div>

                            <div className="mb-4">
                                <h2 className="text-xl font-extrabold text-slate-900 mb-1">{activeAlert.title}</h2>
                                <p className="text-slate-600 font-medium text-sm leading-relaxed">{activeAlert.message}</p>
                            </div>

                            <button
                                onClick={async () => {
                                    setActiveAlert(null);
                                    if (!activeAlert.read_at) await markAsRead(activeAlert.id);
                                }}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-10 rounded-xl transition-all shadow-md shadow-red-900/20 flex items-center justify-center gap-2 uppercase tracking-wide text-xs"
                            >
                                Entendi, fechar aviso
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
