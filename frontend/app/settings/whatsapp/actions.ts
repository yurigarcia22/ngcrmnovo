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

export async function setupInstance(customName: string, ownerProfileId?: string) {
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

        // 5. Obter QR Code
        console.log("5. Buscando QR Code...");
        const connectRes = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
            method: "GET",
            headers: { "apikey": evolutionToken }
        });

        if (!connectRes.ok) {
            const err = await connectRes.json();
            console.error("ERRO ao buscar QR Code:", err);
            throw new Error("Falha ao gerar QR Code.");
        }

        const connectData = await connectRes.json();
        const qrCode = connectData.base64 || connectData.qrcode?.base64;

        if (!qrCode) {
            // Verifica se já conectou nesse meio tempo
            const statusCheck = await refreshInstanceStatus(instanceName);
            if (statusCheck.status === 'connected') {
                // Atualiza status no banco
                await supabaseAdmin.from("whatsapp_instances").update({ status: 'connected' }).eq('instance_name', instanceName);
                return { success: true, instanceName, status: 'connected' };
            }
            throw new Error("API não retornou o QR Code.");
        }

        revalidatePath('/settings/whatsapp');
        return {
            success: true,
            instanceName,
            qrCode,
            status: 'waiting_qr'
        };

    } catch (error: any) {
        console.error("setupInstance EXCEPTION:", error);
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
