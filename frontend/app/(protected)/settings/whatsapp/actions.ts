"use server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

// Helper para pegar o Tenant ID
async function getTenantId() {
    const cookieStore = await cookies();

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado.");

    // Usando adminClient para pegar tenant_id de forma segura
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile } = await adminClient
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

    if (!profile?.tenant_id) throw new Error("Tenant não encontrado.");
    return profile.tenant_id;
}

export async function getInstances() {
    try {
        const tenantId = await getTenantId();
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: instances, error } = await adminClient
            .from("whatsapp_instances")
            .select(`
                *,
                owner:profiles(full_name, avatar_url)
            `)
            .eq("tenant_id", tenantId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return instances || [];
    } catch (error) {
        console.error("Erro ao buscar instâncias:", error);
        return [];
    }
}

/**
 * Lista os funis de venda (kind='deals') do tenant para o seletor de
 * roteamento por numero. O funil padrao vem primeiro.
 */
export async function getSalesPipelines() {
    try {
        const tenantId = await getTenantId();
        const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data, error } = await adminClient
            .from("pipelines")
            .select("id, name, is_default")
            .eq("tenant_id", tenantId)
            .eq("kind", "deals")
            .order("is_default", { ascending: false })
            .order("id", { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Erro ao buscar funis:", error);
        return [];
    }
}

/**
 * Define qual funil recebe os leads de uma instancia (numero) ja existente.
 */
export async function setInstancePipeline(
    instanceName: string,
    pipelineId: number | null
): Promise<{ success: boolean; error?: string }> {
    try {
        const tenantId = await getTenantId();
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { error } = await supabaseAdmin
            .from("whatsapp_instances")
            .update({ pipeline_id: pipelineId })
            .eq("instance_name", instanceName)
            .eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/settings/whatsapp");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function setupInstance(
    customName: string,
    ownerProfileId?: string,
    method: "qr" | "code" = "qr",
    phoneNumber?: string,
    pipelineId?: number | null
) {
    try {
        console.log("--- INICIANDO CONFIGURAÇÃO DA INSTÂNCIA ---");
        const tenantId = await getTenantId();
        const evolutionUrl = process.env.EVOLUTION_API_URL;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN;

        if (!evolutionUrl || !evolutionToken) {
            throw new Error("Configuração da Evolution API ausente (URL ou Token).");
        }

        // 1. Definição do Nome da Instância Único
        const uniqueId = crypto.randomUUID().split('-')[0]; // Encurtando para legibilidade, mas mantendo unicidade local
        const instanceName = `crm_${tenantId.replace(/-/g, "")}_${uniqueId}`;
        const instanceToken = crypto.randomUUID();
        console.log(`1. Nome da Instância Gerado: ${instanceName}`);

        // 2. Criar Instância na Evolution
        console.log("2. Criando Instância na Evolution...");
        const createRes = await fetch(`${evolutionUrl}/instance/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": evolutionToken
            },
            body: JSON.stringify({
                instanceName: instanceName,
                token: instanceToken,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            })
        });

        if (!createRes.ok) {
            const err = await createRes.json();
            const errString = JSON.stringify(err);
            // Se já existe, é um erro real aqui pois geramos um ID único.
            // Mas por segurança, se colidir, tratamos.
            if (!errString.includes("already exists")) {
                console.error("ERRO FATAL ao criar instância:", errString);
                throw new Error(`Falha ao criar instância: ${err.message || errString}`);
            }
            console.log("-> Instância já existe (colisão rara). Reutilizando.");
        } else {
            console.log("-> Instância criada com sucesso.");
        }

        // 3. PERSISTÊNCIA NA TABELA whatsapp_instances
        console.log("3. Salvando na tabela whatsapp_instances...");
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: dbError } = await supabaseAdmin
            .from("whatsapp_instances")
            .insert({
                tenant_id: tenantId,
                instance_name: instanceName,
                custom_name: customName,
                owner_profile_id: ownerProfileId || null,
                pipeline_id: pipelineId ?? null,
                status: 'waiting_qr'
            });

        if (dbError) {
            console.error("ERRO FATAL ao salvar no banco:", dbError);
            // Tenta limpar na evolution se falhou no banco
            fetch(`${evolutionUrl}/instance/delete/${instanceName}`, {
                method: "DELETE", headers: { "apikey": evolutionToken }
            }).catch(() => { });
            throw new Error("Falha ao salvar instância no banco de dados.");
        }
        console.log("-> Registro salvo no banco.");

        // 4. Configurar Webhook
        console.log("4. Configurando Webhook...");
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const webhookUrl = `${supabaseUrl}/functions/v1/webhook-evolution`;

        // Pequeno delay para garantir propagação na Evolution
        await new Promise(r => setTimeout(r, 1000));

        const webhookRes = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": evolutionToken
            },
            body: JSON.stringify({
                webhook: {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: true,
                    events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
                }
            })
        });

        if (!webhookRes.ok) {
            console.warn("Soft Fail ao configurar webhook.");
        } else {
            console.log("-> Webhook configurado.");
        }

        // 5. Conectar (QR Code por padrao, ou codigo de pareamento)
        console.log(`5. Conectando via ${method}...`);
        const conn = await connectInstance(instanceName, { method, phoneNumber });

        if (!conn.success) {
            throw new Error(conn.error || "Falha ao gerar a conexão.");
        }

        if (conn.status === 'connected') {
            await supabaseAdmin
                .from("whatsapp_instances")
                .update({ status: 'connected' })
                .eq('instance_name', instanceName);
            return { success: true, instanceName, status: 'connected' };
        }

        revalidatePath('/settings/whatsapp');
        return {
            success: true,
            instanceName,
            qrCode: conn.qrCode,
            pairingCode: conn.pairingCode,
            status: conn.status ?? 'waiting_qr'
        };

    } catch (error: any) {
        console.error("setupInstance EXCEPTION:", error);
        return { success: false, error: error.message || "Erro desconhecido." };
    }
}

/**
 * Reaplica o webhook de uma instancia (usado apos recriar para o codigo de
 * pareamento). Respeita o `purpose` salvo no banco.
 */
async function applyWebhookForInstance(instanceName: string) {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionToken = process.env.EVOLUTION_API_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!evolutionUrl || !evolutionToken || !supabaseUrl) return;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("purpose")
        .eq("instance_name", instanceName)
        .single();

    const purpose = inst?.purpose ?? "crm";
    const webhookUrl = (purpose === "crm")
        ? `${supabaseUrl}/functions/v1/webhook-evolution`
        : (process.env.N8N_WEBINAR_WEBHOOK_URL ?? `${supabaseUrl}/functions/v1/webhook-evolution`);

    await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionToken },
        body: JSON.stringify({
            webhook: {
                enabled: true,
                url: webhookUrl,
                webhookByEvents: true,
                events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"],
            },
        }),
    }).catch(() => {});
}

/**
 * Conecta (ou reconecta) uma instancia ja existente na Evolution.
 *   method 'qr'   -> retorna { qrCode } (base64) para escanear
 *   method 'code' -> retorna { pairingCode } (8 digitos) para digitar no celular
 *
 * IMPORTANTE: nesta versao da Evolution (v2 / Baileys) o codigo de pareamento
 * SO e gerado quando o `number` e passado na CRIACAO da instancia — o connect
 * com ?number= e ignorado. Por isso, para o metodo 'code' recriamos a instancia
 * (mesmo nome) com o numero e reaplicamos o webhook. Como o pairing code so faz
 * sentido quando a instancia ainda nao esta conectada, isso e seguro.
 */
export async function connectInstance(
    instanceName: string,
    opts?: { method?: "qr" | "code"; phoneNumber?: string }
): Promise<{
    success: boolean;
    qrCode?: string;
    pairingCode?: string;
    status?: string;
    error?: string;
}> {
    try {
        const tenantId = await getTenantId(); // valida sessao
        const evolutionUrl = process.env.EVOLUTION_API_URL;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN;
        if (!evolutionUrl || !evolutionToken) {
            throw new Error("Configuração da Evolution API ausente (URL ou Token).");
        }

        // Garante que a instancia pertence ao tenant logado (recriar e destrutivo).
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: inst } = await admin
            .from("whatsapp_instances")
            .select("instance_name")
            .eq("instance_name", instanceName)
            .eq("tenant_id", tenantId)
            .single();
        if (!inst) throw new Error("Conexão não encontrada para este usuário.");

        const method = opts?.method ?? "qr";

        // Se ja estiver conectada, nao mexe.
        const stateRes = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
            method: "GET",
            headers: { apikey: evolutionToken },
        });
        if (stateRes.ok) {
            const sd = await stateRes.json().catch(() => ({}));
            if (sd?.instance?.state === "open") {
                await admin.from("whatsapp_instances").update({ status: "connected" }).eq("instance_name", instanceName);
                return { success: true, status: "connected" };
            }
        }

        // ===== METODO CODIGO: recria a instancia com o numero =====
        if (method === "code") {
            const digits = (opts?.phoneNumber ?? "").replace(/\D/g, "");
            if (digits.length < 12 || digits.length > 13) {
                throw new Error("Informe o número completo com DDI e DDD. Ex: 5531999999999");
            }

            // Remove a instancia atual (sem numero) na Evolution.
            await fetch(`${evolutionUrl}/instance/logout/${instanceName}`, {
                method: "DELETE", headers: { apikey: evolutionToken },
            }).catch(() => {});
            await fetch(`${evolutionUrl}/instance/delete/${instanceName}`, {
                method: "DELETE", headers: { apikey: evolutionToken },
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 1500));

            // Recria com o numero -> Evolution ja devolve o pairingCode.
            const createRes = await fetch(`${evolutionUrl}/instance/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evolutionToken },
                body: JSON.stringify({
                    instanceName,
                    qrcode: true,
                    integration: "WHATSAPP-BAILEYS",
                    number: digits,
                }),
            });
            if (!createRes.ok) {
                const e = await createRes.json().catch(() => ({}));
                throw new Error(e?.message || "Falha ao preparar a instância para o código.");
            }
            const cdata = await createRes.json();
            let pairingCode = cdata?.qrcode?.pairingCode || cdata?.pairingCode || null;

            // Reaplica o webhook (foi perdido ao recriar).
            await applyWebhookForInstance(instanceName);

            // Se nao veio no create, tenta uma vez via connect.
            if (!pairingCode) {
                await new Promise((r) => setTimeout(r, 1500));
                const cr = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
                    method: "GET", headers: { apikey: evolutionToken },
                });
                if (cr.ok) {
                    const j = await cr.json().catch(() => ({}));
                    pairingCode = j?.pairingCode || j?.qrcode?.pairingCode || null;
                }
            }

            if (!pairingCode) {
                throw new Error("A API não retornou o código. Tente novamente em alguns segundos.");
            }

            await admin.from("whatsapp_instances").update({ status: "waiting_qr" }).eq("instance_name", instanceName);
            return { success: true, pairingCode, status: "waiting_code" };
        }

        // ===== METODO QR: connect simples =====
        const res = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
            method: "GET",
            headers: { apikey: evolutionToken },
        });

        if (!res.ok) {
            const st = await refreshInstanceStatus(instanceName);
            if (st.status === "connected") return { success: true, status: "connected" };
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.message || "Falha ao gerar o QR Code.");
        }

        const data = await res.json();
        const qrCode = data.base64 || data.qrcode?.base64 || null;

        if (!qrCode) {
            const st = await refreshInstanceStatus(instanceName);
            if (st.status === "connected") return { success: true, status: "connected" };
            throw new Error("A API não retornou o QR Code.");
        }

        return { success: true, qrCode, status: "waiting_qr" };
    } catch (error: any) {
        console.error("connectInstance EXCEPTION:", error);
        return { success: false, error: error.message || "Erro desconhecido." };
    }
}

