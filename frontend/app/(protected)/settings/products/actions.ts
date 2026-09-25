"use server";

import { createClient } from "@/utils/supabase/server";
import { getTenantId } from "@/app/actions";
import { revalidatePath } from "next/cache";

// Produto de valor personalizavel (ex.: assessoria, cada cliente paga um valor)
// nao tem preco no cadastro: o valor e digitado no negocio ao adicionar.
function readProductForm(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const custom_price = formData.get("price_type") === "custom";
    const price = custom_price ? 0 : parseFloat(formData.get("price") as string);
    const description = formData.get("description") as string;

    if (!name) throw new Error("O nome do produto é obrigatório.");
    if (!custom_price && (isNaN(price) || price < 0)) {
        throw new Error("Informe o preço ou marque o valor como personalizável.");
    }
    return { name, price, custom_price, description };
}

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

        const { name, price, custom_price, description } = readProductForm(formData);

        const { error } = await supabase.from("products").insert({
            tenant_id: tenantId,
            name,
            price,
            custom_price,
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

        const { name, price, custom_price, description } = readProductForm(formData);

        const { error } = await supabase
            .from("products")
            .update({ name, price, custom_price, description })
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
