import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
    ArrowLeft,
    Building2,
    Mail,
} from "lucide-react";
import { MODULE_REGISTRY, MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import { TenantDetailClient } from "./TenantDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ id: string }>;
}

async function loadTenant(id: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const [tenantRes, modulesRes, profilesRes] = await Promise.all([
        supabase
            .from("tenants")
            .select("id, name, slug, plan, is_active, billing_email, notes, created_at")
            .eq("id", id)
            .maybeSingle(),
        supabase
            .from("tenant_modules")
            .select("module_key, enabled")
            .eq("tenant_id", id),
        supabase
            .from("profiles")
            .select("id, full_name, role, is_active")
            .eq("tenant_id", id)
            .order("full_name"),
    ]);

    if (!tenantRes.data) return null;

    // Mapa de modulos: chave -> enabled
    const modulesMap: Record<ModuleKey, boolean> = Object.fromEntries(
        MODULE_KEYS.map((k) => [k, MODULE_REGISTRY[k].defaultEnabled])
    ) as Record<ModuleKey, boolean>;
    for (const row of modulesRes.data ?? []) {
        if (MODULE_KEYS.includes(row.module_key as ModuleKey)) {
            modulesMap[row.module_key as ModuleKey] = row.enabled;
        }
    }

    return {
        tenant: tenantRes.data,
        modules: modulesMap,
        profiles: profilesRes.data ?? [],
    };
}

export default async function TenantDetailPage({ params }: PageProps) {
    const { id } = await params;
    const data = await loadTenant(id);
    if (!data) notFound();

    const { tenant, modules, profiles } = data;

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <Link
                href="/admin/tenants"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-4 transition-colors"
            >
                <ArrowLeft className="w-3 h-3" />
                Tenants
            </Link>

            <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Building2 className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {tenant.name}
                        </h1>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span className="font-mono">{tenant.slug}</span>
                            <span>·</span>
                            <span className="capitalize">{tenant.plan}</span>
                            <span>·</span>
                            <span>
                                Criado em {new Date(tenant.created_at).toLocaleDateString("pt-BR")}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <TenantDetailClient
                tenantId={tenant.id}
                tenant={tenant}
                modules={modules}
                profiles={profiles}
            />
        </div>
    );
}
