"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    User,
    Building2,
    Users,
    Tag,
    AlertOctagon,
    Smartphone,
    Zap,
    GitPullRequest,
    LayoutList,
    Package,
    Bell,
    Settings as SettingsIcon,
    ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MenuItem = {
    name: string;
    href: string;
    icon: typeof User;
};

type MenuSection = {
    title: string;
    items: MenuItem[];
};

const menuSections: MenuSection[] = [
    {
        title: "Conta",
        items: [
            { name: "Meu Perfil", href: "/settings/profile", icon: User },
            { name: "Notificacoes", href: "/settings/notifications", icon: Bell },
        ],
    },
    {
        title: "Organizacao",
        items: [
            { name: "Empresa", href: "/settings/company", icon: Building2 },
            { name: "Minha Equipe", href: "/settings/team", icon: Users },
        ],
    },
    {
        title: "Pipeline",
        items: [
            { name: "Funis de Vendas", href: "/settings/pipelines", icon: GitPullRequest },
            { name: "Produtos", href: "/settings/products", icon: Package },
            { name: "Etiquetas", href: "/settings/tags", icon: Tag },
            { name: "Motivos de Perda", href: "/settings/loss-reasons", icon: AlertOctagon },
            { name: "Campos Personalizados", href: "/settings/fields", icon: LayoutList },
        ],
    },
    {
        title: "Automacoes",
        items: [
            { name: "Respostas Rapidas", href: "/settings/quick-replies", icon: Zap },
            { name: "Conexoes", href: "/settings/whatsapp", icon: Smartphone },
        ],
    },
];

export default function SettingsSidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
            <div className="p-5 border-b border-slate-100">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors mb-3"
                >
                    <ArrowLeft className="w-3 h-3" />
                    Voltar ao app
                </Link>
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <SettingsIcon className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900 leading-tight">Configuracoes</h2>
                        <p className="text-[11px] text-slate-500">Ajuste o sistema</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar" aria-label="Menu de configuracoes">
                {menuSections.map((section) => (
                    <div key={section.title} className="mb-5 px-3">
                        <div className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {section.title}
                        </div>
                        <ul className="space-y-0.5">
                            {section.items.map((item) => {
                                const isActive = pathname.startsWith(item.href);
                                const Icon = item.icon;
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            className={cn(
                                                "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                                isActive
                                                    ? "bg-indigo-50 text-indigo-700"
                                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                            )}
                                            aria-current={isActive ? "page" : undefined}
                                        >
                                            {isActive && (
                                                <span
                                                    aria-hidden="true"
                                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full"
                                                />
                                            )}
                                            <Icon
                                                size={16}
                                                strokeWidth={isActive ? 2.5 : 2}
                                                className={cn(
                                                    isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                                                )}
                                            />
                                            {item.name}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>
        </aside>
    );
}
