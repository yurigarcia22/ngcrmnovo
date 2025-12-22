"use server";

import { createClient } from "@/utils/supabase/server";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function getProducts(search?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = await createClient();

        let query = supabase
            .from("products")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("name", { ascending: true });

        if (search) {
            query = query.ilike("name", `%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        return { success: true, data };
    } catch (error: any) {
        console.error("getProducts Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createProduct(formData: FormData) {
    try {
        const tenantId = await getTenantId();
        const supabase = await createClient();

        const name = formData.get("name") as string;
        const price = parseFloat(formData.get("price") as string);
        const description = formData.get("description") as string;

        if (!name || isNaN(price)) {
            throw new Error("Nome e Preço são obrigatórios.");
        }

        const { error } = await supabase.from("products").insert({
            tenant_id: tenantId,
            name,
            price,
            description
        });

        if (error) throw error;

        revalidatePath("/settings/products");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateProduct(id: string, formData: FormData) {
    try {
        const tenantId = await getTenantId();
        const supabase = await createClient();

        const name = formData.get("name") as string;
        const price = parseFloat(formData.get("price") as string);
        const description = formData.get("description") as string;

        if (!name || isNaN(price)) {
            throw new Error("Nome e Preço são obrigatórios.");
        }

        const { error } = await supabase
            .from("products")
            .update({ name, price, description })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/products");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteProduct(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = await createClient();

        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/products");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
