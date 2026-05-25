/**
 * Helpers para obter contexto do tenant logado (server-side).
 *
 * Centraliza a busca de tenantId + modulos ativos para nao duplicar
 * a logica nos varios layouts e pages.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getTenantModules, type TenantModulesMap } from "@/lib/modules";

export interface TenantContext {
    tenantId: string;
    userId: string;
    modules: TenantModulesMap;
}

/**
 * Le o tenant_id e os modulos ativos do usuario logado.
 * Retorna null se nao houver sessao valida.
 *
 * Pode ser chamado de Server Components, layouts, server actions.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Server Component / RSC: ignora.
                    }
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const { data: profile } = await admin
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.tenant_id) return null;

    const modules = await getTenantModules(profile.tenant_id);

    return {
        tenantId: profile.tenant_id,
        userId: user.id,
        modules,
    };
}
