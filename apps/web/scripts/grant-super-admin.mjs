/**
 * scripts/grant-super-admin.mjs — SEUL moyen d'accorder le rôle "super_admin".
 *
 * Volontairement hors de l'app : aucune route API, aucun bouton, ne peut jamais créer
 * un super_admin — même un compte admin entièrement compromis ne peut pas se
 * l'accorder à lui-même ni à un complice. Ce script se lance à la main, en local,
 * avec un accès direct à la base, et exige le code secret SUPER_ADMIN_SETUP_CODE
 * (voir .env.local — jamais dans les env vars Vercel) passé explicitement en
 * argument, pas seulement présent dans l'environnement — un geste délibéré, pas un
 * script qui "marche tout seul" pour quiconque a un accès DB.
 *
 * Usage :
 *   node scripts/grant-super-admin.mjs <téléphone> <code>
 *
 * Accorde À LA FOIS "super_admin" ET "admin" — pour que tout code existant qui
 * vérifie roles.includes("admin") continue de fonctionner sans modification pour
 * le super_admin.
 */

import { PrismaClient } from "@prisma/client";

const [, , phone, code] = process.argv;

if (!phone || !code) {
  console.error("Usage: node scripts/grant-super-admin.mjs <téléphone> <code>");
  process.exit(1);
}

const expectedCode = process.env.SUPER_ADMIN_SETUP_CODE;
if (!expectedCode) {
  console.error("SUPER_ADMIN_SETUP_CODE n'est pas défini dans l'environnement — voir .env.local");
  process.exit(1);
}
if (code !== expectedCode) {
  console.error("Code incorrect — abandon.");
  process.exit(1);
}

const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { phone },
  select: { id: true, phone: true, first_name: true, last_name: true },
});

if (!user) {
  console.error(`Aucun compte avec le numéro ${phone} — la personne doit d'abord se connecter une fois sur VIVRE.`);
  await prisma.$disconnect();
  process.exit(1);
}

for (const role of ["super_admin", "admin"]) {
  const existing = await prisma.userRole.findUnique({
    where: { user_id_role: { user_id: user.id, role } },
  });
  if (existing) {
    console.log(`${user.phone} a déjà le rôle "${role}" — rien à faire.`);
    continue;
  }
  await prisma.userRole.create({
    data: { user_id: user.id, role, is_approved: true, approved_at: new Date() },
  });
  console.log(`Rôle "${role}" accordé à ${user.phone} (${[user.first_name, user.last_name].filter(Boolean).join(" ") || "sans nom"}).`);
}

await prisma.$disconnect();
