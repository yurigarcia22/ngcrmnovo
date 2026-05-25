import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
    Plus,
    Building2,
    CheckCircle2,
    XCircle,
    Users as UsersIcon,
    ArrowRight,
} from "lucide-react";
import { MODULE_KEYS } from "@/lib/modules";

export const dynamic = "force-dynamic";

interface TenantRow {
    id: string;
    name: string;
    slug: string;
    plan: string;
    is_active: boolean;
    billing_email: string | null;
    created_at: string;
    user_count: number;
    enabled_modules: number;
    total_modules: number;
}

async function loadTenants(): Promise<TenantRow[]> {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, is_active, billing_email, created_at")
        .order("created_at", { ascending: false });

    if (!tenants) return [];

    // Para cada tenant, conta profiles e modulos ativos
    const enriched = await Promise.all(
        tenants.map(async (t) => {
            const [profilesRes, modulesRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id", { count: "exact", head: true })
                    .eq("tenant_id", t.id),
                supabase
                    .from("tenant_modules")
                    .select("module_key, enabled")
                    .eq("tenant_id", t.id),
            ]);

            const enabled = (modulesRes.data ?? []).filter((m) => m.enabled).length;
            return {
                ...t,
                user_count: profilesRes.count ?? 0,
                enabled_modules: enabled,
                total_modules: MODULE_KEYS.length,
            };
        })
    );

    return enriched;
}

export default async function TenantsListPage() {
    const tenants = await loadTenants();

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {tenants.length} {tenants.length === 1 ? "empresa" : "empresas"}{" "}
                        cadastrada{tenants.length === 1 ? "" : "s"}.
                    </p>
                </div>
                <Link
                    href="/admin/tenants/new"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Novo tenant
                </Link>
            </div>

            {tenants.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <Th>Empresa</Th>
                                <Th>Status</Th>
                                <Th>Plano</Th>
                                <Th>Usuarios</Th>
                                <Th>Modulos</Th>
                                <Th>Criado em</Th>
                                <Th className="text-right pr-6">Acoes</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tenants.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                    <Td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                <Building2 className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-slate-900 truncate">
                                                    {t.name}
                                                </div>
                                                <div className="text-[11px] text-slate-500 truncate">
                                                    {t.slug}
                                                </div>
                                            </div>
                                        </div>
                                    </Td>
                                    <Td>
                                        {t.is_active ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full">
                                                <CheckCircle2 className="w-3 h-3" />
                                                Ativo
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-rose-700 bg-rose-50 rounded-full">
                                                <XCircle className="w-3 h-3" />
                                                Inativo
                                            </span>
                                        )}
                                    </Td>
                                    <Td>
                                        <span className="text-xs font-medium text-slate-600 capitalize">
                                            {t.plan}
                                        </span>
                                    </Td>
                                    <Td>
                                        <div className="flex items-center gap-1.5 text-slate-600">
                                            <UsersIcon className="w-3.5 h-3.5" />
                                            {t.user_count}
                                        </div>
                                    </Td>
                                    <Td>
                                        <span className="text-xs text-slate-600">
                                            {t.enabled_modules}/{t.total_modules}
                                        </span>
                                    </Td>
                                    <Td>
                                        <span className="text-xs text-slate-500">
                                            {new Date(t.created_at).toLocaleDateString(
                                                "pt-BR"
                                            )}
                                        </span>
                                    </Td>
                                    <Td className="text-right pr-6">
                                        <Link
                                            href={`/admin/tenants/${t.id}`}
                                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                                        >
                                            Gerenciar
                                            <ArrowRight className="w-3 h-3" />
                                        </Link>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function Th({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <th
            className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 ${className ?? ""}`}
        >
            {children}
        </th>
    );
}

function Td({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>
    );
}

function EmptyState() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-700">
                Nenhum tenant cadastrado
            </h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">
                Crie a primeira empresa para comecar.
            </p>
            <Link
                href="/admin/tenants/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
            >
                <Plus className="w-4 h-4" />
                Criar tenant
            </Link>
        </div>
    );
}
