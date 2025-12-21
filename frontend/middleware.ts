import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    // try/catch para garantir que o site NUNCA saia do ar por erro no middleware
    try {
        return await updateSession(request)
    } catch (e) {
        console.error('Middleware ignored error:', e)
        // Retorna response padrão permitindo a navegação em caso de erro crítico
        return NextResponse.next()
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
