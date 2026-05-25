"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";

export interface OnboardingState {
    needsOnboarding: boolean;
    steps: {
        whatsapp: boolean;
        team: boolean;
        tags: boolean;
        products: boolean;
        deals: boolean;
    };
}

/**
 * Retorna o estado de onboarding do tenant atual.
 * Considera "needs onboarding" se 3+ passos ainda nao foram feitos.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
    const tenantId = await getTenantId();
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );

    const [whatsappRes, teamRes, tagsRes, productsRes, dealsRes] = await Promise.all([
        supabase.from("whatsapp_instances").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "connected"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("tags").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("deals").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);

    const steps = {
        whatsapp: (whatsappRes.count ?? 0) > 0,
        team:     (teamRes.count ?? 0) >= 2,    // 2+ usuarios = equipe formada
        tags:     (tagsRes.count ?? 0) > 0,
        products: (productsRes.count ?? 0) > 0,
        deals:    (dealsRes.count ?? 0) > 0,
    };

    const doneCount = Object.values(steps).filter(Boolean).length;
    return {
        needsOnboarding: doneCount < 4, // mostra banner se ainda nao fez >=4
        steps,
    };
}
