import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    // Basic router logic: just pass through.
    // Auth logic is now handled in `app/(protected)/layout.tsx`
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
