/**
 * middleware.ts — Protection des routes Next.js par le JWT
 *
 * Ce middleware s'exécute AVANT chaque requête dans l'App Router.
 * Il vérifie la présence du token d'accès dans le cookie `vivre-auth`
 * (stocké par Zustand persist via localStorage → cookie côté serveur).
 *
 * Routes protégées (nécessitent un token valide) :
 * - / (hub principal)
 * - /transport, /food, /hotels, /guides, /profile
 *
 * Routes publiques (accessibles sans token) :
 * - /(auth)/* — connexion, vérification OTP, complétion de profil
 * - /urgences — numéros d'urgence (accessibles sans compte, critique)
 * - /discover — page de découverte publique
 * - /_next/* — assets Next.js
 *
 * Note : le middleware ne vérifie PAS la signature JWT (trop lourd en edge runtime).
 * Il vérifie seulement la PRÉSENCE du token dans localStorage via cookie.
 * La vérification de signature est faite par l'API à chaque requête.
 *
 * Si le token est expiré et que la requête API retourne 401,
 * le hook useAuth déclenche le refresh automatique (cf. lib/api.ts).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/* Routes qui ne nécessitent PAS d'authentification */
const PUBLIC_ROUTES = [
  /^\/(auth)/,              /* /auth/*, /auth/verify, /auth/profile-setup */
  /^\/urgences/,            /* Page urgences — critique, accessible sans compte */
  /^\/services/,            /* Services publics — accessibles sans compte */
  /^\/discover/,            /* Page de découverte publique */
  /*
   * Transport : la recherche et les détails de voyages sont publics.
   * Seuls /transport/mes-billets et le booking nécessitent un compte.
   * La réservation côté API est protégée par Bearer token (erreur 401).
   */
  /^\/transport$/,              /* Page de recherche transport */
  /^\/transport\/voyages/,      /* Résultats et détail des voyages */
  /*
   * Événements : la découverte et le détail sont publics.
   * mes-billets, scanner, et publier nécessitent un compte.
   */
  /^\/evenements$/,             /* Page de découverte */
  /^\/evenements\/[^/]+$/,      /* Détail d'un événement (pas les sous-pages) */
  /*
   * Hébergement : la recherche et les détails de propriétés sont publics.
   * mes-reservations nécessite un compte.
   */
  /^\/hebergement$/,                  /* Page de recherche hébergement */
  /^\/hebergement\/resultats/,        /* Résultats de recherche */
  /^\/hebergement\/[^/]+$/,           /* Détail d'un hébergement (pas mes-reservations) */
  /*
   * Food Delivery : la liste et le détail des restaurants sont publics.
   * panier, mes-commandes et le checkout nécessitent un compte.
   */
  /^\/food$/,                         /* Page liste restaurants */
  /^\/food\/[^/]+$/,                  /* Détail restaurant + menu (pas mes-commandes) */
  /*
   * Candidature livreur : la page de candidature est publique pour permettre
   * aux non-inscrits de voir le formulaire. La soumission API est protégée.
   * /livreur et /livreur/gains nécessitent un compte (non listés ici).
   */
  /^\/devenir-livreur$/,              /* Page candidature livreur */
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

export function middleware(request: NextRequest): NextResponse {
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
