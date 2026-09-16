import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Chargé AVANT tout — @vivre/database instancie son PrismaClient singleton dès son import,
// donc DATABASE_URL/DIRECT_URL doivent être en place avant que le premier fichier de test
// n'importe quoi que ce soit qui touche à Prisma.
dotenv.config({ path: path.resolve(__dirname, ".env.test.local") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    // Les tests posent de vrais verrous SELECT...FOR UPDATE et attendent des transactions
    // concurrentes réelles contre Postgres — les délais par défaut de Vitest sont trop courts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Un seul worker : les tests partagent la même base Postgres (schéma vivre_test) et
    // certains vérifient des compteurs globaux (ex: inventaire d'un type de billet) —
    // les paralléliser entre fichiers créerait de fausses interférences.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
