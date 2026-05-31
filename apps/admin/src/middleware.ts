/**
 * middleware.ts — Protection des routes du dashboard admin VIVRE
 * Toutes les routes sont protégées sauf /auth.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = [/^\/auth/];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();

  const token = request.cookies.get("vivre_admin_token")?.value;
  if (!token) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
