"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    MessageSquare,
    CheckSquare,
    Settings,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Phone,
    Briefcase,
    Zap,
    Mail,
    Megaphone
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";

export default function Sidebar({ initialOpen = true }: { initialOpen?: boolean }) {
    const [open, setOpen] = useState(initialOpen);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted) {
            document.cookie = `sidebar_state=${open}; path=/; max-age=31536000; SameSite=Lax`;
        }
    }, [open, isMounted]);

    const pathname = usePathname();

    return (
        <nav
            suppressHydrationWarning={true}
            className={cn(
                "sticky top-0 h-screen shrink-0 border-r border-slate-200/80 bg-[#FAFAFB] flex flex-col z-50",
                isMounted ? "transition-all duration-400 cubic-bezier(0.16, 1, 0.3, 1)" : "",
                open ? "w-64" : "w-[80px]"
            )}
            style={{
                boxShadow: open ? "4px 0 24px rgba(0,0,0,0.02)" : "none"
            }}
        >
            {/* Header / Logo Area */}
            <div className={cn(
                "flex items-center mb-8 pt-6 transition-all duration-300",
                open ? "px-6 justify-between" : "px-0 justify-center flex-col gap-4"
            )}>
                <div className="flex items-center gap-3">
                    <Logo />
                    {open && (
                        <div className="flex flex-col animate-in fade-in zoom-in duration-300">
                            <span className="text-sm font-extrabold text-slate-800 tracking-tight leading-none">
                                CRM NG
                            </span>
                            <div className="flex items-center gap-1 mt-1">
                                <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                    Pro Plan
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => setOpen(!open)}
                    className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition-all shadow-sm focus:outline-none",
                        !open && "absolute -right-4 top-8 z-50" // Floating button when closed
                    )}
                    title={open ? "Recolher menu" : "Expandir menu"}
                >
                    {open ? <PanelLeftClose size={14} strokeWidth={2.5} /> : <PanelLeftOpen size={14} strokeWidth={2.5} />}
                </button>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 space-y-1.5 scroll-smooth">
                <Option
                    Icon={LayoutDashboard}
                    title="Dashboard"
                    href="/dashboard" /* Standardize main route if used, commonly / or /dashboard */
                    isActive={pathname === "/" || pathname === "/dashboard"}
                    open={open}
                />

                {open && <div className="mt-6 mb-2 ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Comercial</div>}

                <Option
                    Icon={Users}
                    title="Leads"
                    href="/leads"
                    isActive={pathname.startsWith("/leads")}
                    open={open}
                />
                <Option
                    Icon={Phone}
                    title="Cold Call"
                    href="/cold-call"
                    isActive={pathname.startsWith("/cold-call")}
                    open={open}
                />
                <Option
                    Icon={Megaphone}
                    title="Webinar"
                    href="/webinar"
                    isActive={pathname.startsWith("/webinar")}
                    open={open}
                />


                {open && <div className="mt-6 mb-2 ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Comunicação</div>}

                <Option
                    Icon={MessageSquare}
                    title="Conversas"
                    href="/chat"
                    isActive={pathname.startsWith("/chat")}
                    open={open}
                />
                <Option
                    Icon={Mail}
                    title="E-mails"
                    href="/emails"
                    isActive={pathname.startsWith("/emails")}
                    open={open}
                />
            </div>

            {/* Footer / Settings Area */}
            <div className="p-4 mt-auto border-t border-slate-200/80 bg-[#FAFAFB]">
                <div className="space-y-1.5">
                    <Option
                        Icon={Settings}
                        title="Configurações"
                        href="/settings"
                        isActive={pathname.startsWith("/settings")}
                        open={open}
                    />
                    <button
                        onClick={() => logout()}
                        className={cn(
                            "group flex items-center w-full rounded-xl transition-all duration-200 ease-out",
                            open ? "px-3 py-2.5 h-auto text-left" : "justify-center h-12 w-12 mx-auto",
                            "text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-100"
                        )}
                        title="Sair"
                    >
                        <div className={cn(
                            "flex items-center justify-center",
                            !open && "w-12 h-12"
                        )}>
                            <LogOut className="h-5 w-5 transition-transform group-hover:scale-110" strokeWidth={2} />
                        </div>
                        {open && (
                            <span className="ml-3 text-sm font-semibold truncate transition-opacity duration-200">
                                Sair da Conta
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </nav>
    );
}

const Option = ({ Icon, title, href, isActive, open, notifs }: {
    Icon: any, title: string, href: string, isActive: boolean, open: boolean, notifs?: number
}) => {
    return (
        <Link
            href={href}
            className={cn(
                "group relative flex items-center rounded-xl transition-all duration-300 ease-out",
                open ? "px-3 py-2.5" : "justify-center h-12 w-12 mx-auto",
                isActive
                    ? "bg-indigo-50/50 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-transparent"
            )}
            title={!open ? title : undefined}
        >
            <div className={cn(
                "flex items-center justify-center relative",
                !open && "w-12 h-12"
            )}>
                <Icon
                    className={cn(
                        "h-5 w-5 transition-transform duration-300",
                        isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700 group-hover:scale-105"
                    )}
                    strokeWidth={isActive ? 2.5 : 2}
                />

                {/* Micro notification dot for closed state */}
                {!open && notifs && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-blue-500 border-2 border-[#FAFAFB]" />
                )}
            </div>

            {open && (
                <span
                    className={cn(
                        "ml-3 text-sm font-medium truncate transition-all duration-300 flex-1",
                        isActive ? "text-indigo-800 font-bold" : "text-slate-600 group-hover:text-slate-800"
                    )}
                >
                    {title}
                </span>
            )}

            {open && notifs && (
                <span className={cn(
                    "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold",
                    isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                )}>
                    {notifs}
                </span>
            )}
        </Link>
    );
};

const Logo = () => {
    return (
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-center p-1.5 transition-transform hover:rotate-3">
            <div className="relative w-full h-full">
                <Image
                    src="/logo-sidebar.png"
                    alt="NG Logo"
                    fill
                    className="object-contain drop-shadow-sm"
                />
            </div>
        </div>
    );
};
