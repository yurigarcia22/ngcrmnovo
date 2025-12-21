import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname

    // 1. Ignorar rotas internas e assets
    // (Managed by config.matcher, but extra safety check here doesn't hurt, 
    // though usually handled by the return/matcher)

    // 2. Heurística de Cookie: "sb-" e "auth" ou token
    // Supabase cookies usually start with "sb-"
    const hasAuthCookie = request.cookies.getAll().some(cookie =>
        cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    )

    // Rotas públicas que queremos redirecionar se já estiver logado
    const isPublicAuthRoute = ['/login', '/register', '/setup'].some(route => path.startsWith(route))

    // Rotas protegidas (tudo exceto publicas, assets, api e auth callback)
    const isAuthCallback = path.startsWith('/auth/callback')
    const isApi = path.startsWith('/api')

    // Se logado e tentando acessar login/register -> manda pro dashboard
    if (hasAuthCookie && isPublicAuthRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    // Se NÃO logado e tentando acessar rota protegida (não publica, não api, não callback)
    // Note: simplificação - assumindo que tudo que não é public/api/callback é privado
    if (!hasAuthCookie && !isPublicAuthRoute && !isApi && !isAuthCallback) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        // Opcional: preservar o destino
        url.searchParams.set('redirectTo', path)
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - images folders (heuristic)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
