import "server-only";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Autenticacao da API publica (/api/v1) por chave de API.
// A chave crua nunca e guardada: salvamos apenas o hash sha256.

export function apiServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

export function hashApiKey(raw: string): string {
    return crypto.createHash("sha256").update(raw.trim()).digest("hex");
}

/** Gera uma nova chave: ng_live_<32 bytes base64url>. Retorna crua + prefixo + hash. */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
    const rand = crypto.randomBytes(24).toString("base64url");
    const raw = `ng_live_${rand}`;
    return { raw, prefix: raw.slice(0, 14), hash: hashApiKey(raw) };
}

export interface ApiAuth {
    tenantId: string;
    keyId: string;
}

/** Resolve o tenant a partir do header Authorization: Bearer <chave>. Null se invalida. */
export async function authenticateApiKey(req: Request): Promise<ApiAuth | null> {
    const header = req.headers.get("authorization") || "";
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const raw = m[1].trim();
    if (!raw) return null;

    const supabase = apiServiceClient();
    const { data } = await supabase
        .from("api_keys")
        .select("id, tenant_id, revoked_at")
        .eq("key_hash", hashApiKey(raw))
        .maybeSingle();

    if (!data || data.revoked_at) return null;

    // last_used_at (fire-and-forget; nao bloqueia a request)
    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(
        () => {},
        () => {}
    );

    return { tenantId: data.tenant_id, keyId: data.id };
}

/** Resposta 401 padrao. */
export function unauthorized() {
    return NextResponse.json(
        { error: "Chave de API ausente ou inválida. Use o header Authorization: Bearer <chave>." },
        { status: 401 }
    );
}
