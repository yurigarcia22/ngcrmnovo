"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function getMembers() {
    try {
        const tenantId = await getTenantId();
        const supabase = await createServerClient();

        // Buscar convites pendentes
        const { data: invites, error: inviteError } = await supabase
            .from("team_invites")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("status", "pending");

        if (inviteError) throw inviteError;

        const pendingEmails = new Set(invites?.map((i: any) => i.email?.toLowerCase()) || []);

        // Buscar profiles do mesmo tenant
        const { data: profiles, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("tenant_id", tenantId);

        if (error) throw error;

        // Filtrar profiles que ainda são convites pendentes (evita duplicidade visual "Novo Membro")
        const activeProfiles = profiles?.filter((p: any) => !pendingEmails.has(p.email?.toLowerCase())) || [];

        return { success: true, profiles: activeProfiles, invites };
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

        return { success: true };
    } catch (error: any) {
        console.error("revokeInvite Error:", error);
        return { success: false, error: error.message };
    }
}

export async function removeMember(userId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = await createServerClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        if (!currentUser) throw new Error("Não autorizado");

        // Admin check (optional strictness, for now relies on tenant match)
        // Verify target user belongs to same tenant
        const { data: targetProfile, error: profileError } = await supabase
            .from("profiles")
            .select("tenant_id")
            .eq("id", userId)
            .single();

        if (profileError || targetProfile?.tenant_id !== tenantId) {
            throw new Error("Usuário não encontrado ou de outra organização.");
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 1. REASSIGN DATA (Crucial to avoid FK errors)
        // Transfer deals and contacts to the admin performing the deletion (currentUser)
        // or set to NULL if your schema allows. Reassigning is safer.

        console.log(`[removeMember] Reassigning data from ${userId} to ${currentUser.id}...`);

        await supabaseAdmin
            .from("deals")
            .update({ owner_id: currentUser.id })
            .eq("owner_id", userId);

        await supabaseAdmin
            .from("contacts")
            .update({ owner_id: currentUser.id })
            .eq("owner_id", userId);

        await supabaseAdmin
            .from("whatsapp_instances")
            .update({ owner_profile_id: currentUser.id })
            .eq("owner_profile_id", userId);


        // 2. DELETE PROFILE (Manual Cleanup)
        // Helps ensure public schema is clean before Auth touches it
        const { error: profileDelError } = await supabaseAdmin
            .from("profiles")
            .delete()
            .eq("id", userId);

        if (profileDelError) {
            console.error("[removeMember] Failed to delete profile (soft fail):", profileDelError);
            // We continue to try auth delete, but it might fail if profile stuck
        }

        // 3. DELETE AUTH USER
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) throw deleteError;

        revalidatePath("/settings/team");
        return { success: true };

    } catch (error: any) {
        console.error("removeMember Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateMemberRole(userId: string, newRole: 'admin' | 'vendedor') {
    try {
        const tenantId = await getTenantId();
        const supabase = await createServerClient();

        // Security: Ensure current user is allowed to change roles (omitted for now, assuming UI restriction + basic auth)
        // Ensure target user is in same tenant
        const { data: targetProfile, error: checkError } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", userId)
            .eq("tenant_id", tenantId)
            .single();

        if (checkError || !targetProfile) {
            throw new Error("Usuário alvo inválido.");
        }

        // Update role in profiles table
        const { error: updateError } = await supabase
            .from("profiles")
            .update({ role: newRole })
            .eq("id", userId);

        if (updateError) throw updateError;

        // Sync with Auth metadata (best practice for middleware checks)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: { role: newRole }
        });

        revalidatePath("/settings/team");
        return { success: true };

    } catch (error: any) {
        console.error("updateMemberRole Error:", error);
        return { success: false, error: error.message };
    }
}
