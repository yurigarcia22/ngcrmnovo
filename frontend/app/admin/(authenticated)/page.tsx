import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Building2, Users, ArrowRight, Power, PowerOff } from "lucide-react";

export const dynamic = "force-dynamic";

async function loadStats() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const [tenantsRes, profilesRes] = await Promise.all([
        supabase.from("tenants").select("id, is_active"),
        supabase.from("profiles").select("id"),
    ]);

    const tenants = tenantsRes.data ?? [];
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.is_active).length;
    const inactiveTenants = totalTenants - activeTenants;
    const totalUsers = (profilesRes.data ?? []).length;

    return { totalTenants, activeTenants, inactiveTenants, totalUsers };
}

export default async function AdminDashboardPage() {
    const stats = await loadStats();

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">
                    Visao Geral
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Estado da plataforma em tempo real.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    icon={Building2}
                    label="Tenants totais"
                    value={stats.totalTenants}
                    color="indigo"
                />
                <StatCard
                    icon={Power}
                    label="Ativos"
                    value={stats.activeTenants}
                    color="emerald"
                />
                <StatCard
                    icon={PowerOff}
                    label="Inativos"
                    value={stats.inactiveTenants}
                    color="rose"
                />
                <StatCard
                    icon={Users}
                    label="Usuarios"
                    value={stats.totalUsers}
                    color="amber"
                />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            Gerenciar tenants
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Lista de empresas cadastradas, modulos liberados,
                            criar / desativar.
                        </p>
                    </div>
                    <Link
                        href="/admin/tenants"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                        Abrir
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    color,
}: {
    icon: typeof Building2;
    label: string;
    value: number;
    color: "indigo" | "emerald" | "rose" | "amber";
}) {
    const colorClasses = {
        indigo: "bg-indigo-50 text-indigo-600",
        emerald: "bg-emerald-50 text-emerald-600",
        rose: "bg-rose-50 text-rose-600",
        amber: "bg-amber-50 text-amber-600",
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {label}
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-2">
                        {value}
                    </div>
                </div>
                <div
                    className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}
                >
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </div>
    );
}
