"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { setTenantModule, type ModuleKey, MODULE_KEYS } from "@/lib/modules";

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

export async function toggleModuleAction(
    tenantId: string,
    moduleKey: string,
    enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const admin = await requireAdmin();
        if (!MODULE_KEYS.includes(moduleKey as ModuleKey)) {
            return { ok: false, error: "Modulo invalido." };
        }
        await setTenantModule(tenantId, moduleKey as ModuleKey, enabled, admin.id);
        revalidatePath(`/admin/tenants/${tenantId}`);
        revalidatePath("/admin/tenants");
        return { ok: true };
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : "Erro." };
    }
}

export async function toggleTenantActiveAction(
    tenantId: string,
    isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        await requireAdmin();
        const supabase = getServiceClient();
        const { error } = await supabase
            .from("tenants")
            .update({ is_active: isActive })
            .eq("id", tenantId);
        if (error) return { ok: false, error: error.message };
        revalidatePath(`/admin/tenants/${tenantId}`);
        revalidatePath("/admin/tenants");
        return { ok: true };
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : "Erro." };
    }
}

export async function updateTenantMetaAction(
    tenantId: string,
    formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        await requireAdmin();
        const name = String(formData.get("name") ?? "").trim();
        const plan = String(formData.get("plan") ?? "").trim();
        const billingEmail =
            String(formData.get("billing_email") ?? "").trim() || null;
        const notes = String(formData.get("notes") ?? "").trim() || null;

        if (!name) return { ok: false, error: "Nome obrigatorio." };
        if (!["custom", "starter", "pro", "enterprise"].includes(plan)) {
            return { ok: false, error: "Plano invalido." };
        }

        const supabase = getServiceClient();
        const { error } = await supabase
            .from("tenants")
            .update({ name, plan, billing_email: billingEmail, notes })
            .eq("id", tenantId);

        if (error) return { ok: false, error: error.message };
        revalidatePath(`/admin/tenants/${tenantId}`);
        revalidatePath("/admin/tenants");
        return { ok: true };
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : "Erro." };
    }
}
