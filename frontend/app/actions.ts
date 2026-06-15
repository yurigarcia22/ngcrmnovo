"use server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { scheduleTaskNotifications } from "@/lib/notifications";
import { normalizeToCanonical, getPossibleVariants, isPlausibleBRPhone } from "@/lib/phone";
import * as XLSX from 'xlsx';
import OpenAI from 'openai';

// --- HELPER: Get Tenant ID ---
export async function getTenantId() {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("Usuário não autenticado.");
    }

    // Busca o tenant_id no perfil do usuário
    // Usamos o Admin Client aqui pois policies de profile podem ser estritas
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile, error } = await adminClient
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

    if (error || !profile?.tenant_id) {
        console.error("Erro ao buscar tenant_id:", error);
        throw new Error("Falha ao identificar a empresa do usuário.");
    }

    return profile.tenant_id;
}

export async function updateTag(tagId: string, name: string, color: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('tags')
        .update({ name, color })
        .eq('id', tagId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

// --- HELPERS: instancia/numero da conversa ---

// Resolve a instancia que o envio usaria para este usuario (pessoal conectada,
// senao geral conectada). Mesma logica do sendMessage, reaproveitada.
async function resolveSendInstanceName(adminClient: any, tenantId: string, userId: string): Promise<string | null> {
    const { data: personal } = await adminClient
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("tenant_id", tenantId)
        .eq("owner_profile_id", userId)
        .eq("status", "connected")
        .maybeSingle();
    if (personal?.instance_name) return personal.instance_name;
    const { data: general } = await adminClient
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("tenant_id", tenantId)
        .is("owner_profile_id", null)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
    return general?.instance_name ?? null;
}

// Monta um rotulo amigavel para uma instancia (nome custom > telefone > instance_name).
async function describeInstance(adminClient: any, tenantId: string, instanceName: string | null) {
    if (!instanceName) return null;
    const { data } = await adminClient
        .from("whatsapp_instances")
        .select("instance_name, custom_name, phone_number")
        .eq("tenant_id", tenantId)
        .eq("instance_name", instanceName)
        .maybeSingle();
    return {
        instance_name: instanceName,
        label: data?.custom_name || data?.phone_number || instanceName,
        phone: data?.phone_number || null,
    };
}

// Numero (instancia) mais recente E o primeiro usado na conversa de um deal.
async function getConversationInstances(adminClient: any, dealId: string): Promise<{ current: string | null; first: string | null }> {
    if (!dealId) return { current: null, first: null };
    const { data } = await adminClient
        .from("messages")
        .select("instance_name, created_at")
        .eq("deal_id", dealId)
        .not("instance_name", "is", null)
        .order("created_at", { ascending: true });
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return { current: null, first: null };
    return { current: rows[rows.length - 1].instance_name, first: rows[0].instance_name };
}

/**
 * Info de numero para a janela de conversa: qual numero esta falando com o lead
 * (current), qual foi o primeiro, e qual numero o envio usaria agora (wouldUse).
 * `diverges` = wouldUse difere do current (base para o aviso na UI).
 */
export async function getConversationNumberInfo(dealId: string) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Nao autenticado." };

        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: profile } = await adminClient
            .from("profiles").select("tenant_id").eq("id", user.id).single();
        if (!profile?.tenant_id) return { success: false, error: "Empresa nao identificada." };
        const tenantId = profile.tenant_id;

        const { current, first } = await getConversationInstances(adminClient, dealId);
        const wouldUseName = await resolveSendInstanceName(adminClient, tenantId, user.id);

        const [currentInfo, firstInfo, wouldUseInfo] = await Promise.all([
            describeInstance(adminClient, tenantId, current),
            describeInstance(adminClient, tenantId, first),
            describeInstance(adminClient, tenantId, wouldUseName),
        ]);

        const diverges = !!currentInfo && !!wouldUseInfo && currentInfo.instance_name !== wouldUseInfo.instance_name;

        return { success: true, data: { current: currentInfo, first: firstInfo, wouldUse: wouldUseInfo, diverges } };
    } catch (error: any) {
        console.error("getConversationNumberInfo Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Normaliza numero brasileiro para o formato que a Evolution espera (com DDI 55).
 * Prefixa 55 quando o numero vem so com DDD + numero (10 ou 11 digitos).
 * Numeros ja com 55 ou em formato desconhecido sao retornados como vieram
 * (deixando a Evolution validar).
 */
function normalizeBrazilPhone(raw: string): string {
    const d = (raw || "").replace(/\D/g, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
    if (d.length === 10 || d.length === 11) return "55" + d;
    return d;
}

// --- ACTIONS ---

export async function sendMessage(phone: string, text: string, context: { dealId: string, contactId: string }, opts?: { force?: boolean }) {
    try {
        const cookieStore = await cookies();

        // 1. Inicializar Supabase com Cookies para Auth correta
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch { }
                    },
                },
            }
        );

        // 2. Verificar Autenticação
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            throw new Error("Usuário não autenticado. Por favor, faça login novamente.");
        }

        // 3. Obter Tenant ID
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Pode usar helper getTenantId ou buscar aqui direto pra garantir atomicidade
        const { data: profile } = await adminClient
            .from("profiles")
            .select("tenant_id")
            .eq("id", user.id)
            .single();

        if (!profile?.tenant_id) throw new Error("Empresa não identificada.");
        const tenantId = profile.tenant_id;

        // 4. Seleção de Instância (Lógica Multi-Agente)
        // Prioridade 1: Instância Pessoal (Dono = User)
        let { data: instanceData } = await adminClient
            .from("whatsapp_instances")
            .select("instance_name, owner_profile_id")
            .eq("tenant_id", tenantId)
            .eq("owner_profile_id", user.id)
            .eq("status", "connected") // Apenas conectadas
            .maybeSingle();

        // Prioridade 2: Instância Geral (Dono = NULL) - Fallback
        if (!instanceData) {
            console.log(`[sendMessage] Nenhuma instância pessoal encontrada para user ${user.id}. Buscando geral...`);
            const { data: generalInstance } = await adminClient
                .from("whatsapp_instances")
                .select("instance_name, owner_profile_id")
                .eq("tenant_id", tenantId)
                .is("owner_profile_id", null)
                .eq("status", "connected")
                .limit(1)
                .maybeSingle(); // Pega a primeira geral disponível

            instanceData = generalInstance;
        }

        if (!instanceData) {
            console.warn(`[sendMessage] Nenhuma instância ativa encontrada para tenant ${tenantId}.`);
            throw new Error("Nenhum WhatsApp conectado disponivel (Pessoal ou Geral). Verifique as conexões.");
        }

        const instanceName = instanceData.instance_name;
        console.log(`[sendMessage] Enviando via: ${instanceName} (Owner: ${instanceData.owner_profile_id || 'GERAL'})`);

        // 4.1 Trava: avisa quando o numero que vai responder diverge do numero
        // que ja conversava com o lead (a UI mostra a confirmacao e re-chama com force).
        if (!opts?.force && context.dealId) {
            const established = (await getConversationInstances(adminClient, context.dealId)).current;
            if (established && established !== instanceName) {
                const [current, wouldUse] = await Promise.all([
                    describeInstance(adminClient, tenantId, established),
                    describeInstance(adminClient, tenantId, instanceName),
                ]);
                return { success: false, needsConfirmation: true, current, wouldUse };
            }
        }

        // 5. Configuração Evolution API
        const url = process.env.EVOLUTION_API_URL;
        const token = process.env.EVOLUTION_API_TOKEN;

        if (!url || !token) throw new Error("Configuração da Evolution API ausente.");

        // 6. Preparar Envio
        const cleanPhone = normalizeBrazilPhone(phone);
        const body = {
            number: cleanPhone,
            text: text,
            options: {
                delay: 1200,
                presence: "composing",
                linkPreview: true
            }
        };

        // 7. Enviar Request (POST)
        const response = await fetch(`${url}/message/sendText/${encodeURIComponent(instanceName)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": token,
            },
            body: JSON.stringify(body),
            // Nunca deixa a request pendurar pra sempre (era o "carregando infinito"
            // que travava a janela inteira do chat quando a Evolution nao respondia).
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            // Tenta ler erro detalhado
            const errorData = await response.json().catch(() => ({}));
            console.error("Evolution API Error:", errorData);
            const rawMsg = Array.isArray(errorData?.response?.message)
                ? errorData.response.message.join("; ")
                : (errorData?.response?.message || errorData?.message || "");
            const friendly = /not.*exist|number|jid|invalid/i.test(String(rawMsg))
                ? `Número inválido ou sem WhatsApp: ${cleanPhone}. Confira o número do contato.`
                : (rawMsg || "Falha ao enviar mensagem na API.");
            return { success: false, error: friendly };
        }

        const successData = await response.json();

        // 8. Salvar Histórico no Banco
        // Usamos adminClient ou supabase client normal?
        // Como 'messages' pode ter RLS estrito, adminClient garante a escrita.
        const { data: insertedRow, error: insertError } = await adminClient.from("messages").insert({
            deal_id: context.dealId,
            contact_id: context.contactId,
            direction: "outbound",
            type: "text",
            content: text,
            status: "sent",
            created_at: new Date().toISOString(),
            tenant_id: tenantId,
            instance_name: instanceName,
            evolution_message_id: successData?.key?.id ?? null,
            // sender_profile_id: user.id // Se tiver essa coluna, bom adicionar
        }).select("id").single();

        if (insertError) {
            console.error("Erro ao salvar mensagem:", insertError);
            // Mensagem foi enviada, então retornamos sucesso mas com aviso no log
        }

        // Devolve os ids para o cliente reconciliar a bolha otimista com a row real
        // (em vez de casar por content/type, que duplicava em mensagens iguais).
        return {
            success: true,
            data: successData,
            messageId: insertedRow?.id ?? null,
            evolutionMessageId: successData?.key?.id ?? null,
        };

    } catch (error: any) {
        console.error("sendMessage Exception:", error);
        const friendly = error?.name === "TimeoutError" || error?.name === "AbortError"
            ? "O envio demorou demais e foi cancelado. Verifique a conexão do WhatsApp e tente de novo."
            : (error.message || "Erro interno ao enviar mensagem.");
        return { success: false, error: friendly };
    }
}

export async function createLead(data: {
    name: string;
    phone: string;
    value: string;
    email?: string;
    pipelineId?: string | number | null;
    stageId?: string | number | null;
    ownerId?: string | null;
    notes?: string;
    tagIds?: (number | string)[];
}) {
    try {
        const tenantId = await getTenantId();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Validacao + normalizacao do telefone
        if (!isPlausibleBRPhone(data.phone)) {
            return { success: false, error: "Telefone invalido. Digite no formato (XX) 9XXXX-XXXX." };
        }
        const phoneToSave = normalizeToCanonical(data.phone);
        const possiblePhones = getPossibleVariants(data.phone);

        // 2. Verificar/Criar Contato
        let contactId: string;
        const { data: existingContacts } = await supabase
            .from("contacts")
            .select("id, phone, name, email")
            .eq("tenant_id", tenantId)
            .in("phone", possiblePhones);

        if (existingContacts && existingContacts.length > 0) {
            const canonicalMatch = existingContacts.find((c: any) => c.phone === phoneToSave);
            const picked = canonicalMatch ?? existingContacts[0];
            contactId = picked.id;
            // Backfill canonico + dados novos
            await supabase.from("contacts").update({
                phone: phoneToSave,
                name: picked.name || data.name,
                email: picked.email || data.email || null,
            }).eq("id", contactId);
        } else {
            const { data: newContact, error: contactError } = await supabase
                .from("contacts")
                .insert({
                    name: data.name,
                    phone: phoneToSave,
                    email: data.email || null,
                    photo_url: "",
                    tenant_id: tenantId,
                })
                .select("id")
                .single();
            if (contactError) throw new Error("Erro ao criar contato: " + contactError.message);
            contactId = newContact.id;
        }

        // 3. Resolver pipeline + stage (deals only, nunca cold_call)
        let stageId: number | string | null = null;
        let resolvedPipelineId: number | string | null = null;

        if (data.stageId) {
            // Cliente passou stage explicitamente: valida que pertence a um pipeline kind='deals' do tenant
            const { data: stageRow } = await supabase
                .from("stages")
                .select("id, pipeline_id, pipelines!inner(kind, tenant_id)")
                .eq("id", data.stageId)
                .eq("tenant_id", tenantId)
                .maybeSingle();
            if (stageRow && (stageRow as any).pipelines?.kind === "deals") {
                stageId = stageRow.id;
                resolvedPipelineId = stageRow.pipeline_id;
            }
        }
        if (!stageId && data.pipelineId) {
            // Pipeline explicito: pega a primeira stage dele (position 0 ou is_inbox)
            const { data: stageRow } = await supabase
                .from("stages")
                .select("id, pipeline_id, position, is_inbox")
                .eq("pipeline_id", data.pipelineId)
                .eq("tenant_id", tenantId)
                .order("is_inbox", { ascending: false })
                .order("position", { ascending: true })
                .limit(1)
                .maybeSingle();
            if (stageRow) {
                stageId = stageRow.id;
                resolvedPipelineId = stageRow.pipeline_id;
            }
        }
        if (!stageId) {
            // Fallback: primeira stage do primeiro pipeline 'deals' do tenant
            const { data: stageRow } = await supabase
                .from("stages")
                .select("id, pipeline_id, pipelines!inner(kind, is_default, tenant_id)")
                .eq("tenant_id", tenantId)
                .eq("pipelines.kind", "deals")
                .order("position", { ascending: true })
                .limit(1)
                .maybeSingle();
            if (!stageRow) {
                throw new Error("Nenhum funil de vendas configurado. Crie um em Configurações > Funis.");
            }
            stageId = stageRow.id;
            resolvedPipelineId = stageRow.pipeline_id;
        }

        // 4. Se ja existe deal ABERTO pra esse contato no mesmo pipeline, reusa
        const { data: openDeal } = await supabase
            .from("deals")
            .select("id, stage_id, value")
            .eq("tenant_id", tenantId)
            .eq("contact_id", contactId)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(5);

        if (openDeal && openDeal.length > 0) {
            // Verifica se algum dos deals abertos esta no pipeline alvo
            const stagesOfPipeline = resolvedPipelineId
                ? (await supabase.from("stages").select("id").eq("pipeline_id", resolvedPipelineId)).data?.map((s: any) => s.id) ?? []
                : [];
            const dealInPipeline = openDeal.find((d: any) => stagesOfPipeline.includes(d.stage_id));
            if (dealInPipeline) {
                const newValue = parseFloat(data.value) || 0;
                if (newValue > 0) {
                    await supabase.from("deals").update({ value: newValue }).eq("id", dealInPipeline.id);
                }
                return { success: true, reused: true, dealId: dealInPipeline.id };
            }
        }

        // 5. Criar Deal novo
        const { data: newDeal, error: dealError } = await supabase
            .from("deals")
            .insert({
                title: "Oportunidade: " + data.name,
                value: parseFloat(data.value) || 0,
                contact_id: contactId,
                stage_id: stageId,
                status: "open",
                tenant_id: tenantId,
                owner_id: data.ownerId || null,
            })
            .select("id")
            .single();

        if (dealError) throw new Error("Erro ao criar negócio: " + dealError.message);

        // 6. Adicionar tags (opcional)
        if (data.tagIds && data.tagIds.length > 0 && newDeal?.id) {
            const tagsToInsert = data.tagIds.map((tagId) => ({
                deal_id: newDeal.id,
                tag_id: tagId,
                tenant_id: tenantId,
            }));
            await supabase.from("deal_tags").insert(tagsToInsert);
        }

        // 7. Nota inicial (opcional)
        if (data.notes && data.notes.trim().length > 0 && newDeal?.id) {
            await supabase.from("notes").insert({
                deal_id: newDeal.id,
                content: data.notes.trim(),
                tenant_id: tenantId,
            });
        }

        return { success: true, dealId: newDeal?.id };

    } catch (error: any) {
        console.error("createLead Error:", error);
        return { success: false, error: error.message };
    }
}

// Colunas que o app pode alterar num deal (whitelist contra escrita arbitraria).
const DEAL_UPDATABLE_FIELDS = new Set([
    "title", "value", "owner_id", "stage_id", "status",
    "lost_reason_id", "lost_reason", "expected_close_date",
    "snoozed_until", "resolved_at", "custom_values",
]);

export async function updateDeal(dealId: string, data: any) {
    try {
        // Service role ignora RLS, entao filtramos por tenant_id no servidor para
        // impedir que um usuario altere um deal de outra empresa (IDOR).
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Whitelist: ignora chaves nao permitidas (ex: tenant_id, id).
        const payload: any = {};
        for (const k of Object.keys(data || {})) {
            if (DEAL_UPDATABLE_FIELDS.has(k)) payload[k] = data[k];
        }
        if (Object.keys(payload).length === 0) {
            return { success: false, error: "Nenhum campo válido para atualizar." };
        }

        const { error } = await supabase
            .from("deals")
            .update(payload)
            .eq("id", dealId)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error("updateDeal Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateContact(contactId: string, data: any) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("contacts")
            .update(data)
            .eq("id", contactId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("updateContact Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteContact(contactId: string, deleteDealsOption: boolean) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Handle Deals
        if (deleteDealsOption) {
            // Delete associated deals and their messages
            const { data: deals } = await supabase.from('deals').select('id').eq('contact_id', contactId).eq('tenant_id', tenantId);
            if (deals && deals.length > 0) {
                const dealIds = deals.map(d => d.id);
                await supabase.from('messages').delete().in('deal_id', dealIds);
                await supabase.from('goals').delete().in('deal_id', dealIds); // If goals exist
                await supabase.from('notes').delete().in('deal_id', dealIds);
                await supabase.from('tasks').delete().in('deal_id', dealIds);
                await supabase.from('deals').delete().in('id', dealIds);
            }
        } else {
            // Check if deals exist, if so, we might need to unlink them
            // Assuming contact_id is nullable. If not, this might fail.
            // But usually in CRM delete contact means delete everything related.
            // If user unchecks "Delete Deal", maybe they want to keep the conversation/deal?
            // But conversation IS the deal often.
            // I'll try to set contact_id to NULL.
            await supabase.from('deals').update({ contact_id: null }).eq('contact_id', contactId).eq('tenant_id', tenantId);
        }

        // 2. Delete Contact
        const { error } = await supabase
            .from("contacts")
            .delete()
            .eq("id", contactId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteContact Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteDeal(dealId: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Confirma que o deal pertence ao tenant antes de apagar nada (service role
        // ignora RLS — sem isso, um id de outro tenant apagaria dados alheios).
        const { data: owned } = await supabase
            .from("deals")
            .select("id")
            .eq("id", dealId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (!owned) {
            return { success: false, error: "Negócio não encontrado." };
        }

        await supabase.from("messages").delete().eq("deal_id", dealId).eq("tenant_id", tenantId);

        const { error } = await supabase
            .from("deals")
            .delete()
            .eq("id", dealId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteDeal Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteDeals(dealIds: string[]) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const tenantId = await getTenantId();

        // So opera sobre os deals que REALMENTE pertencem ao tenant (service role
        // ignora RLS; sem isso, ids de outro tenant apagariam mensagens alheias).
        const { data: ownedDeals } = await supabase
            .from("deals")
            .select("id")
            .in("id", dealIds)
            .eq("tenant_id", tenantId);
        const ownedIds = (ownedDeals ?? []).map((d: any) => d.id);
        if (ownedIds.length === 0) return { success: true };

        // 1. Delete dependent messages
        await supabase.from("messages").delete().in("deal_id", ownedIds);
        // 2. Delete tasks
        await supabase.from("tasks").delete().in("deal_id", ownedIds);
        // 3. Delete notes
        await supabase.from("notes").delete().in("deal_id", ownedIds);

        // 4. Delete Deals
        const { error } = await supabase
            .from("deals")
            .delete()
            .in("id", ownedIds)
            .eq("tenant_id", tenantId); // Security check

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteDeals Error:", error);
        return { success: false, error: error.message };
    }
}

// DEAL CONTACTS ACTIONS
export async function addDealContact(dealId: string, contact: { name: string, phone?: string, email?: string, title?: string }) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data, error } = await supabase
            .from("deal_contacts")
            .insert({ ...contact, deal_id: dealId })
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("addDealContact Error:", error);
        return { success: false, error: error.message };
    }
}

export async function removeDealContact(contactId: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("deal_contacts")
            .delete()
            .eq("id", contactId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("removeDealContact Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getDealContacts(dealId: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data, error } = await supabase
            .from("deal_contacts")
            .select("*")
            .eq("deal_id", dealId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getDealContacts Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateDealContact(contactId: string, updates: any) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // If setting as primary, we might want to unset others for this deal? 
        // For simplicity, let's just update the specific contact for now. 
        // Ideally, we'd use a transaction or a second query to unset others 
        // if updates.is_primary is true.

        if (updates.is_primary) {
            // Fetch deal_id to unset others
            const { data: current } = await supabase.from('deal_contacts').select('deal_id').eq('id', contactId).single();
            if (current) {
                await supabase.from('deal_contacts').update({ is_primary: false }).eq('deal_id', current.deal_id);
            }
        }

        const { data, error } = await supabase
            .from("deal_contacts")
            .update(updates)
            .eq("id", contactId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("updateDealContact Error:", error);
        return { success: false, error: error.message };
    }
}

// --- Deal Members Actions ---

export async function addDealMember(dealId: string, userId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Verifica se o usuário já é o owner do deal
        const { data: dealData, error: dealError } = await supabase
            .from("deals")
            .select("owner_id")
            .eq("id", dealId)
            .single();

        if (dealError) throw dealError;

        if (dealData?.owner_id === userId) {
            return { success: false, error: "O usuário já é o titular desta oportunidade." };
        }

        const { data, error } = await supabase
            .from("deal_members")
            .insert({
                deal_id: dealId,
                user_id: userId,
                tenant_id: tenantId
            })
            .select(`*, profiles(id, full_name, avatar_url)`)
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        // Ignore unique constraint error (already member)
        if (error.code === '23505') return { success: false, error: "Este usuário já é um participante desta oportunidade." };
        console.error("addDealMember Error:", error);
        return { success: false, error: error.message };
    }
}

export async function removeDealMember(memberId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("deal_members")
            .delete()
            .eq("id", memberId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("removeDealMember Error:", error);
        return { success: false, error: error.message };
    }
}

// MEETING RESCHEDULE ACTION
export async function rescheduleTask(taskId: string, newDate: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .update({ due_date: newDate })
            .eq("id", taskId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("rescheduleTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateDeals(dealIds: string[], updates: any) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const tenantId = await getTenantId();

        const { error } = await supabase
            .from("deals")
            .update(updates)
            .in("id", dealIds)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("updateDeals Error:", error);
        return { success: false, error: error.message };
    }
}

export async function sendMedia(formData: FormData) {
    try {
        const tenantId = await getTenantId();

        const file = formData.get('file') as File;
        const phone = formData.get('phone') as string;
        const dealId = formData.get('dealId') as string;
        const contactId = formData.get('contactId') as string;
        const caption = (formData.get('caption') as string) || "";
        const force = formData.get('force') === 'true';

        if (!file || !phone || !dealId) {
            throw new Error("Missing required fields");
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const evolutionUrl = process.env.EVOLUTION_API_URL!;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN!;

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Instancia conectada (mesma logica do sendMessage). Antes usava
        // process.env.EVOLUTION_INSTANCE, que estava vazio -> o anexo nao enviava.
        let mediaUserId: string | undefined;
        try {
            const ssr = await createSupabaseServerClient();
            const { data: { user } } = await ssr.auth.getUser();
            mediaUserId = user?.id;
        } catch { /* ignore */ }
        const evolutionInstance = await resolveSendInstanceName(supabase, tenantId, mediaUserId ?? "");
        if (!evolutionInstance) {
            return { success: false, error: "Nenhum WhatsApp conectado disponível. Verifique as conexões." };
        }

        // Trava: avisa quando o numero que vai responder diverge do que ja conversava
        // com o lead (mesma logica do sendMessage; a UI confirma e re-chama com force).
        if (!force && dealId) {
            const established = (await getConversationInstances(supabase, dealId)).current;
            if (established && established !== evolutionInstance) {
                const [current, wouldUse] = await Promise.all([
                    describeInstance(supabase, tenantId, established),
                    describeInstance(supabase, tenantId, evolutionInstance),
                ]);
                return { success: false, needsConfirmation: true, current, wouldUse };
            }
        }

        // 1. Upload para Supabase Storage
        const sanitizeFilename = (name: string) => {
            return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
        };
        const fileName = `${tenantId}/${Date.now()}_${sanitizeFilename(file.name)}`; // Organizar por tenant no storage é boa prática
        // Converte o File em Buffer (com tamanho conhecido). Subir o File direto
        // numa server action Node trava o upload — era a causa do "carregando infinito".
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('crm-media')
            .upload(fileName, fileBuffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: false
            });

        if (uploadError) {
            console.error("Supabase Storage Error:", uploadError);
            throw new Error("Failed to upload file");
        }

        const { data: publicUrlData } = supabase.storage
            .from('crm-media')
            .getPublicUrl(fileName);

        const mediaUrl = publicUrlData.publicUrl;

        // 3. Enviar via Evolution API
        const cleanPhone = normalizeBrazilPhone(phone);
        const mediaType = file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : file.type.startsWith('audio/') ? 'audio'
            : 'document';

        // Audio usa o endpoint dedicado (nota de voz / PTT). Os demais usam sendMedia.
        let endpoint: string;
        let body: any;
        if (mediaType === 'audio') {
            endpoint = `${evolutionUrl}/message/sendWhatsAppAudio/${encodeURIComponent(evolutionInstance)}`;
            body = { number: cleanPhone, audio: mediaUrl };
        } else {
            endpoint = `${evolutionUrl}/message/sendMedia/${encodeURIComponent(evolutionInstance)}`;
            body = {
                number: cleanPhone,
                mediatype: mediaType,
                mimetype: file.type,
                caption: caption || "",
                media: mediaUrl,
                fileName: file.name,
            };
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": evolutionToken,
            },
            body: JSON.stringify(body),
            // Nunca deixa a request pendurar pra sempre (era o "carregando infinito").
            signal: AbortSignal.timeout(45000),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Evolution API Media Error:", errorData);
            const evoMsg = Array.isArray(errorData?.response?.message)
                ? errorData.response.message.join("; ")
                : (errorData?.response?.message || errorData?.message || `HTTP ${response.status}`);
            throw new Error(`Evolution recusou o envio: ${evoMsg}`);
        }

        const evolutionData = await response.json();

        // 4. Salvar no Banco de Dados com Tenant ID. Audio guarda "" no content
        // (o player nao mostra texto); os demais guardam a legenda ou o nome do arquivo.
        const dbContent = mediaType === 'audio' ? "" : (caption || file.name);
        const { data: insertedRow, error: insertError } = await supabase.from("messages").insert({
            deal_id: dealId,
            contact_id: contactId,
            direction: "outbound",
            type: mediaType,
            content: dbContent,
            media_url: mediaUrl,
            status: "sent",
            created_at: new Date().toISOString(),
            tenant_id: tenantId,
            instance_name: evolutionInstance,
            evolution_message_id: evolutionData?.key?.id ?? null,
        }).select("id").single();

        if (insertError) console.error("Error saving media message to DB:", insertError);

        return {
            success: true,
            data: evolutionData,
            messageId: insertedRow?.id ?? null,
            evolutionMessageId: evolutionData?.key?.id ?? null,
        };

    } catch (error: any) {
        console.error("sendMedia Error:", error);
        const friendly = error?.name === "TimeoutError" || error?.name === "AbortError"
            ? "O envio demorou demais e foi cancelado. Verifique a conexão e tente de novo."
            : error.message;
        return { success: false, error: friendly };
    }
}

export async function addNote(dealId: string, content: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("notes")
            .insert({
                deal_id: dealId,
                content: content,
                tenant_id: tenantId
            });

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("addNote Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getNotes(dealId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("notes")
            .select("id, content, created_at")
            .eq("deal_id", dealId)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getNotes Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteNote(noteId: string) {
    try {
        const tenantId = await getTenantId(); // Ensure tenant security
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("notes")
            .delete()
            .eq("id", noteId)
            .eq("tenant_id", tenantId); // Security check

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteNote Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateNote(noteId: number, content: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("notes")
            .update({ content })
            .eq("id", noteId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("updateNote Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateColdLeadNote(noteId: string, content: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

        const { error } = await supabase
            .from("cold_lead_notes")
            .update({ content })
            .eq("id", noteId);
        // .eq("tenant_id", tenantId); // cold_lead_notes might not have tenant_id or RLS handles it?
        // Checking migration... usually linked to cold_lead which has tenant?
        // Safer to just update by ID for now or check migration content.

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("updateColdLeadNote Error:", error);
        return { success: false, error: error.message };
    }
}

// =====================================================================
// TAREFAS — MEU DIA
// =====================================================================

export interface TaskInput {
    description: string;
    title?: string | null;
    dueDate: string;
    dealId?: string | null;
    coldLeadId?: string | null;
    assignedTo?: string | null;
    priority?: "low" | "normal" | "high" | "urgent";
    isRecurring?: boolean;
    recurrencePattern?: "daily" | "weekly" | "monthly" | null;
    recurrenceUntil?: string | null;
}

/** Versao avancada de createTask com todos os campos novos. */
export async function createTaskFull(input: TaskInput) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const cookieStore = await cookies();
        const ssrClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll() { /* server component */ },
                },
            }
        );
        const { data: { user } } = await ssrClient.auth.getUser();

        const payload: any = {
            tenant_id: tenantId,
            description: input.description,
            title: input.title ?? null,
            due_date: input.dueDate,
            is_completed: false,
            assigned_to: input.assignedTo ?? user?.id ?? null,
            priority: input.priority ?? "normal",
            is_recurring: !!input.isRecurring,
            recurrence_pattern: input.recurrencePattern ?? null,
            recurrence_until: input.recurrenceUntil ?? null,
        };
        if (input.dealId) payload.deal_id = input.dealId;
        if (input.coldLeadId) payload.cold_lead_id = input.coldLeadId;

        const { data, error } = await supabase
            .from("tasks")
            .insert(payload)
            .select("id")
            .single();

        if (error) return { success: false, error: error.message };

        if (user?.id) {
            try {
                await scheduleTaskNotifications(data.id, user.id, input.dueDate, tenantId);
            } catch (e) {
                console.error("scheduleTaskNotifications falhou:", e);
            }
        }

        return { success: true, data };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

/**
 * Tarefas do usuario logado agrupadas em 4 buckets:
 *   - overdue: due_date < now() e nao concluidas
 *   - today: due_date hoje e nao concluidas
 *   - upcoming: due_date entre amanha e +7d nao concluidas
 *   - completedRecent: concluidas nos ultimos 7 dias
 *
 * Pode filtrar por userId (default: usuario logado) ou 'all' para admin
 */
export async function getMyTasks(userIdOverride?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        let targetUserId = userIdOverride;
        if (!targetUserId) {
            const cookieStore = await cookies();
            const ssrClient = createServerClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                {
                    cookies: {
                        getAll() { return cookieStore.getAll() },
                        setAll() {},
                    },
                }
            );
            const { data: { user } } = await ssrClient.auth.getUser();
            targetUserId = user?.id;
        }

        if (!targetUserId) return { success: false, error: "Usuario nao identificado." };

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
        const weekAhead    = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();
        const weekAgo      = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

        // Tarefas relacionadas (com deal/cold_lead pra mostrar nome)
        const select = `
            id, title, description, due_date, is_completed, priority,
            is_recurring, recurrence_pattern, completed_at,
            deal_id, cold_lead_id, assigned_to,
            deals (id, title, contacts(name)),
            cold_leads (id, nome, telefone)
        `;

        const baseQuery = supabase
            .from("tasks")
            .select(select)
            .eq("tenant_id", tenantId)
            .eq("assigned_to", targetUserId);

        const [overdueRes, todayRes, upcomingRes, completedRes] = await Promise.all([
            baseQuery
                .eq("is_completed", false)
                .lt("due_date", startOfToday)
                .order("due_date", { ascending: true }),
            supabase
                .from("tasks").select(select)
                .eq("tenant_id", tenantId)
                .eq("assigned_to", targetUserId)
                .eq("is_completed", false)
                .gte("due_date", startOfToday)
                .lte("due_date", endOfToday)
                .order("due_date", { ascending: true }),
            supabase
                .from("tasks").select(select)
                .eq("tenant_id", tenantId)
                .eq("assigned_to", targetUserId)
                .eq("is_completed", false)
                .gt("due_date", endOfToday)
                .lte("due_date", weekAhead)
                .order("due_date", { ascending: true }),
            supabase
                .from("tasks").select(select)
                .eq("tenant_id", tenantId)
                .eq("assigned_to", targetUserId)
                .eq("is_completed", true)
                .gte("completed_at", weekAgo)
                .order("completed_at", { ascending: false })
                .limit(30),
        ]);

        return {
            success: true,
            data: {
                overdue: overdueRes.data ?? [],
                today: todayRes.data ?? [],
                upcoming: upcomingRes.data ?? [],
                completedRecent: completedRes.data ?? [],
            },
        };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

// Lista plana das tarefas do usuario num intervalo de datas (para a visao calendario).
export async function getMyTasksRange(startISO: string, endISO: string, userIdOverride?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        let targetUserId = userIdOverride;
        if (!targetUserId) {
            const cookieStore = await cookies();
            const ssrClient = createServerClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
            );
            const { data: { user } } = await ssrClient.auth.getUser();
            targetUserId = user?.id;
        }
        if (!targetUserId) return { success: false, error: "Usuario nao identificado." };

        const { data, error } = await supabase
            .from("tasks")
            .select(`
                id, title, description, due_date, is_completed, priority,
                is_recurring, recurrence_pattern, completed_at,
                deal_id, cold_lead_id, assigned_to,
                deals (id, title, contacts(name)),
                cold_leads (id, nome, telefone)
            `)
            .eq("tenant_id", tenantId)
            .eq("assigned_to", targetUserId)
            .gte("due_date", startISO)
            .lte("due_date", endISO)
            .order("due_date", { ascending: true });

        if (error) throw error;
        return { success: true, data: data ?? [] };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

export async function createTask(dealId: string | null, description: string, dueDate: string, coldLeadId?: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Resolve o usuario logado via cookie (o client service-role nao tem sessao).
        // Sem assigned_to, a tarefa NUNCA aparecia no Meu Dia (que filtra por assigned_to).
        const cookieStore = await cookies();
        const ssrClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll() { return cookieStore.getAll() }, setAll() { } } }
        );
        const { data: { user } } = await ssrClient.auth.getUser();

        const payload: any = {
            description: description,
            due_date: dueDate,
            is_completed: false,
            tenant_id: tenantId,
            assigned_to: user?.id ?? null,
        };

        if (dealId) payload.deal_id = dealId;
        if (coldLeadId) payload.cold_lead_id = coldLeadId;

        const { data: newTask, error } = await supabase
            .from("tasks")
            .insert(payload)
            .select('id')
            .single();

        if (error) throw error;

        if (user?.id && newTask) {
            await scheduleTaskNotifications(newTask.id, user.id, dueDate, tenantId);
        }

        return { success: true };
    } catch (error: any) {
        console.error("createTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateTask(taskId: string, description: string, dueDate: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .update({
                description: description,
                due_date: dueDate
            })
            .eq("id", taskId);

        if (error) throw error;

        // Reschedule Notifications
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await scheduleTaskNotifications(taskId, user.id, dueDate, tenantId);
        }

        return { success: true };
    } catch (error: any) {
        console.error("updateTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function toggleTask(taskId: string, isCompleted: boolean) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .update({ is_completed: isCompleted })
            .eq("id", taskId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("toggleTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteTask(taskId: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", taskId)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createQuickReply(formData: FormData) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const shortcut = formData.get('shortcut') as string;
        const category = formData.get('category') as string;
        const content = formData.get('content') as string;

        if (!content || !category) {
            return { success: false, error: "Conteúdo e Categoria são obrigatórios." };
        }

        const { error } = await supabase
            .from('quick_replies')
            .insert([{
                shortcut,
                category,
                content,
                tenant_id: tenantId
            }]);

        if (error) {
            console.error("Erro ao criar resposta rápida:", error);
            return { success: false, error: error.message };
        }

        revalidatePath('/settings');
        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteQuickReply(id: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function renameQuickReplyCategory(oldName: string, newName: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('quick_replies')
        .update({ category: newName })
        .eq('category', oldName);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function updateQuickReply(id: string, formData: FormData) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const shortcut = formData.get('shortcut') as string;
    const category = formData.get('category') as string;
    const content = formData.get('content') as string;

    const { error } = await supabase
        .from('quick_replies')
        .update({ shortcut, category, content })
        .eq('id', id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

// Acha a etapa terminal (is_won ou is_lost) do MESMO funil do deal, para mover o
// card pra coluna certa ao marcar Ganho/Perdido pelo menu (paridade com o drag).
async function resolveTerminalStage(admin: any, tenantId: string, dealId: string, kind: 'won' | 'lost'): Promise<number | string | null> {
    try {
        const { data: deal } = await admin.from('deals').select('stage_id').eq('id', dealId).eq('tenant_id', tenantId).maybeSingle();
        if (!deal?.stage_id) return null;
        const { data: cur } = await admin.from('stages').select('pipeline_id').eq('id', deal.stage_id).maybeSingle();
        if (!cur?.pipeline_id) return null;
        const flag = kind === 'won' ? 'is_won' : 'is_lost';
        const { data: term } = await admin.from('stages').select('id').eq('pipeline_id', cur.pipeline_id).eq(flag, true).limit(1).maybeSingle();
        return term?.id ?? null;
    } catch { return null; }
}

export async function markAsWon(dealId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const update: any = { status: 'won', closed_at: new Date().toISOString() };
        const wonStageId = await resolveTerminalStage(supabase, tenantId, dealId, 'won');
        if (wonStageId != null) update.stage_id = wonStageId; // move o card pra coluna Ganho

        const { error } = await supabase
            .from('deals')
            .update(update)
            .eq('id', dealId)
            .eq('tenant_id', tenantId);

        if (error) return { success: false, error: error.message };

        revalidatePath('/'); revalidatePath('/leads');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function markAsLost(dealId: string, reason?: string, details?: string, lossReasonId?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const updateData: any = { status: 'lost', closed_at: new Date().toISOString() };
        if (reason) updateData.lost_reason = reason;
        if (details) updateData.lost_details = details;
        if (lossReasonId) updateData.lost_reason_id = lossReasonId;

        const lostStageId = await resolveTerminalStage(supabase, tenantId, dealId, 'lost');
        if (lostStageId != null) updateData.stage_id = lostStageId; // move o card pra coluna Perdido

        const { error } = await supabase
            .from('deals')
            .update(updateData)
            .eq('id', dealId)
            .eq('tenant_id', tenantId);

        if (error) return { success: false, error: error.message };

        revalidatePath('/'); revalidatePath('/leads');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function recoverDeal(dealId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deals')
        .update({
            status: 'open',
            closed_at: null,
            lost_reason: null,
            lost_details: null
        })
        .eq('id', dealId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/');
    return { success: true };
}

export async function createTag(name: string, color: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        if (!name || !color) {
            return { success: false, error: "Nome e cor são obrigatórios." };
        }

        const { error } = await supabase
            .from('tags')
            .insert([{ name, color, tenant_id: tenantId }]);

        if (error) {
            console.error("Erro ao criar tag:", error);
            return { success: false, error: error.message };
        }

        revalidatePath('/settings');
        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteTag(tagId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function addTagToDeal(dealId: string, tagId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from('deal_tags')
            .insert([{ deal_id: dealId, tag_id: tagId, tenant_id: tenantId }]);

        if (error) {
            if (error.code === '23505') return { success: true };
            console.error("Erro ao adicionar tag ao deal:", error);
            return { success: false, error: error.message };
        }

        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function removeTagFromDeal(dealId: string, tagId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deal_tags')
        .delete()
        .match({ deal_id: dealId, tag_id: tagId });

    if (error) return { success: false, error: error.message };

    revalidatePath('/');
    return { success: true };
}

export async function getDeals() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("deals")
            .select("*, contacts(id, name, phone), deal_tags(tags(id, name, color))")
            .eq("tenant_id", tenantId)
            .order("updated_at", { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getDeals Error:", error);
        return { success: false, error: error.message };
    }
}

// Helper to log system events
export async function logSystemActivity(dealId: string, content: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // We use 'notes' for now, but in a real app this should be 'audit_logs'
        // We prepend [SYSTEM] to distinguish
        const { error } = await supabase.from("notes").insert({
            tenant_id: tenantId,
            deal_id: dealId,
            content: `[SYSTEM] ${content}`,
            // created_by: 'system' // If supported
        });

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("logSystemActivity Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getDealById(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("deals")
            .select(`
                *, 
                contacts (id, name, phone, email), 
                deal_contacts (*),
                deal_members (id, user_id, profiles(id, full_name, avatar_url)),
                tasks (id, description, due_date, is_completed),
                deal_tags (tags (id, name, color)),
                deal_items (
                    id, 
                    quantity, 
                    unit_price, 
                    product_id, 
                    products(name, price)
                )
            `)
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getDealById Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getMessages(dealId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .eq("deal_id", dealId)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getMessages Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Transcreve (sob demanda) o audio de uma mensagem de WhatsApp via OpenAI Whisper.
 * Guarda o resultado em messages.transcription e retorna o texto. Idempotente:
 * se ja houver transcricao, devolve a existente sem chamar a API.
 */
export async function transcribeMessageAudio(messageId: string) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: msg } = await admin
            .from("messages")
            .select("id, media_url, transcription")
            .eq("id", messageId)
            .eq("tenant_id", tenantId)
            .maybeSingle();

        if (!msg) return { success: false, error: "Mensagem nao encontrada." };
        if (msg.transcription) return { success: true, data: msg.transcription as string };
        if (!msg.media_url) return { success: false, error: "Esta mensagem nao tem audio." };

        const resp = await fetch(msg.media_url);
        if (!resp.ok) return { success: false, error: "Falha ao baixar o audio." };
        const buf = Buffer.from(await resp.arrayBuffer());

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const file = await OpenAI.toFile(buf, "audio.ogg");
        const tr = await openai.audio.transcriptions.create({
            file,
            model: "whisper-1",
            language: "pt",
        });
        const text = ((tr as any).text || "").trim();

        await admin
            .from("messages")
            .update({ transcription: text })
            .eq("id", messageId)
            .eq("tenant_id", tenantId);

        return { success: true, data: text };
    } catch (error: any) {
        console.error("transcribeMessageAudio Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getTeamMembers() {
    try {
        const tenantId = await getTenantId();
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: profiles, error } = await adminClient
            .from("profiles")
            .select("id, full_name, avatar_url")
            .eq("tenant_id", tenantId)
            .order("full_name");

        if (error) throw error;
        return { success: true, data: profiles };
    } catch (error: any) {
        console.error("Erro ao buscar membros da equipe:", error);
        return { success: false, error: error.message };
    }
}

export async function getConversations(search?: string, ownerId?: string, showResolved?: boolean) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const tenantId = await getTenantId();
        const nowIso = new Date().toISOString();

        let query = supabase
            .from('deals')
            .select(`
                id,
                title,
                value,
                updated_at,
                created_at,
                stage_id,
                owner_id,
                snoozed_until,
                resolved_at,
                contacts!inner (
                    id,
                    name,
                    phone,
                    photo_url,
                    email,
                    notes
                ),
                messages (
                    id,
                    content,
                    created_at,
                    type,
                    media_url,
                    direction,
                    status,
                    instance_name
                )
            `)
            .eq('tenant_id', tenantId)
            // So a ULTIMA mensagem por conversa (antes trazia o historico inteiro de
            // ate 100 deals — dezenas de milhares de linhas a cada refetch de 20s).
            .order('created_at', { ascending: false, referencedTable: 'messages' })
            .limit(1, { referencedTable: 'messages' });

        if (showResolved) {
            // Aba "Resolvidas": mostra SO as conversas marcadas como resolvidas.
            query = query.not('resolved_at', 'is', null);
        } else {
            // Padrao: oculta resolvidas e adiadas (ate a hora do snooze).
            query = query
                .is('resolved_at', null)
                .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`);
        }

        query = query
            .order('updated_at', { ascending: false })
            .limit(100);

        if (search && search.trim()) {
            const s = search.trim();
            const digits = s.replace(/\D/g, "");
            // Busca por nome OU telefone (operador costuma lembrar o numero).
            if (digits.length >= 3) {
                query = query.or(`name.ilike.%${s}%,phone.ilike.%${digits}%`, { referencedTable: 'contacts' });
            } else {
                query = query.ilike('contacts.name', `%${s}%`);
            }
        }

        if (ownerId && ownerId !== "all") {
            query = query.eq("owner_id", ownerId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Contagem real de mensagens nao lidas (inbound, read_at IS NULL) por conversa.
        // Uma unica query agregada nos deals retornados — nao traz historico.
        const dealIds = (data ?? []).map((d: any) => d.id);
        const unreadByDeal: Record<string, number> = {};
        if (dealIds.length > 0) {
            const { data: unreadRows } = await supabase
                .from('messages')
                .select('deal_id')
                .eq('tenant_id', tenantId)
                .eq('direction', 'inbound')
                .is('read_at', null)
                .in('deal_id', dealIds);
            for (const row of (unreadRows ?? [])) {
                const id = (row as any).deal_id;
                if (id) unreadByDeal[id] = (unreadByDeal[id] ?? 0) + 1;
            }
        }

        const conversations = (data ?? []).map((deal: any) => {
            const lastMsg = Array.isArray(deal.messages) ? deal.messages[0] : undefined;
            return {
                ...deal,
                last_message: lastMsg,
                unread_count: unreadByDeal[deal.id] ?? 0,
            };
        });

        return { success: true, data: conversations };

    } catch (error: any) {
        console.error("Error fetching conversations:", error);
        return { success: false, error: error.message };
    }
}

