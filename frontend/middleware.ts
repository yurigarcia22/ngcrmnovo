import { NextResponse, type NextRequest } from "next/server";

export function middleware(_: NextRequest) {
    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
