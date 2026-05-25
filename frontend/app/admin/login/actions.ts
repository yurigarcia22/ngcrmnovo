"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInAdmin, setAdminCookie } from "@/lib/admin-auth";

export type LoginResult =
    | { ok: true }
    | { ok: false; error: string };

export async function adminLoginAction(formData: FormData): Promise<LoginResult> {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
        return { ok: false, error: "Email e senha sao obrigatorios." };
    }

    const headersList = await headers();
    const ip =
        headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headersList.get("x-real-ip") ??
        null;
    const userAgent = headersList.get("user-agent") ?? null;

    let result;
    try {
        result = await signInAdmin(email, password, {
            ip: ip ?? undefined,
            userAgent: userAgent ?? undefined,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno.";
        return { ok: false, error: msg };
    }

    if (!result) {
        // Mesma mensagem para email errado e senha errada (anti-enum)
        return { ok: false, error: "Credenciais invalidas." };
    }

    await setAdminCookie(result.token);
    redirect("/admin");
}