// Abre (ou cria) a conversa do CRM para um telefone e devolve o dealId.
// Usado pelo botao de WhatsApp do decisor: leva pro /chat?dealId=... mandando
// pelo numero do CRM (Evolution) e registrando o historico.
export async function startConversationForPhone(phone: string, name?: string) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const digits = String(phone || "").replace(/\D/g, "");
        if (digits.length < 10) return { success: false, error: "Telefone invalido." };

        const canonical = normalizeToCanonical(phone);
        const variants = getPossibleVariants(phone);

        // 1. Acha ou cria contato
        let contactId: string;
        const { data: existing } = await admin
            .from("contacts")
            .select("id, phone")
            .eq("tenant_id", tenantId)
            .in("phone", variants);

        if (existing && existing.length > 0) {
            contactId = (existing.find((c: any) => c.phone === canonical) ?? existing[0]).id;
        } else {
            const { data: nc, error } = await admin
                .from("contacts")
                .insert({ name: name?.trim() || canonical, phone: canonical, tenant_id: tenantId, photo_url: "" })
                .select("id")
                .single();
            if (error || !nc) return { success: false, error: "Erro ao criar contato." };
            contactId = nc.id;
        }

        // 2. Reaproveita conversa (deal aberto) existente do contato
        const { data: deal } = await admin
            .from("deals")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("contact_id", contactId)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (deal?.id) {
            // Abrir a conversa a reativa: limpa resolved/snooze pra ela voltar ao
            // inbox e ser selecionavel na lista (senao "nao abre" se estava resolvida).
            await admin.from("deals")
                .update({ resolved_at: null, snoozed_until: null })
                .eq("id", deal.id).eq("tenant_id", tenantId);
            return { success: true, dealId: deal.id, contactId };
        }

        // 3. Cria conversa nova na etapa de entrada do funil padrao
        const { data: inboxStageRpc } = await admin.rpc("get_tenant_inbox_stage", { p_tenant_id: tenantId });
        const inboxStageId = inboxStageRpc as number | string | null;
        if (inboxStageId == null) return { success: false, error: "Funil padrao sem etapa de entrada." };

        let ownerId: string | null = null;
        try {
            const ssr = await createSupabaseServerClient();
            const { data: { user } } = await ssr.auth.getUser();
            ownerId = user?.id ?? null;
        } catch { /* ignore */ }

        const { data: newDeal, error: dErr } = await admin
            .from("deals")
            .insert({
                title: name?.trim() || canonical,
                contact_id: contactId,
                stage_id: inboxStageId,
                status: "open",
                value: 0,
                tenant_id: tenantId,
                owner_id: ownerId,
            })
            .select("id")
            .single();
        if (dErr || !newDeal) return { success: false, error: "Erro ao criar conversa." };

        return { success: true, dealId: newDeal.id, contactId };
    } catch (e: any) {
        console.error("startConversationForPhone Error:", e);
        return { success: false, error: e.message };
    }
}

