import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/";

    console.log("Auth Callback: Starting...");
    console.log("Auth Callback: Code present?", !!code);

    // Array para capturar cookies
    const supabaseCookies: any[] = [];

    if (code) {
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch { }

                        // Capture cookies manually
                        cookiesToSet.forEach(c => supabaseCookies.push(c));
                    },
                },
            }
        );

        const { error, data } = await supabase.auth.exchangeCodeForSession(code);

        console.log("Auth Callback: Exchange result:", { hasSession: !!data.session, error });

        if (error) {
            console.error("Auth Callback Error:", error);
            return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
        }
    } else {
        console.log("Auth Callback: No code found, redirecting to", next);
    }

    // Manual Response Construction
    const response = NextResponse.redirect(`${origin}${next}`);

    // Apply captured cookies to response
    if (supabaseCookies.length > 0) {
        console.log("Auth Callback: Setting cookies on response:", supabaseCookies.map(c => c.name));
        supabaseCookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
        });
    } else {
        console.warn("Auth Callback: No cookies captured to set!");
    }

    return response;
}