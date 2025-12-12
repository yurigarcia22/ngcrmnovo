"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function getMembers() {
    try {
        const tenantId = await getTenantId();
        const supabase = await createServerClient();

        // Buscar profiles do mesmo tenant
        const { data: profiles, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("tenant_id", tenantId);

        if (error) throw error;

        // Buscar convites pendentes
        const { data: invites, error: inviteError } = await supabase
            .from("team_invites")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("status", "pending");

        if (inviteError) throw inviteError;

        return { success: true, profiles, invites };
    } catch (error: any) {
        console.error("getMembers Error:", error);
        return { success: false, error: error.message };
    }
}

export async function inviteMember(formData: FormData) {
    try {
        const tenantId = await getTenantId();
        const emailToInvite = formData.get('email')?.toString().toLowerCase().trim();

        if (!emailToInvite) throw new Error("Email é obrigatório");

        // Supabase Admin para convidar usuário (Service Role)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 1. Criar registro de convite na tabela team_invites PRIMEIRO
        // Isso garante que o registro existe antes do auth disparar qualquer coisa
        const { data: inviteRecord, error: inviteDbError } = await supabaseAdmin
            .from("team_invites")
            .insert({
                email: emailToInvite,
                tenant_id: tenantId,
                role: 'vendedor',
                status: 'pending'
            })
            .select()
            .single();

        if (inviteDbError) {
            // Se já existir, provavelmente é erro de chave única ou política
            console.error("Erro ao salvar convite no banco:", inviteDbError);
            if (inviteDbError.code === '23505') { // Código Postgres para violação de unique
                throw new Error('Este e-mail já possui um convite pendente.');
            }
            throw new Error('Erro ao salvar convite: ' + inviteDbError.message);
        }

        // 2. Convidar usuário no Auth
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
        if (!baseUrl) {
            console.warn("⚠️ NEXT_PUBLIC_BASE_URL não definido. Usando http://localhost:3000 como fallback.");
            baseUrl = "http://localhost:3000";
        }

        // LOG: Verificar o que estamos enviando
        console.log("INVITE Payload:", {
            email: emailToInvite,
            tenantId: tenantId,
            redirectTo: `${baseUrl}/setup`
        });

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(emailToInvite, {
            data: {
                tenant_id: tenantId,
                role: 'vendedor',
                full_name: 'Novo Membro' // Fallback para evitar erro de NOT NULL na trigger
            },
            redirectTo: `${baseUrl}/setup`
        });

        if (error) {
            // ROLLBACK MANUAL: Se falhar o envio do email, removemos o registro do banco
            console.error("Erro no Auth (inviteUserByEmail):", JSON.stringify(error, null, 2));
            await supabaseAdmin.from("team_invites").delete().eq("id", inviteRecord.id);

            if (error.message?.includes('already has been registered') || error.status === 422) {
                throw new Error('Este usuário já está cadastrado no sistema.');
            }
            throw error;
        }

        console.log("INVITE Success:", data);

        revalidatePath("/settings/team");
        return { success: true };

    } catch (error: any) {
        console.error("inviteMember Critical Error:", error);

        // Tratamento amigável
        if (error?.message?.includes('Database error saving new user')) {
            return { success: false, error: "Erro interno do banco de dados (Trigger falhou). Verifique: 1) Se executou o SQL v2. 2) Se o tenant_id existe." };
        }

        return { success: false, error: error.message };
    }
}

export async function revokeInvite(inviteId: string) {
    try {
        const tenantId = await getTenantId();
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabaseAdmin
            .from("team_invites")
            .delete()
            .eq("id", inviteId)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/team");
        return { success: true };
    } catch (error: any) {
        console.error("revokeInvite Error:", error);
        return { success: false, error: error.message };
    }
}
