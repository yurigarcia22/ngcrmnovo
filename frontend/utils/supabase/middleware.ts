import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware do projeto (Vercel + Next App Router + Supabase)
 *
 * Ponto-chave:
 * - matcher limita onde o middleware roda (evita 404 NOT_FOUND da Vercel)
 * - rotas públicas NÃO passam por auth
 */

export async function middleware(request: NextRequest) {
    return updateSession(request);
}

export const config = {
    matcher: [
        // ✅ Protegidas (exigem sessão)
        "/dashboard/:path*",
        "/leads/:path*",
        "/settings/:path*",
        "/tasks/:path*",
        "/chat/:path*",
        "/cold-call/:path*",
        "/ngzap/:path*",

        // Se você tiver mais rotas privadas, adicione aqui:
        // "/clientes/:path*",
    ],
};

async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // ✅ Falha "amigável" se ENV não existir (evita quebrar runtime)
    if (!supabaseUrl || !supabaseAnonKey) {
        return supabaseResponse;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                // Mantém o padrão do exemplo Supabase SSR
                cookiesToSet.forEach(({ name, value, options }) =>
                    request.cookies.set(name, value)
                );

                supabaseResponse = NextResponse.next({ request });

                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options)
                );
            },
        },
    });

    // IMPORTANTE: não coloque lógica entre createServerClient e getUser
    const {
        data: { user },
    } = await supabase.auth.getUser();

    /**
     * Como o middleware só roda nas rotas do matcher (rotas privadas),
     * aqui a regra pode ser simples: sem user -> /login
     */
    if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
