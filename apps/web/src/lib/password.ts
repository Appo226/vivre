/**
 * lib/password.ts — Hachage et vérification des mots de passe.
 *
 * bcryptjs (implémentation pure JS, pas de binding natif) plutôt que bcrypt — évite les
 * problèmes de compilation native que les serverless functions Vercel peuvent rencontrer
 * quand l'architecture de build diffère de celle d'exécution.
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
