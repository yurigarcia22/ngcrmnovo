"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function getFields() {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from("custom_field_definitions")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("position", { ascending: true });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function saveField(field: any) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const payload = {
            ...field,
            tenant_id: tenantId
        };

        // Remove ID if empty (for insert)
        if (!payload.id) delete payload.id;

        const { data, error } = await supabase
            .from("custom_field_definitions")
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;
        revalidatePath("/settings/fields");
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteField(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from("custom_field_definitions")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        revalidatePath("/settings/fields");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
