import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    // Supabase logic TEMPORARILY DISABLED to prevent 500 Crash on Vercel Edge Runtime.
    // The previous error "MIDDLEWARE_INVOCATION_FAILED" is caused by supabase-js using Node APIs (process.version) unavailable in Edge.
    return NextResponse.next()
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
