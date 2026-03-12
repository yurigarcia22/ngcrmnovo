"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function getCompanyDetails() {
    try {
        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Using admin client to bypass RLS for tenants table if restricted
        const adminClient = createClient(supabaseUrl, supabaseKey);

        const { data, error } = await adminClient
            .from("tenants")
            .select("name")
            .eq("id", tenantId)
            .single();

        if (error) throw error;
        
        return { success: true, name: data.name };
    } catch (error: any) {
        console.error("getCompanyDetails Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateCompanyName(newName: string) {
    try {
        if (!newName || newName.trim().length < 2) {
            throw new Error("O nome da empresa deve ter pelo menos 2 caracteres.");
        }

        const tenantId = await getTenantId();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; 
        const adminClient = createClient(supabaseUrl, supabaseKey);

        const { error } = await adminClient
            .from("tenants")
            .update({ name: newName.trim() })
            .eq("id", tenantId);

        if (error) throw error;

        // Revalidate the dashboard and settings
        revalidatePath("/dashboard");
        revalidatePath("/settings/company");

        return { success: true };
    } catch (error: any) {
        console.error("updateCompanyName Error:", error);
        return { success: false, error: error.message };
    }
}
