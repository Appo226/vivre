/**
 * middleware.ts — Protection des routes du dashboard fournisseur
 *
 * Routes protégées : tout sauf /auth
 * Routes publiques : /auth (connexion OTP)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [/^\/auth/];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((p) => p.test(pathname))) return NextResponse.next();

  const token = request.cookies.get("vivre_supplier_token")?.value;
  if (!token) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
