/**
 * services/sms.service.ts — Envoi de SMS via Twilio pour VIVRE
 *
 * Responsabilité unique : envoyer des SMS aux numéros burkinabè (+226).
 * En développement sans credentials Twilio, le code OTP est affiché en console
 * pour faciliter les tests sans frais SMS.
 *
 * Pourquoi Twilio et pas un opérateur local ?
 * Twilio dispose de routes directes vers Orange BF et Moov BF avec des taux
 * de livraison supérieurs à 95%. Les APIs des opérateurs locaux sont souvent
 * instables et peu documentées. Twilio offre aussi les webhooks de statut (delivered/failed).
 */

import Twilio from "twilio";

/* ============================================================
 * INITIALISATION TWILIO
 * ============================================================ */

/**
 * Crée le client Twilio à la demande (lazy init).
 * Retourne null si les credentials ne sont pas configurés (mode dev).
 */
function getTwilioClient(): ReturnType<typeof Twilio> | null {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];

  if (!accountSid || !authToken ||
      accountSid === "CHANGE_ME" || authToken === "CHANGE_ME") {
    return null; /* Mode développement — SMS simulé en console */
  }

  return Twilio(accountSid, authToken);
}

/* ============================================================
 * ENVOI D'OTP
 * ============================================================ */

/**
 * Envoie un code OTP par SMS au numéro de téléphone indiqué.
 *
 * En développement (sans Twilio configuré) : affiche le code en console.
 * En production : envoie réellement le SMS via Twilio.
 *
 * @param phone - Numéro au format E.164 (+22670123456)
 * @param code - Code OTP à 6 chiffres
 * @throws Error si l'envoi SMS échoue en production
 */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const client = getTwilioClient();
  const fromNumber = process.env["TWILIO_PHONE_NUMBER"];

  /* --- Mode développement : log en console --- */
  if (!client || !fromNumber || fromNumber === "+12345678901") {
    console.log("\n╔═══════════════════════════════════════╗");
    console.log("║        MODE DEV — CODE OTP SMS        ║");
    console.log(`║  Téléphone : ${phone.padEnd(22)} ║`);
    console.log(`║  Code OTP  : ${code.padEnd(22)} ║`);
    console.log("║  (Twilio non configuré — mode console) ║");
    console.log("╚═══════════════════════════════════════╝\n");
    return;
  }

  /* --- Mode production : envoi Twilio réel --- */
  try {
    await client.messages.create({
      body: `Votre code VIVRE : ${code}\nValable 5 minutes. Ne partagez jamais ce code.`,
      from: fromNumber,
      to: phone,
    });
  } catch (error) {
    /*
     * Logguer l'erreur Twilio mais la relancer pour que le contrôleur
     * puisse retourner une erreur 503 propre à l'utilisateur.
     */
    console.error("[SMS] Échec envoi Twilio :", error);
    throw new Error("Impossible d'envoyer le SMS. Réessayez dans quelques instants.");
  }
}

/* ============================================================
 * GÉNÉRATION DE CODE OTP
 * ============================================================ */

/**
 * Génère un code OTP à 6 chiffres aléatoires.
 * Utilise crypto.getRandomValues pour une entropie cryptographique.
 *
 * Pourquoi pas Math.random() ?
 * Math.random() n'est pas cryptographiquement sûr — un attaquant qui connaît
 * la seed du PRNG peut prédire les codes futurs. crypto garantit l'aléa vrai.
 */
export function generateOtpCode(): string {
  /* Génère un entier entre 100000 et 999999 (6 chiffres garantis) */
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0]! % 900000) + 100000;
  return code.toString();
}
