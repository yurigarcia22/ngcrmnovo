"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Building2, Users, Tag, AlertOctagon, MessageSquare, Smartphone, Zap, GitPullRequest, LayoutList, Package } from "lucide-react";

const menuItems = [
    { name: "Meu Perfil", href: "/settings/profile", icon: User },
    { name: "Empresa", href: "/settings/company", icon: Building2 },
    { name: "Minha Equipe", href: "/settings/team", icon: Users },
    { name: "Funis de Vendas", href: "/settings/pipelines", icon: GitPullRequest },
    { name: "Produtos", href: "/settings/products", icon: Package },
    { name: "Etiquetas", href: "/settings/tags", icon: Tag },
    { name: "Motivos de Perda", href: "/settings/loss-reasons", icon: AlertOctagon },
    { name: "Respostas Rápidas", href: "/settings/quick-replies", icon: Zap },
    { name: "Campos Personalizados", href: "/settings/fields", icon: LayoutList },
    { name: "Conexões", href: "/settings/whatsapp", icon: Smartphone },
];

export default function SettingsSidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Configurações</h2>
            </div>
            <nav className="flex-1 overflow-y-auto py-4">
                <ul className="space-y-1 px-3">
                    {menuItems.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        const Icon = item.icon;
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? "bg-blue-50 text-blue-600"
                                        : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                        }`}
                                >
                                    <Icon size={18} />
                                    {item.name}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </aside>
    );
}
