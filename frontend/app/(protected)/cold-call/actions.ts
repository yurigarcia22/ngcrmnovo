"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/utils/supabase/server";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

/**
 * Lista os pipelines de cold_call do tenant atual + as stages de cada um.
 * Usado pelo dropdown de funil em /cold-call.
 */
export async function getColdCallPipelinesWithStages() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const { data, error } = await supabase
            .from("pipelines")
            .select("id, name, is_default, stages(*)")
            .eq("tenant_id", tenantId)
            .eq("kind", "cold_call")
            .order("created_at", { ascending: true });

        if (error) throw error;

        // Ordena stages por position
        const sorted = (data ?? []).map((p: any) => ({
            ...p,
            stages: (p.stages ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
        }));

        return { success: true, data: sorted };
    } catch (error: any) {
        console.error("getColdCallPipelinesWithStages Error:", error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Move um cold_lead para outra stage.
 * Unificado com a Acao Rapida: mover pelo Kanban agora registra a interacao
 * igual ao botao do modal (incrementa cadencia, grava nota da metrica, sincroniza
 * status e, em etapa is_won, converte em deal). Antes so trocava stage_id e o
 * comentario citava um "trigger SQL" que nao existe.
 */
export async function moveColdLeadToStage(leadId: string, stageId: number) {
    return registerColdLeadStage(leadId, stageId);
}

/**
 * Converte um cold_lead em deal no funil de vendas (idempotente: reaproveita um
 * deal aberto do mesmo contato). Cria/acha o contato, cria o deal na etapa de
 * entrada do funil padrao e replica as notas. Usado quando o lead vai para uma
 * etapa is_won (Confirmado). Retorna o dealId.
 */
async function convertColdLeadToDeal(
    admin: any,
    tenantId: string,
    ownerId: string | null,
    lead: { id: string; nome?: string | null; telefone?: string | null; custom_fields?: any },
): Promise<string | null> {
    try {
        const rawDigits = String(lead.telefone || "").replace(/\D/g, "");
        if (rawDigits.length < 10) return null;
        // Canonico BR: 55 + DDD + (9) + numero.
        let canonical = rawDigits;
        if (!canonical.startsWith("55")) canonical = "55" + canonical;
        if (canonical.length === 12) canonical = canonical.slice(0, 4) + "9" + canonical.slice(4); // insere 9o digito
        const variants = Array.from(new Set([canonical, rawDigits,
            canonical.length === 13 && canonical[4] === "9" ? canonical.slice(0, 4) + canonical.slice(5) : ""].filter(Boolean)));

        // 1. Contato (acha ou cria)
        let contactId: string;
        const { data: existing } = await admin
            .from("contacts").select("id, phone").eq("tenant_id", tenantId).in("phone", variants);
        if (existing && existing.length > 0) {
            contactId = (existing.find((c: any) => c.phone === canonical) ?? existing[0]).id;
        } else {
            const { data: nc, error } = await admin
                .from("contacts")
                .insert({ name: lead.nome?.trim() || canonical, phone: canonical, tenant_id: tenantId, photo_url: "" })
                .select("id").single();
            if (error || !nc) return null;
            contactId = nc.id;
        }

        // 2. Idempotente: reaproveita deal aberto existente do contato.
        const { data: openDeal } = await admin
            .from("deals").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId).eq("status", "open")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (openDeal?.id) return openDeal.id;

        // 3. Etapa de entrada do funil de vendas padrao.
        const { data: inboxStageRpc } = await admin.rpc("get_tenant_inbox_stage", { p_tenant_id: tenantId });
        const stageId = inboxStageRpc as number | string | null;
        if (stageId == null) return null;

        // Decisor (nome + telefone direto) vai pro card de /leads.
        const decisorNome = lead.custom_fields?.decisor_nome;
        const decisorTelefone = lead.custom_fields?.decisor_telefone;
        const customValues: any = {};
        if (decisorNome) customValues.responsible_name = decisorNome;
        if (decisorTelefone) customValues.responsible_direct_phone = decisorTelefone;

        const { data: newDeal, error: dErr } = await admin
            .from("deals")
            .insert({
                title: lead.nome?.trim() || canonical,
                value: 0,
                contact_id: contactId,
                stage_id: stageId,
                status: "open",
                tenant_id: tenantId,
                owner_id: ownerId,
                custom_values: Object.keys(customValues).length ? customValues : null,
            })
            .select("id").single();
        if (dErr || !newDeal) return null;

        // 4. Replica o historico (cold_lead_notes -> notes do deal).
        try {
            const { data: leadNotes } = await admin
                .from("cold_lead_notes").select("content, created_at").eq("cold_lead_id", lead.id)
                .order("created_at", { ascending: true });
            if (leadNotes && leadNotes.length > 0) {
                await admin.from("notes").insert(leadNotes.map((n: any) => ({
                    deal_id: newDeal.id,
                    content: `[Histórico Cold Call]: ${n.content}`,
                    tenant_id: tenantId,
                    created_at: n.created_at,
                })));
            }
        } catch (e) { console.error("Replicar notas cold lead:", e); }

        return newDeal.id;
    } catch (e) {
        console.error("convertColdLeadToDeal Error:", e);
        return null;
    }
}

/**
 * Acao rapida: move o cold_lead para uma etapa do funil e registra a interacao.
 * - move stage_id (o card muda de coluna no kanban)
 * - incrementa a cadencia (tentativas) a cada acao
 * - grava ultimo_resultado = nome da etapa e ultima_interacao
 * - sincroniza o status text pelas flags da etapa (is_lost -> perdido, is_won ->
 *   convertido) para os contadores do dashboard continuarem corretos
 * - registra nota "Interacao Registrada: {etapa}" (metricas do dashboard)
 */
export async function registerColdLeadStage(leadId: string, stageId: number | string) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const stageIdNum = Number(stageId);

        const { data: lead, error: leadErr } = await admin
            .from("cold_leads")
            .select("id, status, tentativas, nome, telefone, custom_fields, responsavel_id")
            .eq("id", leadId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (leadErr || !lead) return { success: false, error: "Lead nao encontrado." };

        const { data: stage, error: stageErr } = await admin
            .from("stages")
            .select("id, name, is_won, is_lost")
            .eq("id", stageIdNum)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (stageErr || !stage) return { success: false, error: "Etapa nao encontrada." };

        // Sincroniza status com a etapa (so terminais sobrescrevem; reativa lead terminal
        // que voltou para uma etapa ativa).
        const TERMINAIS = new Set(["perdido", "convertido", "sem_interesse", "numero_inexistente"]);
        let newStatus = lead.status as string;
        if (stage.is_lost) newStatus = "perdido";
        else if (stage.is_won) newStatus = "convertido";
        else if (TERMINAIS.has(lead.status as string)) newStatus = "ligacao_feita";

        // Chave canonica que o dashboard reconhece. Ele conta callsMade/connections/
        // decisionMakers/meetings/conversions parseando "Interação Registrada: <chave>".
        // is_won -> 'convertido' (conta separado de 'reuniao_marcada', que antes inflava
        // o contador de reunioes). Distinguimos descartado x numero_inexistente.
        const sName = (stage.name || "").toLowerCase();
        let resultKey: string;
        if (stage.is_won) {
            resultKey = "convertido";
        } else if (stage.is_lost) {
            if (sName.includes("inexist") || sName.includes("invalid") || sName.includes("sem whatsapp")) {
                resultKey = "numero_inexistente";
            } else {
                resultKey = "descartado";
            }
        }
        else if (sName.includes("decisor")) resultKey = "contato_decisor";
        else if (sName.includes("reuni") || sName.includes("agendad")) resultKey = "reuniao_marcada";
        else if (sName.includes("contato")) resultKey = "contato_realizado";
        else resultKey = "ligacao_feita";

        const updates: any = {
            stage_id: stageIdNum,
            status: newStatus,
            tentativas: (lead.tentativas || 0) + 1,
            ultimo_resultado: stage.name,
            ultima_interacao: new Date().toISOString(),
        };

        const { data: updated, error: updErr } = await admin
            .from("cold_leads")
            .update(updates)
            .eq("id", leadId)
            .eq("tenant_id", tenantId)
            .select()
            .single();
        if (updErr) return { success: false, error: updErr.message };

        // Nota de atividade (metrica do dashboard)
        let actingUserId: string | null = null;
        try {
            const ssr = await createSSRClient();
            const { data: { user } } = await ssr.auth.getUser();
            actingUserId = user?.id ?? null;
            if (user) {
                await admin.from("cold_lead_notes").insert({
                    cold_lead_id: leadId,
                    content: `Interação Registrada: ${resultKey}`,
                    created_by: user.id,
                });
            }
        } catch (e) {
            console.error("registerColdLeadStage log error:", e);
        }

        // Etapa de ganho (is_won) -> converte o cold lead em deal no funil de vendas
        // (cria contato + deal + replica notas). Antes so a Acao Rapida nao convertia,
        // deixando a venda orfa de /leads. Idempotente (reaproveita deal aberto).
        let convertedDealId: string | null = null;
        if (stage.is_won) {
            convertedDealId = await convertColdLeadToDeal(
                admin, tenantId, (lead as any).responsavel_id ?? actingUserId,
                { id: lead.id, nome: (lead as any).nome, telefone: (lead as any).telefone, custom_fields: (lead as any).custom_fields },
            );
            revalidatePath("/leads");
        }

        revalidatePath("/cold-call");
        return { success: true, data: updated, convertedDealId };
    } catch (error: any) {
        console.error("registerColdLeadStage Error:", error);
        return { success: false, error: error.message };
    }
}
