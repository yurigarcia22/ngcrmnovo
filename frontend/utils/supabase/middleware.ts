import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    // 1. Cria a resposta inicial
    let supabaseResponse = NextResponse.next({
        request,
    })

    // 2. Verifica variáveis de ambiente para evitar crash
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ ERRO CRÍTICO: Variáveis de ambiente do Supabase não encontradas no Middleware.");
        // Retorna a resposta sem tentar conectar no Supabase para não dar erro 500
        return supabaseResponse;
    }

    // 3. Inicializa o cliente Supabase
    const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 4. Atualiza a sessão (Auth Guard)
    // Envolvemos em try/catch para garantir que falhas de rede não quebrem o site (500)
    try {
        const {
            data: { user },
        } = await supabase.auth.getUser()

        // Lógica de Proteção de Rotas
        if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
            const loginUrl = request.nextUrl.clone()
            loginUrl.pathname = '/login'
            return NextResponse.redirect(loginUrl)
        }
    } catch (error) {
        console.error("Middleware Auth Error:", error)
        // Em caso de erro, segue o fluxo normal (permitindo acesso ou deixando o layout tratar)
    }

    return supabaseResponse
}
