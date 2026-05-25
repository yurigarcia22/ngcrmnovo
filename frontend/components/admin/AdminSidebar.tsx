"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Building2,
    ShieldCheck,
    LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminLogoutAction } from "../../app/admin/(authenticated)/actions";

interface Props {
    adminName: string;
    adminEmail: string;
}

export default function AdminSidebar({ adminName, adminEmail }: Props) {
    const pathname = usePathname();

    const isActive = (href: string) => {
        if (href === "/admin") return pathname === "/admin";
        return pathname.startsWith(href);
    };

    return (
        <aside className="w-64 h-screen sticky top-0 bg-slate-900 text-slate-100 flex flex-col shrink-0 border-r border-slate-800">
            {/* Header */}
            <div className="px-5 py-5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600/20 text-indigo-300 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-white leading-tight">
                            Plataforma NG
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-indigo-300 font-semibold">
                            Super-Admin
                        </div>
                    </div>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                <NavItem
                    href="/admin"
                    icon={LayoutDashboard}
                    label="Visao Geral"
                    active={isActive("/admin")}
                />
                <NavItem
                    href="/admin/tenants"
                    icon={Building2}
                    label="Tenants"
                    active={isActive("/admin/tenants")}
                />
            </nav>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-slate-800 space-y-1">
                <div className="px-3 py-2">
                    <div className="text-xs font-semibold text-white truncate">
                        {adminName}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                        {adminEmail}
                    </div>
                </div>
                <form action={adminLogoutAction}>
                    <button
                        type="submit"
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Sair
                    </button>
                </form>
            </div>
        </aside>
    );
}

function NavItem({
    href,
    icon: Icon,
    label,
    active,
}: {
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                active
                    ? "bg-indigo-600 text-white font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
        >
            <Icon className="w-4 h-4" />
            {label}
        </Link>
    );
}
