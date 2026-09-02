"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Modulo IA Inteligencia — dados da pagina /inteligencia.
// A IA e SOMENTE observadora: nada aqui envia mensagem nem move card.

async function getAuth() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: profile } = await admin
        .from("profiles").select("tenant_id, role, full_name").eq("id", user.id).single();
    if (!profile?.tenant_id) throw new Error("Perfil sem tenant");
    return { admin, tenantId: profile.tenant_id as string, role: profile.role as string };
}

export async function getAiPageData() {
    try {
        const { admin, tenantId, role } = await getAuth();

        const [settingsRes, statesRes] = await Promise.all([
            admin.from("ai_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
            admin.from("deal_ai_state")
                .select(`
                    deal_id, funnel_stage, intent_score, service_interest, waiting_on,
                    waiting_since, appointment, price, summary, next_action,
                    lost_suggestion, origin_guess, confidence, updated_at,
                    deal:deals!deal_ai_state_deal_id_fkey (
                        id, title, status, origin,
                        contact:contacts ( name, phone, photo_url )
                    )
                `)
                .eq("tenant_id", tenantId)
                .order("updated_at", { ascending: false })
                .limit(500),
        ]);

        return {
            success: true,
            isAdmin: role === "admin",
            settings: settingsRes.data ?? null,
            states: statesRes.data ?? [],
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getAiConversationDetail(dealId: string) {
    try {
        const { admin, tenantId } = await getAuth();
        const [msgsRes, eventsRes, analysisRes] = await Promise.all([
            admin.from("messages")
                .select("id, direction, content, content_type, created_at")
                .eq("deal_id", dealId).eq("tenant_id", tenantId)
                .order("created_at", { ascending: false }).limit(40),
            admin.from("crm_events")
                .select("id, event_type, previous_value, new_value, source, confidence, created_at")
                .eq("deal_id", dealId).eq("tenant_id", tenantId)
                .order("created_at", { ascending: false }).limit(20),
            admin.from("ai_analysis")
                .select("structured_output, model, prompt_version, created_at, input_tokens, output_tokens")
                .eq("deal_id", dealId).eq("tenant_id", tenantId)
                .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        return {
            success: true,
            messages: (msgsRes.data ?? []).reverse(),
            events: eventsRes.data ?? [],
            analysis: analysisRes.data ?? null,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateAiSettings(patch: {
    enabled?: boolean;
    vertical?: string;
    analyze_from?: string | null;
}) {
    try {
        const { admin, tenantId, role } = await getAuth();
        if (role !== "admin") return { success: false, error: "Apenas administradores" };

        // Whitelist rigida: modo 'pilot' NAO e aceito aqui (Fase 3; hoje o motor
        // e somente observador e a UI nao deve prometer o que nao existe).
        const safe: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof patch.enabled === "boolean") safe.enabled = patch.enabled;
        if (patch.vertical && ["veterinary", "dentistry", "generic"].includes(patch.vertical)) safe.vertical = patch.vertical;
        if (patch.analyze_from !== undefined) safe.analyze_from = patch.analyze_from;

        const { error } = await admin.from("ai_settings")
            .upsert({ tenant_id: tenantId, ...safe }, { onConflict: "tenant_id" });
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
