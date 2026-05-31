/**
 * services/payment.service.ts — Abstraction CinetPay pour VIVRE
 *
 * CinetPay est un agrégateur mobile money panafricain : il accepte Orange Money,
 * Moov Money et Telecel Money via une seule intégration. Le client choisit son
 * réseau sur la page CinetPay hébergée — notre code n'a pas à connaître le réseau
 * du client ni celui du commerçant. CinetPay règle le routage inter-réseaux.
 *
 * FLUX COMPLET :
 *   1. Notre API → initiateCinetPayPayment() → reçoit un payment_url
 *   2. Frontend redirige le client sur payment_url (page CinetPay)
 *   3. Client paie via USSD / OTP sur son téléphone
 *   4. CinetPay POST notre notify_url (webhook IPN)
 *   5. Notre webhook → verifyCinetPayPayment() pour confirmer (JAMAIS faire
 *      confiance au seul payload du webhook — toujours re-vérifier via l'API check)
 *   6. Webhook met à jour Payment + entité liée (commande / réservation)
 *   7. CinetPay redirige le client vers notre return_url
 *
 * VARIABLES D'ENVIRONNEMENT :
 *   CINETPAY_API_KEY  — Clé API de votre compte CinetPay
 *   CINETPAY_SITE_ID  — Site ID de votre compte CinetPay
 *   APP_URL           — URL publique du frontend (https://vivre.bf)
 *   API_URL           — URL publique de l'API   (https://api.vivre.bf)
 */

const INITIATE_URL = "https://api-checkout.cinetpay.com/v2/payment";
const CHECK_URL    = "https://api-checkout.cinetpay.com/v2/payment/check";

/* ============================================================
 * TYPES
 * ============================================================ */

export interface InitiatePaymentParams {
  transactionId:  string;   /* Notre Payment.id — CinetPay le renvoie dans le webhook */
  amountFcfa:     number;
  description:    string;   /* Affiché sur la page CinetPay et sur le reçu */
  customerName:   string;
  customerPhone:  string;   /* Format +226XXXXXXXX */
  customerEmail?: string;
  returnUrl:      string;   /* Où CinetPay redirige après paiement */
  notifyUrl:      string;   /* Notre webhook IPN */
}

export interface InitiatePaymentResult {
  paymentUrl:   string;  /* URL CinetPay hébergée — rediriger le client */
  paymentToken: string;  /* Token CinetPay — stocké dans Payment.provider_ref */
}

export interface VerifyPaymentResult {
  status:        "completed" | "failed" | "pending";
  paymentMethod: string | null;  /* "orange_money" | "moov" | "telecel_money" */
  amount:        number | null;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function getCredentials(): { apiKey: string; siteId: string } {
  const apiKey = process.env["CINETPAY_API_KEY"];
  const siteId = process.env["CINETPAY_SITE_ID"];
  if (!apiKey || !siteId) {
    throw new Error("CINETPAY_API_KEY et CINETPAY_SITE_ID doivent être définis");
  }
  return { apiKey, siteId };
}

/* Mapping des noms de méthode CinetPay → nos valeurs internes */
const METHOD_MAP: Record<string, string> = {
  ORANGE_MONEY:  "orange_money",
  MOOV_MONEY:    "moov",
  TELECEL_MONEY: "telecel_money",
};

/* ============================================================
 * FONCTIONS PUBLIQUES
 * ============================================================ */

/**
 * Initie un paiement auprès de CinetPay.
 * Retourne l'URL de la page de paiement hébergée.
 *
 * channels:"ALL" affiche tous les réseaux (Orange, Moov, Telecel…).
 * L'agrégateur gère le routage inter-réseaux — pas notre code.
 */
export async function initiateCinetPayPayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResult> {
  const { apiKey, siteId } = getCredentials();

  const response = await fetch(INITIATE_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey:                apiKey,
      site_id:               siteId,
      transaction_id:        params.transactionId,
      amount:                params.amountFcfa,
      currency:              "XOF",
      description:           params.description,
      return_url:            params.returnUrl,
      notify_url:            params.notifyUrl,
      customer_name:         params.customerName,
      customer_phone_number: params.customerPhone,
      ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
      channels: "ALL",  /* Tous les réseaux — Orange, Moov, Telecel affichés au client */
      lang:     "fr",
    }),
  });

  if (!response.ok) {
    throw new Error(`CinetPay HTTP ${response.status}`);
  }

  const data = await response.json() as {
    code: string;
    message: string;
    data?: { payment_token: string; payment_url: string };
    description?: string;
  };

  if (data.code !== "201" || !data.data?.payment_url) {
    throw new Error(`CinetPay a refusé la transaction : ${data.message} — ${data.description ?? ""}`);
  }

  return {
    paymentUrl:   data.data.payment_url,
    paymentToken: data.data.payment_token,
  };
}

/**
 * Vérifie le statut d'un paiement auprès de l'API check CinetPay.
 *
 * Ne JAMAIS se fier uniquement au payload du webhook IPN.
 * Toujours appeler cette fonction pour confirmer le statut côté CinetPay.
 * Protège contre les faux webhooks et les attaques par rejeu.
 */
export async function verifyCinetPayPayment(
  transactionId: string
): Promise<VerifyPaymentResult> {
  const { apiKey, siteId } = getCredentials();

  const response = await fetch(CHECK_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: transactionId }),
  });

  if (!response.ok) {
    throw new Error(`CinetPay check HTTP ${response.status}`);
  }

  const data = await response.json() as {
    code:    string;
    message: string;
    data?: {
      status:         string;
      payment_method: string;
      amount:         number;
    };
  };

  const cpStatus = data.data?.status;

  /* ACCEPTED → completed, REFUSED → failed, tout le reste → pending */
  const status: VerifyPaymentResult["status"] =
    cpStatus === "ACCEPTED" ? "completed" :
    cpStatus === "REFUSED"  ? "failed"    : "pending";

  const rawMethod = data.data?.payment_method ?? "";
  const paymentMethod = METHOD_MAP[rawMethod] ?? null;

  return {
    status,
    paymentMethod,
    amount: data.data?.amount ?? null,
  };
}

/** URL de retour après paiement — page /paiement/retour du frontend */
export function buildReturnUrl(paymentId: string): string {
  const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  return `${appUrl}/paiement/retour?payment_id=${paymentId}`;
}

/** URL du webhook IPN — doit être une URL publique (ngrok en dev) */
export function buildNotifyUrl(): string {
  const apiUrl = process.env["API_URL"] ?? "http://localhost:3001";
  return `${apiUrl}/v1/payments/webhook`;
}
