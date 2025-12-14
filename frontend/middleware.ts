import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    try {
        return await updateSession(request)
    } catch (e) {
        console.error('Middleware execution failed:', e)
        return NextResponse.json(
            { error: 'Middleware failed', details: e instanceof Error ? e.message : String(e) },
            { status: 500 }
        )
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
