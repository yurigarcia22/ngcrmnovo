"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { generateApiKey } from "@/lib/api-auth";
import { revalidatePath } from "next/cache";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function listApiKeys() {
    try {
        const tenantId = await getTenantId();
        const { data, error } = await svc()
            .from("api_keys")
            .select("id, name, key_prefix, last_used_at, revoked_at, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
        if (error) throw error;
        return { success: true, keys: data ?? [] };
    } catch (e: any) {
        return { success: false, keys: [], error: e.message };
    }
}

// Cria a chave e retorna a chave CRUA UMA UNICA VEZ (depois so o hash fica salvo).
export async function createApiKey(name: string) {
    try {
        const tenantId = await getTenantId();
        if (!name?.trim()) throw new Error("Dê um nome para a chave (ex: n8n, integração SimplesVet).");
        const { raw, prefix, hash } = generateApiKey();
        const { error } = await svc().from("api_keys").insert({
            tenant_id: tenantId,
            name: name.trim(),
            key_prefix: prefix,
            key_hash: hash,
        });
        if (error) throw error;
        revalidatePath("/settings/api");
        return { success: true, rawKey: raw };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function revokeApiKey(id: string) {
    try {
        const tenantId = await getTenantId();
        const { error } = await svc()
            .from("api_keys")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/settings/api");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