export async function deleteInstance(instanceName: string) {
    try {
        console.log(`--- DELETANDO INSTÂNCIA: ${instanceName} ---`);
        const tenantId = await getTenantId();
        const evolutionUrl = process.env.EVOLUTION_API_URL;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN;

        // 1. Logout/Delete Evolution
        try {
            await fetch(`${evolutionUrl}/instance/logout/${instanceName}`, {
                method: "DELETE", headers: { "apikey": evolutionToken! }
            });
            await fetch(`${evolutionUrl}/instance/delete/${instanceName}`, {
                method: "DELETE", headers: { "apikey": evolutionToken! }
            });
        } catch (e) {
            console.warn("Erro ao limpar Evolution (pode não existir):", e);
        }

        // 2. Delete DB
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        await supabaseAdmin
            .from("whatsapp_instances")
            .delete()
            .eq("instance_name", instanceName)
            .eq("tenant_id", tenantId);

        revalidatePath('/settings/whatsapp');
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Define para que serve uma instancia WhatsApp:
 *   'crm'     - usada apenas para receber/enviar pelas telas /chat e /leads
 *   'webinar' - usada apenas para campanhas do modulo webinar
 *   'both'    - ambos os usos (cuidado: pode dar conflito de webhook)
 */
export async function setInstancePurpose(
    instanceName: string,
    purpose: "crm" | "webinar" | "both"
): Promise<{ success: boolean; error?: string }> {
    try {
        const tenantId = await getTenantId();
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabaseAdmin
            .from("whatsapp_instances")
            .update({ purpose })
            .eq("instance_name", instanceName)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        // Reaplica o webhook conforme o novo purpose
        const evolutionUrl = process.env.EVOLUTION_API_URL;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (evolutionUrl && evolutionToken && supabaseUrl) {
            // CRM: aponta para Edge Function direto.
            // Webinar/both: aponta para endpoint do webinar (cron mantem).
            const webhookUrl = (purpose === "crm")
                ? `${supabaseUrl}/functions/v1/webhook-evolution`
                : (process.env.N8N_WEBINAR_WEBHOOK_URL ?? `${supabaseUrl}/functions/v1/webhook-evolution`);

            await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evolutionToken },
                body: JSON.stringify({
                    webhook: {
                        enabled: true,
                        url: webhookUrl,
                        webhookByEvents: false,
                        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"],
                    },
                }),
            }).catch(() => {});
        }

        revalidatePath('/settings/whatsapp');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function refreshInstanceStatus(instanceName: string) {
    try {
        const evolutionUrl = process.env.EVOLUTION_API_URL;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN;

        // 1. Consultar Evolution (State)
        const response = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
            method: "GET",
            headers: { "apikey": evolutionToken! }
        });

        let status = 'disconnected';

        if (response.ok) {
            const data = await response.json();
            const state = data.instance?.state || 'close';

            // Mapeamento Evolution -> App
            if (state === 'open') status = 'connected';
            else if (state === 'connecting') status = 'connecting';
            else status = 'disconnected';
        }

        // 1.1 Buscar dados extras (Número e Foto) se connected
        let phoneNumber = null;
        let profilePicUrl = null;

        if (status === 'connected') {
            try {
                // Tenta buscar detalhes
                const detailsRes = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
                    method: 'GET',
                    headers: { "apikey": evolutionToken! }
                });

                if (detailsRes.ok) {
                    const allInstances = await detailsRes.json();
                    // Encontrar a nossa no array
                    const myInstance = allInstances.find((i: any) => i.instance?.instanceName === instanceName || i.instance?.name === instanceName);

                    if (myInstance?.instance) {
                        const jid = myInstance.instance.ownerJid || "";
                        phoneNumber = jid.split('@')[0];
                        profilePicUrl = myInstance.instance.profilePicUrl || null;
                    }
                }
            } catch (e) {
                console.warn("Erro ao buscar detalhes extras da instância:", e);
            }
        }

        // 2. Atualizar Banco de Dados
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const updateData: any = { status: status };
        if (phoneNumber) updateData.phone_number = phoneNumber;
        if (profilePicUrl !== undefined) updateData.profile_pic_url = profilePicUrl;

        await supabaseAdmin
            .from("whatsapp_instances")
            .update(updateData)
            .eq("instance_name", instanceName);

        revalidatePath('/settings/whatsapp');
        return { success: true, status, phoneNumber, profilePicUrl };

    } catch (error) {
        console.error(`Erro ao atualizar status da instância ${instanceName}:`, error);
        return { success: false, status: 'disconnected' };
    }
}

export async function getSafeProfiles() {
    // Helper para buscar TODOS os membros da equipe para o Select
    // Usamos adminClient para garantir bypass de RLS
    const tenantId = await getTenantId();

    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await adminClient
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("tenant_id", tenantId)
        .order('full_name', { ascending: true });

    if (!data) return [];

    return data.map(profile => ({
        id: profile.id,
        full_name: profile.full_name || 'Sem Nome',
        avatar_url: profile.avatar_url,
    }));
}
