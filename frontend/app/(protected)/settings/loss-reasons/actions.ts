"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId as fetchTenantId } from "@/app/actions";

export async function getLossReasons() {
    try {
        const tenantId = await fetchTenantId();
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("loss_reasons")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("position", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createLossReason(formData: FormData) {
    try {
        const tenantId = await fetchTenantId();
        const supabase = await createClient();

        const name = formData.get("name") as string;
        if (!name) throw new Error("Name is required");

        // Get max position
        const { data: maxPos } = await supabase
            .from("loss_reasons")
            .select("position")
            .eq("tenant_id", tenantId)
            .order("position", { ascending: false })
            .limit(1)
            .single();

        const position = (maxPos?.position || 0) + 1;

        const { error } = await supabase
            .from("loss_reasons")
            .insert({ name, tenant_id: tenantId, position });

        if (error) throw error;

        revalidatePath("/settings/loss-reasons");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateLossReason(id: string, name: string) {
    try {
        const tenantId = await fetchTenantId();
        const supabase = await createClient();

        const { error } = await supabase
            .from("loss_reasons")
            .update({ name })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/loss-reasons");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteLossReason(id: string) {
    try {
        const tenantId = await fetchTenantId();
        const supabase = await createClient();

        const { error } = await supabase
            .from("loss_reasons")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/loss-reasons");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
