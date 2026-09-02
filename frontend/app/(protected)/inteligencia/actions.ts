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
                    lost_suggestion, origin_guess, confidence, updated_at, first_contact_at,
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
    mode?: string;
    alerts_enabled?: boolean;
    daily_digest?: boolean;
}) {
    try {
        const { admin, tenantId, role } = await getAuth();
        if (role !== "admin") return { success: false, error: "Apenas administradores" };

        const safe: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof patch.enabled === "boolean") safe.enabled = patch.enabled;
        if (patch.vertical && ["veterinary", "dentistry", "generic"].includes(patch.vertical)) safe.vertical = patch.vertical;
        if (patch.analyze_from !== undefined) safe.analyze_from = patch.analyze_from;
        if (typeof patch.alerts_enabled === "boolean") safe.alerts_enabled = patch.alerts_enabled;
        if (typeof patch.daily_digest === "boolean") safe.daily_digest = patch.daily_digest;

        // Piloto so liga com mapeamento configurado — senao nao ha o que mover
        // e o usuario acharia que "nao funciona".
        if (patch.mode && ["observer", "pilot"].includes(patch.mode)) {
            if (patch.mode === "pilot") {
                const { count } = await admin.from("ai_stage_mapping")
                    .select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
                if (!count) return { success: false, error: "Configure o mapeamento de etapas antes de ativar o Piloto." };
            }
            safe.mode = patch.mode;
        }

        const { error } = await admin.from("ai_settings")
            .upsert({ tenant_id: tenantId, ...safe }, { onConflict: "tenant_id" });
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Etapas do funil de vendas default + mapeamentos atuais (para a tela do Piloto)
export async function getAiMappingData() {
    try {
        const { admin, tenantId } = await getAuth();
        const { data: pipeline } = await admin.from("pipelines")
            .select("id, name").eq("tenant_id", tenantId).eq("kind", "deals").eq("is_default", true)
            .limit(1).maybeSingle();
        if (!pipeline) return { success: false, error: "Nenhum funil de vendas padrão." };

        const [stagesRes, mapsRes] = await Promise.all([
            // Ganho/perda ficam FORA de proposito: fechar negócio é decisão humana.
            admin.from("stages").select("id, name, position, is_inbox")
                .eq("pipeline_id", pipeline.id).eq("is_won", false).eq("is_lost", false)
                .order("position"),
            admin.from("ai_stage_mapping").select("ai_stage, stage_id")
                .eq("tenant_id", tenantId).eq("pipeline_id", pipeline.id),
        ]);
        return { success: true, pipeline, stages: stagesRes.data ?? [], mappings: mapsRes.data ?? [] };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveAiStageMappings(pipelineId: number, rows: { ai_stage: string; stage_id: number | null }[]) {
    try {
        const { admin, tenantId, role } = await getAuth();
        if (role !== "admin") return { success: false, error: "Apenas administradores" };

        // Valida que todas as etapas pertencem ao tenant e nao sao ganho/perda
        const ids = rows.filter((r) => r.stage_id != null).map((r) => r.stage_id);
        if (ids.length > 0) {
            const { data: valid } = await admin.from("stages").select("id")
                .in("id", ids).eq("tenant_id", tenantId).eq("is_won", false).eq("is_lost", false);
            if ((valid ?? []).length !== new Set(ids).size) {
                return { success: false, error: "Etapa inválida no mapeamento." };
            }
        }
        await admin.from("ai_stage_mapping").delete()
            .eq("tenant_id", tenantId).eq("pipeline_id", pipelineId);
        const inserts = rows.filter((r) => r.stage_id != null)
            .map((r) => ({ tenant_id: tenantId, pipeline_id: pipelineId, ai_stage: r.ai_stage, stage_id: r.stage_id }));
        if (inserts.length > 0) {
            const { error } = await admin.from("ai_stage_mapping").insert(inserts);
            if (error) throw error;
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Transforma o funil de vendas default no FUNIL PADRAO DE CLINICA
// (Novo contato -> Em conversa -> Quer agendar -> Agendado -> Atendido / Perdido)
// e ja configura o mapeamento da IA. So aplica em funis com a estrutura
// generica padrao — funil muito customizado exige ajuste manual.
export async function applyClinicFunnel() {
    try {
        const { admin, tenantId, role } = await getAuth();
        if (role !== "admin") return { success: false, error: "Apenas administradores" };

        const { data: pipeline } = await admin.from("pipelines")
            .select("id, name").eq("tenant_id", tenantId).eq("kind", "deals").eq("is_default", true)
            .limit(1).maybeSingle();
        if (!pipeline) return { success: false, error: "Nenhum funil de vendas padrão." };

        const { data: stages } = await admin.from("stages")
            .select("id, name, position, is_inbox, is_won, is_lost")
            .eq("pipeline_id", pipeline.id).order("position");
        const all = stages ?? [];
        const inbox = all.filter((s) => s.is_inbox);
        const won = all.filter((s) => s.is_won);
        const lost = all.filter((s) => s.is_lost);
        const mid = all.filter((s) => !s.is_inbox && !s.is_won && !s.is_lost);

        if (inbox.length !== 1 || won.length !== 1 || lost.length !== 1 || mid.length < 2 || mid.length > 3) {
            return { success: false, error: `Funil "${pipeline.name}" tem estrutura customizada (${all.length} etapas) — ajuste manualmente ou me chame.` };
        }

        // Renomeia mantendo os IDs (os cards ficam onde estão)
        const upd = async (id: number, patch: Record<string, unknown>) =>
            admin.from("stages").update(patch).eq("id", id).eq("tenant_id", tenantId);
        await upd(inbox[0].id, { name: "Novo contato", color: "#6366f1", position: 0 });
        await upd(mid[0].id, { name: "Em conversa", color: "#3b82f6", position: 1 });
        await upd(mid[1].id, { name: "Quer agendar", color: "#f59e0b", position: 2 });
        let agendadoId: number;
        if (mid[2]) {
            await upd(mid[2].id, { name: "Agendado", color: "#10b981", position: 3 });
            agendadoId = mid[2].id;
        } else {
            const { data: novo, error } = await admin.from("stages")
                .insert({ pipeline_id: pipeline.id, tenant_id: tenantId, name: "Agendado", color: "#10b981", position: 3, is_inbox: false, is_won: false, is_lost: false })
                .select("id").single();
            if (error) throw error;
            agendadoId = novo.id;
        }
        await upd(won[0].id, { name: "Atendido", color: "#059669", position: 4 });
        await upd(lost[0].id, { color: "#ef4444", position: 5 });

        // Mapeamento IA -> funil (deixa o Piloto pronto pra ligar)
        await admin.from("ai_stage_mapping").delete().eq("tenant_id", tenantId).eq("pipeline_id", pipeline.id);
        const mapRows = [
            { ai_stage: "NEW_LEAD", stage_id: inbox[0].id },
            { ai_stage: "QUALIFYING", stage_id: mid[0].id },
            { ai_stage: "QUALIFIED", stage_id: mid[0].id },
            { ai_stage: "SCHEDULING", stage_id: mid[1].id },
            { ai_stage: "SCHEDULED", stage_id: agendadoId },
        ].map((r) => ({ ...r, tenant_id: tenantId, pipeline_id: pipeline.id }));
        const { error: mapErr } = await admin.from("ai_stage_mapping").insert(mapRows);
        if (mapErr) throw mapErr;

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
