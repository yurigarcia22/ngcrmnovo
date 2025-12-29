"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation"; // To highlight selected
import {
    LayoutDashboard,
    Users,
    MessageSquare,
    CheckSquare,
    Settings,
    ChevronDown,
    ChevronsRight,
    LogOut,
    Menu,
    X,
    Bell,
    User,
    Phone
} from "lucide-react";
import { logout } from "@/app/login/actions";

export default function Sidebar({ initialOpen = true }: { initialOpen?: boolean }) {
    console.log("Sidebar initialOpen:", initialOpen);
    const [open, setOpen] = useState(initialOpen);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Update cookie when state changes
    useEffect(() => {
        if (isMounted) {
            document.cookie = `sidebar_state=${open}; path=/; max-age=31536000; SameSite=Lax`;
        }
    }, [open, isMounted]);
    const pathname = usePathname();

    const selected = (path: string) => pathname === path || pathname?.startsWith(path + "/");

    return (
        <nav
            suppressHydrationWarning={true}
            className={`sticky top-0 h-screen shrink-0 border-r ${isMounted ? "transition-all duration-300 ease-in-out" : ""} ${open ? 'w-64' : 'w-20'
                } border-gray-200 bg-white shadow-sm flex flex-col z-50`}
        >
            <TitleSection open={open} />

            <div className="space-y-1 mb-8 flex-1 overflow-y-auto custom-scrollbar px-2">
                <Option
                    Icon={LayoutDashboard}
                    title="Dashboard"
                    href="/"
                    selected={pathname === "/"}
                    open={open}
                />
                <Option
                    Icon={Users}
                    title="Leads"
                    href="/leads"
                    selected={pathname.startsWith("/leads")}
                    open={open}
                />
                <Option
                    Icon={Phone}
                    title="Cold Call"
                    href="/cold-call"
                    selected={pathname.startsWith("/cold-call")}
                    open={open}
                />
                <Option
                    Icon={MessageSquare}
                    title="Conversas"
                    href="/chat"
                    selected={pathname.startsWith("/chat")}
                    open={open}
                />
                <Option
                    Icon={CheckSquare}
                    title="Tarefas"
                    href="/tasks"
                    selected={pathname.startsWith("/tasks")}
                    open={open}
                />
            </div>

            <div className="border-t border-gray-200 pt-4 pb-4 px-2 space-y-1 shrink-0">
                {open && (
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Conta
                    </div>
                )}
                <Option
                    Icon={Settings}
                    title="Configurações"
                    href="/settings"
                    selected={pathname.startsWith("/settings")}
                    open={open}
                />
                <button
                    onClick={() => logout()}
                    className={`relative flex h-11 w-full items-center rounded-md transition-all duration-200 text-red-500 hover:bg-red-50 group`}
                    title="Sair"
                >
                    <div className="grid h-full w-12 place-content-center shrink-0">
                        <LogOut className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    </div>
                    {open && (
                        <span className="text-sm font-medium transition-opacity duration-200 opacity-100 truncate">
                            Sair
                        </span>
                    )}
                </button>
            </div>

            <ToggleClose open={open} setOpen={setOpen} />
        </nav>
    );
};

const Option = ({ Icon, title, href, selected, open, notifs }: any) => {
    return (
        <Link
            href={href}
            className={`relative flex h-11 w-full items-center rounded-md transition-all duration-200 ${selected
                ? "bg-blue-50 text-blue-700 shadow-sm border-l-2 border-blue-500"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
        >
            <div className="grid h-full w-12 place-content-center shrink-0">
                <Icon className={`h-5 w-5 ${selected ? "text-blue-600" : "text-gray-500"}`} />
            </div>

            {open && (
                <span
                    className={`text-sm font-medium transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'
                        } truncate`}
                >
                    {title}
                </span>
            )}

            {notifs && open && (
                <span className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white font-medium">
                    {notifs}
                </span>
            )}
        </Link>
    );
};

const TitleSection = ({ open }: any) => {
    return (
        <div className="mb-6 border-b border-gray-200 pb-4 pt-4 px-2">
            <div className="flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-gray-50">
                <div className="flex items-center gap-3 overflow-hidden">
                    <Logo />
                    {open && (
                        <div className={`transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}>
                            <div className="flex items-center gap-2">
                                <div>
                                    <span className="block text-sm font-bold text-gray-900 whitespace-nowrap">
                                        CRM NG
                                    </span>
                                    <span className="block text-xs text-blue-600 font-medium">
                                        Pro Plan
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* {open && (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )} */}
            </div>
        </div>
    );
};

const Logo = () => {
    return (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
            <Image
                src="/logo-sidebar.png"
                alt="NG Logo"
                fill
                className="object-cover"
            />
        </div>
    );
};

const ToggleClose = ({ open, setOpen }: any) => {
    return (
        <button
            onClick={() => setOpen(!open)}
            className="border-t border-gray-200 transition-colors hover:bg-gray-50 w-full"
        >
            <div className="flex items-center p-3">
                <div className="grid size-10 place-content-center shrink-0">
                    <ChevronsRight
                        className={`h-5 w-5 transition-transform duration-300 text-gray-500 ${!open ? "rotate-0" : "rotate-180"
                            }`}
                    />
                </div>
                {open && (
                    <span
                        className={`text-sm font-medium text-gray-600 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'
                            }`}
                    >
                        Esconder
                    </span>
                )}
            </div>
        </button>
    );
};
