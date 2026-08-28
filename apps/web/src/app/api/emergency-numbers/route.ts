/**
 * GET /api/emergency-numbers — Numéros d'urgence nationaux (public, sans connexion).
 *
 * Page /urgences appelait encore l'ancien backend Fastify (décommissionné au pivot
 * billetterie) — cette route n'existait nulle part côté Next.js, chaque visite tentait
 * 3 requêtes mortes en boucle (retries TanStack Query) avant d'abandonner. Données
 * statiques, changent rarement — cache long côté client (voir staleTime sur la page).
 */

import { NextResponse } from "next/server";
import { prisma } from "@vivre/database";

/* Sans param dynamique, Next tente de pré-rendre cette route au build — ce qui exige une
 * connexion DB PENDANT le build lui-même, un environnement où elle n'est pas garantie
 * joignable (a fait échouer un déploiement pour de vrai). force-dynamic la fait toujours
 * calculer à la requête, jamais au build. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const numbers = await prisma.emergencyNumber.findMany({
    where: { is_active: true },
    select: {
      id: true,
      service_name: true,
      service_name_en: true,
      number: true,
      icon: true,
      color_hex: true,
      sort_order: true,
    },
    orderBy: { sort_order: "asc" },
  });
  return NextResponse.json({ numbers });
}