// Importa o historico de mensagens do WhatsApp (via Evolution) para uma conversa
// do CRM. Usado ao abrir/criar uma conversa de um lead que ja conversava no zap.
// Idempotente: dedupe por evolution_message_id. created_at vem do timestamp real
// da mensagem, entao o historico aparece na ordem cronologica correta.
export async function importWhatsappHistory(dealId: string, phone: string) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // Confirma que o deal e do tenant e pega o contato.
        const { data: dealRow } = await admin
            .from("deals").select("id, contact_id").eq("id", dealId).eq("tenant_id", tenantId).maybeSingle();
        if (!dealRow) return { success: false, error: "Conversa não encontrada." };
        const contactId = dealRow.contact_id;

        // Instancia conectada para este usuario/tenant.
        let userId: string | undefined;
        try {
            const ssr = await createSupabaseServerClient();
            const { data: { user } } = await ssr.auth.getUser();
            userId = user?.id;
        } catch { /* ignore */ }
        const instanceName = await resolveSendInstanceName(admin, tenantId, userId ?? "");
        if (!instanceName) return { success: false, error: "Nenhum WhatsApp conectado.", imported: 0 };

        const evolutionUrl = process.env.EVOLUTION_API_URL!;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN!;

        // O WhatsApp usa o numero SEM o 9o digito em muitos casos (jid de 12 chars).
        // Tentamos ambos os formatos + o cru.
        const digits = String(phone || "").replace(/\D/g, "");
        const canonical = normalizeToCanonical(phone).replace(/\D/g, "");
        const jidSet = new Set<string>();
        for (const d of [canonical, digits]) {
            if (d) jidSet.add(d);
            if (d.length === 13 && d[4] === '9') jidSet.add(d.slice(0, 4) + d.slice(5)); // remove 9o digito
        }
        const jids = [...jidSet].map(d => `${d}@s.whatsapp.net`);

        // Busca mensagens na Evolution para cada jid candidato (cap de seguranca).
        const MAX = 500;
        const records: any[] = [];
        for (const jid of jids) {
            if (records.length >= MAX) break;
            try {
                const r = await fetch(`${evolutionUrl}/chat/findMessages/${encodeURIComponent(instanceName)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "apikey": evolutionToken },
                    body: JSON.stringify({ where: { key: { remoteJid: jid } } }),
                    signal: AbortSignal.timeout(30000),
                });
                if (!r.ok) continue;
                const j = await r.json();
                const recs = j?.messages?.records ?? j?.records ?? [];
                if (Array.isArray(recs) && recs.length > 0) records.push(...recs);
            } catch (e) {
                console.error("findMessages erro:", e);
            }
        }
        if (records.length === 0) return { success: true, imported: 0 };

        // Ja existentes (dedupe por evolution_message_id) nesta conversa/tenant.
        const { data: existingRows } = await admin
            .from("messages").select("evolution_message_id").eq("tenant_id", tenantId).eq("deal_id", dealId);
        const existingIds = new Set((existingRows ?? []).map((m: any) => m.evolution_message_id).filter(Boolean));

        // Extrai conteudo/tipo de cada mensagem do historico (midia vira marcador
        // de texto — o arquivo antigo do WhatsApp normalmente ja expirou).
        const extract = (rec: any): { type: string; content: string } => {
            const m = rec?.message || {};
            if (m.conversation) return { type: "text", content: m.conversation };
            if (m.extendedTextMessage?.text) return { type: "text", content: m.extendedTextMessage.text };
            if (m.imageMessage) return { type: "text", content: m.imageMessage.caption ? `📷 ${m.imageMessage.caption}` : "📷 Imagem" };
            if (m.videoMessage) return { type: "text", content: m.videoMessage.caption ? `🎥 ${m.videoMessage.caption}` : "🎥 Vídeo" };
            if (m.audioMessage) return { type: "text", content: "🎤 Áudio" };
            if (m.documentMessage) return { type: "text", content: `📄 ${m.documentMessage.fileName || "Documento"}` };
            if (m.stickerMessage) return { type: "text", content: "🩷 Figurinha" };
            if (m.locationMessage) return { type: "text", content: "📍 Localização" };
            return { type: "text", content: "[Mensagem]" };
        };

        const rows: any[] = [];
        for (const rec of records) {
            const evoId = rec?.key?.id;
            if (!evoId || existingIds.has(evoId)) continue;
            existingIds.add(evoId); // evita duplicar entre jids
            const ts = Number(rec?.messageTimestamp || 0);
            if (!ts) continue;
            const createdAt = new Date(ts * 1000).toISOString();
            const fromMe = !!rec?.key?.fromMe;
            const { type, content } = extract(rec);
            if (!content) continue;
            rows.push({
                deal_id: dealId,
                contact_id: contactId,
                evolution_message_id: evoId,
                direction: fromMe ? "outbound" : "inbound",
                type,
                content,
                status: fromMe ? "sent" : "read",
                read_at: fromMe ? null : createdAt, // historico inbound ja foi lido
                created_at: createdAt,
                tenant_id: tenantId,
                instance_name: instanceName,
            });
        }
        if (rows.length === 0) return { success: true, imported: 0 };

        // Insere em lotes, ignorando duplicatas pelo indice unico.
        let imported = 0;
        for (let i = 0; i < rows.length; i += 100) {
            const chunk = rows.slice(i, i + 100);
            const { error } = await admin.from("messages").insert(chunk);
            if (!error) imported += chunk.length;
            else console.error("Erro ao importar lote de historico:", error.message);
        }

        return { success: true, imported };
    } catch (e: any) {
        console.error("importWhatsappHistory Error:", e);
        return { success: false, error: e.message, imported: 0 };
    }
}

// deal_items tem RLS habilitada SEM policy, entao o client do usuario e bloqueado.
// Usamos service role + verificacao de tenant (negocio pertence ao tenant).
export async function getDealItems(dealId: string) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: deal } = await admin
            .from("deals").select("id").eq("id", dealId).eq("tenant_id", tenantId).maybeSingle();
        if (!deal) return { success: false, error: "Negocio nao encontrado." };

        const { data, error } = await admin
            .from("deal_items")
            .select(`
                *,
                products ( name )
            `)
            .eq("deal_id", dealId);

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function upsertDealItems(dealId: string, items: any[]) {
    try {
        const tenantId = await getTenantId();
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Garante que o negocio pertence ao tenant antes de mexer nos itens.
        const { data: deal } = await admin
            .from("deals").select("id").eq("id", dealId).eq("tenant_id", tenantId).maybeSingle();
        if (!deal) return { success: false, error: "Negocio nao encontrado." };

        // Estrategia simples: limpa e reinsere.
        await admin.from("deal_items").delete().eq("deal_id", dealId);

        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                deal_id: dealId,
                product_id: item.product_id,
                quantity: item.quantity ?? 1,
                unit_price: Number(item.unit_price) || 0,
            }));

            const { error } = await admin.from("deal_items").insert(itemsToInsert);
            if (error) throw error;
        }

        revalidatePath("/leads");
        return { success: true };
    } catch (error: any) {
        console.error("upsertDealItems Error:", error);
        return { success: false, error: error.message };
    }
}


export async function checkDealHasMessages(dealId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { count, error } = await supabase
            .from("messages")
            .select("id", { count: 'exact', head: true })
            .eq("deal_id", dealId)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        return { success: true, hasMessages: (count || 0) > 0 };
    } catch (error: any) {
        console.error("checkDealHasMessages Error:", error);
        return { success: false, error: error.message };
    }
}


// --- HELPER: Create Contact/Company ---
export async function createContactForDeal(dealId: string, contactData: { name: string, phone: string, email: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Normaliza phone pra evitar duplicata (mesmo padrao do createLead + webhook)
        if (!isPlausibleBRPhone(contactData.phone)) {
            return { success: false, error: "Telefone invalido. Digite no formato (XX) 9XXXX-XXXX." };
        }
        const canonical = normalizeToCanonical(contactData.phone);
        const variants = getPossibleVariants(contactData.phone);

        // Reutiliza contato existente no tenant antes de criar
        const { data: existing } = await supabase
            .from("contacts")
            .select("id, phone")
            .eq("tenant_id", tenantId)
            .in("phone", variants);

        let contactRow: any;
        if (existing && existing.length > 0) {
            const match = existing.find((c: any) => c.phone === canonical) ?? existing[0];
            contactRow = match;
            // Backfill nome/email se vazio + normaliza phone pro canonico
            await supabase
                .from("contacts")
                .update({
                    phone: canonical,
                    name: contactData.name || undefined,
                    email: contactData.email || undefined,
                })
                .eq("id", match.id);
        } else {
            const { data: newContact, error: createError } = await supabase
                .from("contacts")
                .insert({
                    tenant_id: tenantId,
                    name: contactData.name,
                    phone: canonical,
                    email: contactData.email,
                })
                .select()
                .single();
            if (createError) throw createError;
            contactRow = newContact;
        }

        // 2. Link to Deal
        const { error: updateError } = await supabase
            .from("deals")
            .update({ contact_id: contactRow.id })
            .eq("id", dealId);

        if (updateError) throw updateError;

        return { success: true, data: contactRow };
    } catch (error: any) {
        console.error("createContactForDeal Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createCompanyForDeal(dealId: string, companyName: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 1. Create Company
        const { data: newCompany, error: createError } = await supabase
            .from("companies")
            .insert({
                tenant_id: tenantId,
                name: companyName
            })
            .select()
            .single();

        if (createError) throw createError;

        // 2. Link to Deal
        const { error: updateError } = await supabase
            .from("deals")
            .update({ company_id: newCompany.id })
            .eq("id", dealId);

        if (updateError) throw updateError;

        return { success: true, data: newCompany };
    } catch (error: any) {
        console.error("createCompanyForDeal Error:", error);
        return { success: false, error: error.message };
    }
}

// --- HELPER: Get Whatsapp Instances ---
export async function getWhatsappInstances() {
    try {
        const tenantId = await getTenantId();
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await adminClient
            .from("whatsapp_instances")
            .select("id, instance_name, custom_name, status, phone_number")
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getWhatsappInstances Error:", error);
        return { success: false, error: error.message };
    }
}

// =====================================================================
// UNREAD MESSAGES
// =====================================================================

/** Conta total de mensagens inbound nao lidas do tenant atual. */
export async function getUnreadCount(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { count, error } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("direction", "inbound")
            .is("read_at", null);
        if (error) return { success: false, error: error.message };
        return { success: true, count: count ?? 0 };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

/** Marca todas as mensagens inbound de um deal como lidas. */
export async function markDealMessagesRead(dealId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { error } = await supabase
            .from("messages")
            .update({ read_at: new Date().toISOString() })
            .eq("deal_id", dealId)
            .eq("tenant_id", tenantId)
            .eq("direction", "inbound")
            .is("read_at", null);
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

// =====================================================================
// CONTACT PANEL (/chat sidebar)
// =====================================================================

/** Estatisticas rapidas de um contato para o painel direito do /chat */
export async function getContactStats(contactId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Contagens via count exato (head:true nao traz linhas) e ultima inbound
        // via order+limit(1) — antes era fatiado de 200 linhas em memoria, o que
        // subestimava recebidas e errava "ultima resposta" em conversas longas.
        const [totalRes, inboundRes, outboundRes, lastInboundRes, dealsRes] = await Promise.all([
            supabase.from("messages").select("id", { count: "exact", head: true })
                .eq("contact_id", contactId).eq("tenant_id", tenantId),
            supabase.from("messages").select("id", { count: "exact", head: true })
                .eq("contact_id", contactId).eq("tenant_id", tenantId).eq("direction", "inbound"),
            supabase.from("messages").select("id", { count: "exact", head: true })
                .eq("contact_id", contactId).eq("tenant_id", tenantId).eq("direction", "outbound"),
            supabase.from("messages").select("created_at")
                .eq("contact_id", contactId).eq("tenant_id", tenantId).eq("direction", "inbound")
                .order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("deals").select("id, status, value, created_at")
                .eq("contact_id", contactId).eq("tenant_id", tenantId),
        ]);

        const inbound = inboundRes.count ?? 0;
        const outbound = outboundRes.count ?? 0;
        const lastInbound = lastInboundRes.data;

        const deals = dealsRes.data ?? [];
        const wonDeals = deals.filter((d: any) => d.status === "won");
        const totalWon = wonDeals.reduce((s: number, d: any) => s + Number(d.value || 0), 0);

        return {
            success: true,
            data: {
                total_messages: totalRes.count ?? (inbound + outbound),
                inbound,
                outbound,
                last_inbound_at: lastInbound?.created_at ?? null,
                total_deals: deals.length,
                won_deals: wonDeals.length,
                total_won_value: totalWon,
                first_contact_at: deals.length
                    ? deals.reduce((acc: string, d: any) =>
                        new Date(d.created_at) < new Date(acc) ? d.created_at : acc,
                        deals[0].created_at)
                    : null,
            },
        };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

/** Outros deals do mesmo contato (historico) — exclui o deal atual */
export async function getContactDealHistory(contactId: string, excludeDealId?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        let query = supabase
            .from("deals")
            .select(`
                id, title, value, status, created_at, stage_id, closed_at,
                stages (name, color, is_won, is_lost)
            `)
            .eq("contact_id", contactId)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(10);

        if (excludeDealId) query = query.neq("id", excludeDealId);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data: data ?? [] };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

/** Salva nota livre no contato */
export async function updateContactNotes(contactId: string, notes: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("contacts")
            .update({ notes })
            .eq("id", contactId)
            .eq("tenant_id", tenantId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

/** Snooze deal: oculta da lista de conversas ate hora X */
export async function snoozeDeal(dealId: string, snoozeUntilIso: string | null) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("deals")
            .update({ snoozed_until: snoozeUntilIso })
            .eq("id", dealId)
            .eq("tenant_id", tenantId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

/** Marca/desmarca conversa como resolvida */
export async function setDealResolved(dealId: string, resolved: boolean) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("deals")
            .update({ resolved_at: resolved ? new Date().toISOString() : null })
            .eq("id", dealId)
            .eq("tenant_id", tenantId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Erro" };
    }
}

// --- Pin/Unpin Message ---
export async function toggleMessagePin(messageId: string, pinned: boolean) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("messages")
            .update({ pinned })
            .eq("id", messageId)
            .eq("tenant_id", tenantId);

        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// --- HELPER: Promote to Lead (move deal out of inbox stage) ---
export async function promoteToLead(dealId: string, title?: string, value?: number, meetingDate?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Busca o pipeline DEFAULT do tenant + stages ordenadas.
        // Antes pegava o primeiro pipeline criado, que nao necessariamente
        // e o default. Agora usa a flag is_default.
        const { data: pipeline } = await supabase
            .from("pipelines")
            .select("id, stages(id, position, is_inbox)")
            .eq("tenant_id", tenantId)
            .eq("is_default", true)
            .maybeSingle();

        let stageId: string | null = null;
        if (pipeline?.stages && pipeline.stages.length > 0) {
            const sorted = [...pipeline.stages].sort(
                (a: any, b: any) => a.position - b.position
            );
            // Pega a primeira stage que NAO seja a inbox.
            const target = sorted.find((s: any) => !s.is_inbox);
            stageId = target?.id ?? sorted[0]?.id ?? null;
        }

        // Atualiza deal: titulo + value + stage + promoted_at
        const updates: any = {
            title: title || "Novo Lead",
            updated_at: new Date().toISOString(),
            promoted_at: new Date().toISOString(),
        };
        if (value) updates.value = value;
        if (stageId) updates.stage_id = stageId;

        const { error } = await supabase
            .from("deals")
            .update(updates)
            .eq("id", dealId)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        // (A promocao ja fica registrada em deals.promoted_at. Nao inserimos uma
        // "mensagem de sistema" porque os CHECK constraints de messages so aceitam
        // direction inbound/outbound e tipos reais — o insert antigo sempre falhava.)

        // 4. Create Meeting Task if date provided
        if (meetingDate) {
            await createTask(dealId, "Reunião de Apresentação", meetingDate);
        }

        return { success: true };
    } catch (error: any) {
        console.error("promoteToLead Error:", error);
        return { success: false, error: error.message };
    }
}

// --- HELPER: Complete Task ---
export async function completeTask(taskId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Le a task antes (precisamos dos campos de recorrencia + contexto).
        const { data: task } = await supabase
            .from("tasks")
            .select("due_date, is_recurring, recurrence_pattern, recurrence_until, assigned_to, deal_id, cold_lead_id, priority, description, title")
            .eq("id", taskId)
            .eq("tenant_id", tenantId)
            .maybeSingle();

        const { error } = await supabase
            .from("tasks")
            .update({ is_completed: true })
            .eq("id", taskId)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        // Gera a proxima ocorrencia se a task for recorrente (antes a UI dizia
        // "proxima ocorrencia criada" mas nada era gerado).
        let nextCreated = false;
        if (task?.is_recurring && task.recurrence_pattern && task.due_date) {
            const next = new Date(task.due_date);
            if (task.recurrence_pattern === "daily") next.setDate(next.getDate() + 1);
            else if (task.recurrence_pattern === "weekly") next.setDate(next.getDate() + 7);
            else if (task.recurrence_pattern === "monthly") next.setMonth(next.getMonth() + 1);

            const withinUntil = !task.recurrence_until || next <= new Date(task.recurrence_until);
            if (withinUntil) {
                const payload: any = {
                    tenant_id: tenantId,
                    description: task.description,
                    title: task.title ?? null,
                    due_date: next.toISOString(),
                    is_completed: false,
                    assigned_to: task.assigned_to ?? null,
                    priority: task.priority ?? "normal",
                    is_recurring: true,
                    recurrence_pattern: task.recurrence_pattern,
                    recurrence_until: task.recurrence_until ?? null,
                };
                if (task.deal_id) payload.deal_id = task.deal_id;
                if (task.cold_lead_id) payload.cold_lead_id = task.cold_lead_id;
                const { error: insErr } = await supabase.from("tasks").insert(payload);
                if (!insErr) nextCreated = true;
                else console.error("Erro ao gerar proxima ocorrencia:", insErr.message);
            }
        }

        return { success: true, nextCreated };
    } catch (error: any) {
        console.error("completeTask Error:", error);
        return { success: false, error: error.message };
    }
}

// --- HELPER: Check Ongoing Deals ---
export async function checkOngoingDeals(phone: string, excludeDealId?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Find contact by phone first
        const { data: contacts } = await supabase
            .from("contacts")
            .select("id")
            .eq("phone", phone)
            .eq("tenant_id", tenantId);

        if (!contacts || contacts.length === 0) return { success: true, deals: [] };

        const contactIds = contacts.map(c => c.id);

        let query = supabase
            .from("deals")
            .select("id, title, value, stage_id, created_at, stages(name)")
            .in("contact_id", contactIds)
            .eq("tenant_id", tenantId)
            // Filter out deals that are "lost" or "won" if we only care about OPEN ones? (Optional)
            // For now, list all except the current one
            .neq("id", excludeDealId);

        const { data: deals, error } = await query;

        if (error) throw error;

        // Filter those that have a stage (status not null implies it's a lead/deal)
        // because "conversations" might be deals without stage? 
        // Actually earlier my promoteToLead adds stage_id. 
        // If stage_id is null, it's just a conversation. We mainly care about real deals.
        const realDeals = deals?.filter(d => d.stage_id !== null) || [];

        return { success: true, deals: realDeals };

    } catch (error: any) {
        console.error("checkOngoingDeals Error:", error);
        return { success: false, error: error.message };
    }
}




export async function addColdLeadNote(coldLeadId: string, content: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Get current user ID (need session for created_by)
        // If we use service role we don't get auth.getUser() automatically linked to request unless we pass token
        // But here we are in a server action. 
        // Ideally we should use createServerClient to get the user.
        const cookieStore = await cookies();
        const supabaseAuth = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { } },
                },
            }
        );
        const { data: { user } } = await supabaseAuth.auth.getUser();

        const { error } = await supabase
            .from("cold_lead_notes")
            .insert({
                cold_lead_id: coldLeadId,
                content: content,
                created_by: user?.id
            });

        await supabase.from("cold_leads").update({ updated_at: new Date().toISOString() }).eq('id', coldLeadId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("addColdLeadNote Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getColdLeadNotes(coldLeadId: string) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("cold_lead_notes")
            .select(`
                id,
                content,
                created_at,
                created_by,
                profiles ( full_name )
            `)
            .eq("cold_lead_id", coldLeadId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getColdLeadNotes Error:", error);
        return { success: false, error: error.message };
    }
}

export async function importLeadsFromExcel(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        if (!file) throw new Error("Nenhum arquivo enviado");

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);

        console.log(`Importando ${rows.length} linhas...`);

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const tenantId = await getTenantId(); // Re-use helper logic if possible or just rely on profile lookup below context. 

        // Pre-fetch common data to avoid N+1 queries where possible, 
        const { data: stages } = await supabase.from('stages').select('id, name, pipeline_id').eq('tenant_id', tenantId);
        const { data: members } = await supabase.from('profiles').select('id, full_name, email').eq('tenant_id', tenantId);
        const { data: allTags } = await supabase.from('tags').select('id, name').eq('tenant_id', tenantId);
        const { data: allProducts } = await supabase.from('products').select('id, name, price').eq('tenant_id', tenantId);

        let successCount = 0;
        let errors: any[] = [];

        for (const [index, row] of rows.entries()) {
            try {
                // ROW MAPPING
                const leadName = row['Nome do lead'] || row['Nome'] || "Lead Sem Nome"; // Contact Name mainly
                const stageName = row['Etapa do funil'] || row['Etapa'];
                const ownerName = row['Responsavel'];
                const valueRaw = row['Valor da venda'] || row['Valor'];
                const tagsRaw = row['Etiquetas'];
                const phone = row['Telefone'] ? String(row['Telefone']) : "";
                const email = row['E-mail'];
                const site = row['Site'];
                const productName = row['Produto'];

                // 1. Find/Create Contact
                let contactId = null;
                if (phone || email) {
                    let query = supabase.from('contacts').select('id').eq('tenant_id', tenantId);
                    if (email) query = query.eq('email', email);
                    else if (phone) query = query.eq('phone', phone);

                    const { data: existingContact } = await query.maybeSingle();

                    if (existingContact) {
                        contactId = existingContact.id;
                    } else {
                        // Create
                        const { data: newContact, error: contactError } = await supabase.from('contacts').insert({
                            tenant_id: tenantId,
                            name: leadName,
                            phone: phone,
                            email: email,
                            user_id: await getTenantId()
                        }).select().single();
                        if (contactError) throw new Error("Erro ao criar contato: " + contactError.message);
                        contactId = newContact.id;
                    }
                }

                // 2. Find/Create Company
                let companyId = null;
                if (site) {
                    // Check if company exists by name/website
                    let compQuery = supabase.from('companies').select('id').eq('tenant_id', tenantId).or(`name.eq."${site}",website.eq."${site}"`);
                    const { data: existingComp } = await compQuery.maybeSingle();

                    if (existingComp) {
                        companyId = existingComp.id;
                    } else {
                        const { data: newCompany, error: companyError } = await supabase.from('companies').insert({
                            tenant_id: tenantId,
                            name: site,
                            website: site
                        }).select().single();
                        if (newCompany) companyId = newCompany.id;
                    }
                }

                // 3. Resolve Owner
                let ownerId = null;
                if (ownerName && members) {
                    const match = members.find((m: any) => m.full_name?.toLowerCase() === ownerName.toLowerCase() || m.email?.toLowerCase() === ownerName.toLowerCase());
                    if (match) ownerId = match.id;
                }
                if (!ownerId) ownerId = await getTenantId(); // Fallback to current user

                // 4. Resolve Stage
                let stageId = null;
                let pipelineId = null;
                if (stageName && stages) {
                    const match = stages.find((s: any) => s.name?.toLowerCase() === stageName.toLowerCase());
                    if (match) {
                        stageId = match.id;
                        pipelineId = match.pipeline_id;
                    }
                }
                // Fallback stage? First stage of first pipeline
                if (!stageId && stages && stages.length > 0) {
                    // Check if pipelineId is needed or just stage. Deals link to stage.
                    // Try to find first stage of 'Sales Pipeline' or just first one?
                    // Let's default to first one found.
                    stageId = stages[0].id;
                    pipelineId = stages[0].pipeline_id;
                }

                // 5. Resolve Value
                let dealValue = 0;
                if (valueRaw) {
                    // Handle "R$ 1.500,00" -> 1500.00
                    if (typeof valueRaw === 'number') dealValue = valueRaw;
                    else {
                        dealValue = parseFloat(String(valueRaw).replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
                    }
                }

                // 6. Create Deal
                const { data: newDeal, error: dealError } = await supabase.from('deals').insert({
                    tenant_id: tenantId,
                    title: leadName,
                    owner_id: ownerId,
                    stage_id: stageId,
                    value: dealValue,
                    status: 'open',
                    contact_id: contactId,
                    company_id: companyId,
                    created_at: new Date().toISOString()
                }).select().single();

                if (dealError) throw new Error("Erro ao criar negócio: " + dealError.message);

                // 7. Handle Tags
                if (tagsRaw) {
                    const tagNames = String(tagsRaw).split(',').map((t: string) => t.trim());
                    for (const tagName of tagNames) {
                        if (!tagName) continue;
                        let tagId = allTags?.find((t: any) => t.name.toLowerCase() === tagName.toLowerCase())?.id;
                        if (!tagId) {
                            // Create Tag
                            const { data: newTag } = await supabase.from('tags').insert({
                                tenant_id: tenantId,
                                name: tagName,
                                color: '#cccccc'
                            }).select().single();
                            if (newTag) tagId = newTag.id;
                        }

                        if (tagId) {
                            await supabase.from('deal_tags').insert({
                                deal_id: newDeal.id,
                                tag_id: tagId
                            });
                        }
                    }
                }

                // 8. Handle Product
                if (productName) {
                    let productId = allProducts?.find((p: any) => p.name.toLowerCase() === productName.toLowerCase())?.id;
                    let unitPrice = 0;

                    if (!productId) {
                        // Create Product
                        const { data: newProduct } = await supabase.from('products').insert({
                            tenant_id: tenantId,
                            name: productName,
                            price: 0
                        }).select().single();
                        if (newProduct) productId = newProduct.id;
                    } else {
                        unitPrice = allProducts?.find((p: any) => p.id === productId)?.price || 0;
                    }

                    if (productId) {
                        await supabase.from('deal_items').insert({
                            deal_id: newDeal.id,
                            product_id: productId,
                            quantity: 1,
                            unit_price: unitPrice
                        });
                    }
                }

                successCount++;

            } catch (rowError: any) {
                console.error(`Erro na linha ${index + 2}:`, rowError); // +2 because 1-based and header row
                errors.push({ row: index + 2, error: rowError.message });
            }
        }

        revalidatePath('/');
        return { success: true, count: successCount, errors };

    } catch (error: any) {
        console.error("importLeadsFromExcel Error:", error);
        return { success: false, error: error.message };
    }
}

// --- Notifications ---

export async function getNotifications() {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Not authenticated" };

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .not('sent_at', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// "Ler" = apagar: o usuario nao quer que as notificacoes acumulem no sino.
// Deleta via service role com escopo no user_id (a RLS de notifications nao tem
// policy de DELETE, entao o client do usuario seria bloqueado).
export async function markNotificationAsRead(id: string) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false };
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { error } = await admin
            .from('notifications')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function markAllNotificationsAsRead() {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false };

        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { error } = await admin
            .from('notifications')
            .delete()
            .eq('user_id', user.id);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getNotificationSettings() {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Not authenticated" };

        const { data, error } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
            return {
                success: true, data: {
                    in_app_enabled: true,
                    sound_enabled: true,
                    morning_time: '09:00:00',
                    advance_30m_enabled: true,
                    advance_5m_enabled: true
                }
            };
        }

        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateNotificationSettings(settings: any) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Not authenticated" };

        const { error } = await supabase
            .from('notification_settings')
            .upsert({ user_id: user.id, ...settings })
            .select();

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// -------------------------------------------------------------
// COLD CALL FOLLOW-UPS OPERATIONS
// -------------------------------------------------------------

export async function createColdCallFollowup(data: Omit<any, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: followup, error } = await supabase
            .from("cold_call_followups")
            .insert({
                ...data,
                tenant_id: tenantId
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[createColdCallFollowup] Created:', followup?.id);
        return { success: true, data: followup };
    } catch (error: any) {
        console.error("Erro ao criar follow-up de cold call:", error);
        return { success: false, error: error.message };
    }
}

export async function getColdCallFollowups(filters?: { status?: string, periodo?: string, date?: string, leadId?: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        let query = supabase
            .from("cold_call_followups")
            .select(`
                *,
                cold_leads (id, nome, telefone, nicho, status)
            `)
            .eq("tenant_id", tenantId);

        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.periodo) query = query.eq('periodo', filters.periodo);
        if (filters?.date) query = query.eq('data_agendada', filters.date);
        if (filters?.leadId) query = query.eq('cold_lead_id', filters.leadId);

        query = query.order("data_agendada", { ascending: true });

        const { data, error } = await query;
        if (error) throw error;
        console.log('[getColdCallFollowups] Found:', data?.length, 'followups');
        return { success: true, data };
    } catch (error: any) {
        console.error('getColdCallFollowups Error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateColdCallFollowup(id: string, updates: any) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("cold_call_followups")
            .update(updates)
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
