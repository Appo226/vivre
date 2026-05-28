/**
 * @vivre/types — Point d'entrée unique du package de types
 *
 * Ce fichier ré-exporte tous les types et enums du projet.
 * Les autres packages importent depuis "@vivre/types" uniquement,
 * jamais depuis des sous-chemins internes (ex: "@vivre/types/src/auth").
 *
 * Organisation des modules :
 * - common.ts   : Types génériques réutilisables (pagination, API responses, erreurs)
 * - enums.ts    : Tous les enums partagés (statuts, rôles, types)
 * - auth.ts     : Types liés à l'authentification et aux utilisateurs
 * - transport.ts: Types pour le transport interurbain et intraurbain
 * - food.ts     : Types pour la livraison de nourriture
 * - property.ts : Types pour l'hébergement
 * - tourism.ts  : Types pour le tourisme, guides, attractions
 * - services.ts : Types pour les services publics et urgences
 * - payments.ts : Types pour les paiements
 * - ai.ts       : Types pour l'assistant IA
 * - driver.ts   : Types pour les chauffeurs
 */

/* Utilitaires génériques */
export * from "./common.js";

/* Enums — doit être importé avant les types qui l'utilisent */
export * from "./enums.js";

/* Domaines métier */
export * from "./auth.js";
export * from "./transport.js";
export * from "./food.js";
export * from "./property.js";
export * from "./tourism.js";
export * from "./services.js";
export * from "./payments.js";
export * from "./ai.js";
export * from "./driver.js";
