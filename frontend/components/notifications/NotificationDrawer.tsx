"use client";

import { useNotifications } from "./NotificationProvider";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"; // Assuming Shadcn Sheet exists
import { CheckCheck, X, Bell } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function NotificationDrawer() {
    const { notifications, isOpen, setIsOpen, markAsRead, markAllAsRead } = useNotifications();

    const unread = notifications.filter(n => !n.read_at);
    const read = notifications.filter(n => n.read_at);

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent side="right" className="w-[400px] bg-white sm:w-[540px] flex flex-col p-0 border-l border-slate-200">
                <SheetHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between shrink-0 bg-white">
                    <div className="flex items-center gap-2">
                        <Bell size={18} className="text-slate-500" />
                        <SheetTitle className="text-lg font-bold text-slate-900">Notificações</SheetTitle>
                        {unread.length > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">
                                {unread.length} novas
                            </span>
                        )}
                    </div>
                    {unread.length > 0 && (
                        <button
                            onClick={() => markAllAsRead()}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                            <CheckCheck size={14} />
                            Marcar tudo como lido
                        </button>
                    )}
                </SheetHeader>

                <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3">
                    {notifications.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                            <Bell size={40} className="opacity-20" />
                            <p className="text-sm">Nenhuma notificação.</p>
                        </div>
                    )}

                    {notifications.map(note => (
                        <div
                            key={note.id}
                            onClick={() => !note.read_at && markAsRead(note.id)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer relative group ${note.read_at
                                    ? "bg-white border-slate-100 opacity-60 hover:opacity-100"
                                    : "bg-white border-blue-100 shadow-sm ring-1 ring-blue-50"
                                }`}
                        >
                            {!note.read_at && (
                                <div className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full"></div>
                            )}
                            <div className="flex flex-col gap-1 pr-4">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    {note.kind === 'morning' ? 'Resumo do Dia' :
                                        note.kind === 'before_30' ? 'Em Breve' :
                                            note.kind === 'before_5' ? 'Atenção' : 'Notificação'}
                                </span>
                                <h4 className={`text-sm font-semibold ${note.read_at ? 'text-slate-600' : 'text-slate-900'}`}>
                                    {note.title}
                                </h4>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    {note.message}
                                </p>
                                <span className="text-[10px] text-slate-400 mt-2 block">
                                    {note.sent_at ? format(new Date(note.sent_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR }) : 'Agendado'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
