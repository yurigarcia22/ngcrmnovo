"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { MODULE_KEYS, MODULE_REGISTRY, type ModuleKey } from "@/lib/modules";

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

function slugify(name: string, idSuffix: string): string {
    const base = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 30);
    return `${base || "tenant"}-${idSuffix}`;
}

export type CreateTenantResult =
    | { ok: true; tenantId: string; inviteUrl?: string }
    | { ok: false; error: string };

export async function createTenantAction(formData: FormData): Promise<CreateTenantResult> {
    let admin;
    try {
        admin = await requireAdmin();
    } catch {
        return { ok: false, error: "Acesso negado." };
    }

    const name = String(formData.get("name") ?? "").trim();
    const plan = String(formData.get("plan") ?? "custom").trim();
    const billingEmail = String(formData.get("billing_email") ?? "").trim() || null;
    const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
    const adminName = String(formData.get("admin_name") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;

    // Modulos selecionados — campos checkbox marcados
    const selectedModules = MODULE_KEYS.filter(
        (k) => formData.get(`mod_${k}`) === "on"
    );

    if (!name) return { ok: false, error: "Nome da empresa obrigatorio." };
    if (!adminEmail) return { ok: false, error: "Email do admin obrigatorio." };
    if (!["custom", "starter", "pro", "enterprise"].includes(plan)) {
        return { ok: false, error: "Plano invalido." };
    }

    const supabase = getServiceClient();

    // 1) Cria o tenant
    const { data: tenantInsert, error: tenantErr } = await supabase
        .from("tenants")
        .insert({
            name,
            plan,
            billing_email: billingEmail,
            notes,
            is_active: true,
            slug: "placeholder",
            created_by: admin.id,
        })
        .select("id")
        .single();

    if (tenantErr || !tenantInsert) {
        return { ok: false, error: tenantErr?.message ?? "Falha ao criar tenant." };
    }

    const tenantId = tenantInsert.id;

    // Atualiza slug com base no nome + sufixo do id
    const finalSlug = slugify(name, tenantId.substring(0, 8));
    await supabase
        .from("tenants")
        .update({ slug: finalSlug })
        .eq("id", tenantId);

    // 2) Seed dos modulos conforme selecao
    const modulesPayload = MODULE_KEYS.map((k) => ({
        tenant_id: tenantId,
        module_key: k,
        enabled: selectedModules.includes(k as ModuleKey),
        updated_by: admin.id,
    }));
    await supabase.from("tenant_modules").upsert(modulesPayload, {
        onConflict: "tenant_id,module_key",
    });

    // 3) Convite do admin do tenant (cria usuario via Supabase Admin API)
    let inviteUrl: string | undefined;
    if (adminEmail) {
        const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
            adminEmail,
            {
                data: {
                    tenant_id: tenantId,
                    role: "admin",
                    full_name: adminName || null,
                    company_name: name,
                },
            }
        );

        if (inviteErr) {
            return {
                ok: false,
                error: `Tenant criado, mas falhou ao convidar admin: ${inviteErr.message}. Voce pode tentar convidar manualmente em /admin/tenants/${tenantId}.`,
            };
        }

        // Tenta extrair o link gerado (Supabase devolve action_link em alguns SDKs)
        // Se nao disponivel, o email do Supabase ja foi enviado.
        const u = invited?.user as unknown as { action_link?: string };
        inviteUrl = u?.action_link;
    }

    revalidatePath("/admin/tenants");

    return { ok: true, tenantId, inviteUrl };
}
