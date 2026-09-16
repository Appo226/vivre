/**
 * tests/integration/setup.ts — Chargé une fois par worker Vitest avant les tests.
 *
 * Charge .env.test.local (Vitest exécute les workers dans des processus séparés — le
 * dotenv.config() de vitest.config.ts ne suffit pas à lui seul, voir sa propre note) et pose
 * un garde-fou : REFUSE de démarrer si DATABASE_URL ne pointe manifestement pas vers un
 * environnement de test dédié. Les tests suppriment/mutent de vraies lignes — une erreur de
 * configuration qui les ferait tourner contre vivre_dev ou la production serait destructrice.
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test.local") });

const databaseUrl = process.env["DATABASE_URL"] ?? "";
const looksLikeTestDb = /vivre_test|schema=vivre_test/.test(databaseUrl);
if (!looksLikeTestDb) {
  throw new Error(
    "DATABASE_URL ne ressemble pas à une base/schéma de test (attendu : \"vivre_test\" dans " +
    "le nom de la base ou le paramètre ?schema=). Vérifiez apps/web/.env.test.local avant de " +
    "lancer la suite — ces tests suppriment et modifient de vraies lignes."
  );
}
