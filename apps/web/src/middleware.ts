/**
 * middleware.ts — Protection des routes Next.js par le JWT
 *
 * Ce middleware s'exécute AVANT chaque requête dans l'App Router.
 * Il vérifie la présence du token d'accès dans le cookie `vivre-auth`
 * (stocké par Zustand persist via localStorage → cookie côté serveur).
 *
 * Routes protégées (nécessitent un token valide) :
 * - / (hub principal), /profile, /evenements/publier, /evenements/mes-billets…
 *
 * Routes publiques (accessibles sans token) :
 * - /(auth)/* — connexion, vérification OTP, complétion de profil
 * - /urgences, /services — utilité publique, accessibles sans compte
 * - /evenements, /evenements/[id] — découverte publique des événements
 * - /_next/* — assets Next.js
 *
 * Note : pour la plupart des routes, le middleware ne vérifie que la PRÉSENCE du token
 * (pas sa signature) — la vérification complète est faite par l'API à chaque requête,
 * qui est la vraie frontière de sécurité (voir /api/admin/* : chacune revérifie roles
 * côté serveur indépendamment). Exception : /admin — ces pages n'ont elles-mêmes aucune
 * vérification de rôle côté client, donc n'importe quel compte connecté pouvait charger
 * la coquille HTML/JS du dashboard admin (les données, elles, restaient bien protégées
 * par l'API). Pour ce préfixe spécifiquement, le middleware vérifie la signature JWT ET
 * le rôle "admin" — jose fonctionne nativement en edge runtime (Web Crypto), donc ça ne
 * coûte rien de le faire correctement ici plutôt que de laisser fuiter la coquille admin.
 *
 * Si le token est expiré et que la requête API retourne 401,
 * le hook useAuth déclenche le refresh automatique (cf. lib/api.ts).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/jwt";

/* Routes qui ne nécessitent PAS d'authentification */
const PUBLIC_ROUTES = [
  /^\/auth/,                /* /auth, /auth/verify, /auth/profile-setup */
  /^\/terms$/,              /* Conditions d'utilisation — liées depuis l'écran de connexion */
  /^\/privacy$/,            /* Politique de confidentialité — idem */
  /^\/conditions-organisateur$/, /* Contrat organisateur — lu avant vérification/publication */
  /^\/urgences/,            /* Page urgences — critique, accessible sans compte */
  /^\/services/,            /* Services publics — accessibles sans compte */
  /*
   * Événements : la découverte et le détail sont publics.
   * mes-billets, scanner, et publier nécessitent un compte.
   */
  /^\/evenements$/,             /* Page de découverte */
  /^\/evenements\/[^/]+$/,      /* Détail d'un événement (pas les sous-pages) */
  /*
   * Paiement retour : CinetPay redirige ici après paiement.
   * Doit être public car CinetPay fait la redirection sans cookie JWT.
   * La page lit le payment_id et poll l'API (qui elle, vérifie le JWT).
   */
  /^\/paiement\/retour/,             /* Retour après paiement CinetPay */
  /^\/_next/,               /* Assets Next.js */
  /^\/api\//,               /* API routes internes */
  /^\/icons\//,             /* Icons PWA */
  /^\/manifest\.json/,      /* Manifest PWA */
  /^\/sw\.js/,              /* Service Worker */
];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  /* Vérifier si la route est publique */
  const isPublicRoute = PUBLIC_ROUTES.some((pattern) => pattern.test(pathname));
  if (isPublicRoute) {
    return NextResponse.next();
  }

  /*
   * Vérifier la présence du token dans le cookie Zustand persist.
   * Zustand persist écrit dans localStorage — pas accessible côté serveur.
   * Pour le middleware, on utilise un cookie séparé mis à jour côté client.
   *
   * Stratégie : lire le cookie `vivre_auth_token` mis à jour par le client
   * lors de la connexion. Si absent → rediriger vers /(auth).
   */
  const authToken = request.cookies.get("vivre_auth_token")?.value;

  if (!authToken) {
    /*
     * Pas de token — rediriger vers la page de connexion.
     * Passer l'URL actuelle en paramètre pour rediriger après connexion.
     */
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  /*
   * /admin — frontière plus stricte : signature JWT vérifiée ET rôle "admin" requis.
   * Un token présent mais invalide/expiré, ou valide mais sans le rôle, redirige vers
   * l'accueil (pas vers /auth — la personne EST connectée, juste pas admin ; la renvoyer
   * vers l'écran de connexion serait trompeur).
   */
  if (pathname.startsWith("/admin")) {
    try {
      const claims = await verifyAccessToken(authToken);
      if (!claims.roles.includes("admin")) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  /* Token présent — laisser passer. La vérification de signature est faite par l'API. */
  return NextResponse.next();
}

/* Matcher : appliquer le middleware à toutes les routes sauf les fichiers statiques */
export const config = {
  matcher: [
    /*
     * Matcher négatif pour exclure les fichiers statiques.
     * Le middleware s'applique à toutes les routes sauf :
     * - Les fichiers avec une extension (.png, .jpg, .ico, .svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
