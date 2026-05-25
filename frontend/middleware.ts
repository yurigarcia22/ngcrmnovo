import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './utils/supabase/middleware'
import { jwtVerify } from 'jose'

const ADMIN_COOKIE_NAME = 'admin_session'

/**
 * Verifica o JWT do admin diretamente no middleware (Edge runtime).
 * Nao usa lib/admin-auth.ts para evitar puxar Node deps (bcryptjs) no Edge.
 */
async function verifyAdminTokenEdge(token: string): Promise<boolean> {
    const secret = process.env.ADMIN_JWT_SECRET
    if (!secret || secret.length < 32) return false

    try {
        await jwtVerify(token, new TextEncoder().encode(secret), {
            algorithms: ['HS256'],
        })
        return true
    } catch {
        return false
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // =================================================================
    // Roteamento /admin/* — auth completamente separada do Supabase Auth
    // =================================================================
    if (pathname.startsWith('/admin')) {
        // Login page do admin: sempre liberada
        if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
            return NextResponse.next()
        }

        // Demais rotas /admin/* exigem cookie admin_session valido
        const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
        if (!token) {
            const loginUrl = new URL('/admin/login', request.url)
            return NextResponse.redirect(loginUrl)
        }

        const ok = await verifyAdminTokenEdge(token)
        if (!ok) {
            const loginUrl = new URL('/admin/login', request.url)
            const response = NextResponse.redirect(loginUrl)
            response.cookies.delete(ADMIN_COOKIE_NAME)
            return response
        }

        // Token valido: deixa passar (validacao de revogacao acontece no
        // server-side via getCurrentAdmin, nao no middleware).
        return NextResponse.next()
    }

    // =================================================================
    // Demais rotas: fluxo Supabase Auth normal
    // =================================================================
    try {
        return await updateSession(request)
    } catch (e) {
        console.error('Middleware ignored error:', e)
        return NextResponse.next()
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
