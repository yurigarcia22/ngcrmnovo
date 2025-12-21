import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/register", "/setup", "/auth/callback"];

function isPublic(pathname: string) {
    return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isFile(pathname: string) {
    // ignora qualquer rota que pareça arquivo: .png .css .js etc
    return /\.[a-zA-Z0-9]+$/.test(pathname);
}

function isIgnored(pathname: string) {
    return (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api") ||
        pathname === "/favicon.ico" ||
        pathname === "/robots.txt" ||
        pathname === "/sitemap.xml" ||
        pathname === "/manifest.json" ||
        isFile(pathname)
    );
}

function hasSessionCookie(req: NextRequest) {
    const cookies = req.cookies.getAll();
    return cookies.some((c) => {
        const n = (c.name || "").toLowerCase();
        return n.startsWith("sb-") && (n.includes("auth") || n.includes("token"));
    });
}

export function middleware(req: NextRequest) {
    try {
        const pathname = req.nextUrl.pathname;

        if (isIgnored(pathname)) return NextResponse.next();

        const loggedIn = hasSessionCookie(req);

        // Se logado e tentar ir para login/register -> dashboard
        if (loggedIn && (pathname === "/login" || pathname === "/register")) {
            const url = req.nextUrl.clone();
            url.pathname = "/dashboard";
            url.searchParams.delete("redirectTo");
            return NextResponse.redirect(url);
        }

        // Se não logado e tentar acessar rota privada -> login
        if (!loggedIn && !isPublic(pathname)) {
            const url = req.nextUrl.clone();
            url.pathname = "/login";
            url.searchParams.set("redirectTo", pathname);
            return NextResponse.redirect(url);
        }

        return NextResponse.next();
    } catch (e: any) {
        console.error("EDGE_MW_ERROR", {
            message: e?.message,
            stack: e?.stack,
            path: req.nextUrl?.pathname,
        });
        // não derruba o app por causa do middleware
        return NextResponse.next();
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
