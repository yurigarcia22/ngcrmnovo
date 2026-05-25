/**
 * Sistema de autenticacao do painel /admin.
 *
 * Totalmente separado do Supabase Auth (que e usado pelos clientes do CRM).
 *
 * - Sessao: JWT assinado com ADMIN_JWT_SECRET (HS256), guardado em cookie
 *   httpOnly chamado `admin_session`.
 * - Tabela: public.platform_admins (acessada via service role).
 * - Audit: cada login cria registro em public.platform_admin_sessions.
 *
 * IMPORTANTE: este modulo nao deve ser importado pelo middleware do app
 * principal — apenas pelo middleware do /admin e pelas server actions.
 *
 * O middleware do Next.js roda em Edge runtime. As funcoes que precisam
 * de bcryptjs (signIn) NAO devem ser chamadas do middleware. Use
 * `verifyAdminSession` (so usa `jose`, que e Edge-compatible) no middleware.
 */

import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

// =====================================================================
// Constantes
// =====================================================================

export const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas
const JWT_ALG = "HS256";

// =====================================================================
// Tipos
// =====================================================================

export interface AdminSessionPayload {
    sub: string;          // platform_admin.id
    email: string;
    name: string | null;
    jti: string;
    iat: number;
    exp: number;
}

export interface PlatformAdmin {
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    last_login_at: string | null;
}

// =====================================================================
// Helpers internos
// =====================================================================

function getJwtSecret(): Uint8Array {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error(
            "ADMIN_JWT_SECRET ausente ou muito curto (precisa de >=32 chars). " +
            "Defina em .env.local."
        );
    }
    return new TextEncoder().encode(secret);
}

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// =====================================================================
// API publica
// =====================================================================

/**
 * Tenta autenticar um super-admin com email/senha.
 * Retorna o admin (sem hash) em caso de sucesso, ou null se falhar.
 *
 * Nao definir o cookie aqui; quem chama (action) decide o que fazer.
 */
export async function signInAdmin(
    email: string,
    password: string,
    metadata: { ip?: string; userAgent?: string } = {}
): Promise<{ admin: PlatformAdmin; token: string } | null> {
    const bcrypt = await import("bcryptjs");
    const supabase = getServiceClient();

    const { data: admin, error } = await supabase
        .from("platform_admins")
        .select("id, email, full_name, is_active, password_hash, last_login_at")
        .eq("email", email.toLowerCase().trim())
        .eq("is_active", true)
        .maybeSingle();

    if (error || !admin) {
        // dummy hash check para evitar timing attack
        await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinv");
        return null;
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return null;

    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({
        email: admin.email,
        name: admin.full_name,
    })
        .setProtectedHeader({ alg: JWT_ALG })
        .setSubject(admin.id)
        .setJti(jti)
        .setIssuedAt(now)
        .setExpirationTime(now + SESSION_TTL_SECONDS)
        .sign(getJwtSecret());

    // Audit
    await supabase.from("platform_admin_sessions").insert({
        jti,
        admin_id: admin.id,
        ip_address: metadata.ip ?? null,
        user_agent: metadata.userAgent ?? null,
        expires_at: new Date((now + SESSION_TTL_SECONDS) * 1000).toISOString(),
    });

    // Atualiza last_login_at
    await supabase
        .from("platform_admins")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", admin.id);

    return {
        admin: {
            id: admin.id,
            email: admin.email,
            full_name: admin.full_name,
            is_active: admin.is_active,
            last_login_at: admin.last_login_at,
        },
        token,
    };
}

/**
 * Verifica o JWT do cookie e retorna o payload se valido.
 * Edge-safe (usa apenas jose).
 *
 * NAO verifica se a sessao foi revogada (isso exigiria DB lookup).
 * Para invalidar sessao antes do TTL, use `revokeSession`.
 */
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getJwtSecret(), {
            algorithms: [JWT_ALG],
        });
        return payload as unknown as AdminSessionPayload;
    } catch {
        return null;
    }
}

/**
 * Le o cookie `admin_session` do request atual (Server Component/Action)
 * e devolve o admin se autenticado e ativo.
 *
 * Faz lookup em DB para garantir que o admin nao foi desativado e que
 * o jti nao foi revogado.
 */
export async function getCurrentAdmin(): Promise<PlatformAdmin | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifyAdminToken(token);
    if (!payload) return null;

    const supabase = getServiceClient();

    const { data: session } = await supabase
        .from("platform_admin_sessions")
        .select("revoked_at, expires_at")
        .eq("jti", payload.jti)
        .maybeSingle();

    if (!session || session.revoked_at) return null;

    const { data: admin } = await supabase
        .from("platform_admins")
        .select("id, email, full_name, is_active, last_login_at")
        .eq("id", payload.sub)
        .eq("is_active", true)
        .maybeSingle();

    return admin ?? null;
}

/**
 * Encerra a sessao do admin atual: limpa o cookie e marca o jti como
 * revogado na tabela de sessoes.
 */
export async function signOutAdmin(): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

    if (token) {
        const payload = await verifyAdminToken(token);
        if (payload) {
            const supabase = getServiceClient();
            await supabase
                .from("platform_admin_sessions")
                .update({ revoked_at: new Date().toISOString() })
                .eq("jti", payload.jti);
        }
    }

    cookieStore.delete(ADMIN_COOKIE_NAME);
}

/**
 * Helper para definir o cookie apos login bem sucedido.
 * Chamado na action de login, depois de signInAdmin retornar sucesso.
 */
export async function setAdminCookie(token: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
}

/**
 * Throw se nao houver admin valido. Usar no topo de actions e pages
 * que exigem super-admin.
 */
export async function requireAdmin(): Promise<PlatformAdmin> {
    const admin = await getCurrentAdmin();
    if (!admin) {
        throw new Error("Acesso negado: super-admin necessario.");
    }
    return admin;
}
