/**
 * lib/cinetpay.ts — Abstraction CinetPay pour VIVRE (port du service Fastify d'origine).
 *
 * CinetPay est un agrégateur mobile money panafricain : Orange Money, Moov Money et
 * Telecel Money via une seule intégration (channels: "ALL"). Le client choisit son
 * réseau sur la page CinetPay hébergée. Wave n'est pas confirmé au catalogue CinetPay
 * pour le Burkina Faso à ce jour (Orange Burkina + Moov Burkina Faso sont pris en charge
 * par CinetPay) — si l'écran de paiement CinetPay ne propose pas Wave dans "ALL" une fois
 * les identifiants réels en place, il faudra une intégration Wave séparée. Voir CINETPAY_INTEGRATION.md.
 *
 * FLUX :
 *   1. POST /api/payments/initiate → initiateCinetPayPayment() → payment_url
 *   2. Le client est redirigé sur payment_url (page CinetPay hébergée)
 *   3. Paiement via USSD / OTP sur son téléphone
 *   4. CinetPay POST /api/payments/webhook (IPN)
 *   5. Le webhook appelle TOUJOURS verifyCinetPayPayment() pour re-vérifier — ne jamais
 *      faire confiance au seul payload du webhook (protection anti-rejeu/faux webhook)
 *   6. Webhook met à jour Payment + EventBooking (confirmed) + génère le QR code
 *
 * VARIABLES D'ENVIRONNEMENT REQUISES (à fournir par l'utilisateur — compte CinetPay réel) :
 *   CINETPAY_API_KEY, CINETPAY_SITE_ID
 */

const INITIATE_URL = "https://api-checkout.cinetpay.com/v2/payment";
const CHECK_URL = "https://api-checkout.cinetpay.com/v2/payment/check";

export interface InitiatePaymentParams {
  transactionId: string;
  amountFcfa: number;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface InitiatePaymentResult {
  paymentUrl: string;
  paymentToken: string;
}

export interface VerifyPaymentResult {
  status: "completed" | "failed" | "pending";
  paymentMethod: string | null;
  amount: number | null;
}

export function cinetpayConfigured(): boolean {
  return Boolean(process.env["CINETPAY_API_KEY"] && process.env["CINETPAY_SITE_ID"]);
}

function getCredentials(): { apiKey: string; siteId: string } {
  const apiKey = process.env["CINETPAY_API_KEY"];
  const siteId = process.env["CINETPAY_SITE_ID"];
  if (!apiKey || !siteId) {
    throw new Error("CINETPAY_API_KEY et CINETPAY_SITE_ID doivent être définis — voir CINETPAY_INTEGRATION.md");
  }
  return { apiKey, siteId };
}

const METHOD_MAP: Record<string, string> = {
  ORANGE_MONEY: "orange_money",
  MOOV_MONEY: "moov",
  TELECEL_MONEY: "telecel_money",
  WAVE: "wave",
};

export async function initiateCinetPayPayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
  const { apiKey, siteId } = getCredentials();

  const response = await fetch(INITIATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      site_id: siteId,
      transaction_id: params.transactionId,
      amount: params.amountFcfa,
      currency: "XOF",
      description: params.description,
      return_url: params.returnUrl,
      notify_url: params.notifyUrl,
      customer_name: params.customerName,
      customer_phone_number: params.customerPhone,
      ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
      channels: "ALL",
      lang: "fr",
    }),
  });

  if (!response.ok) {
    throw new Error(`CinetPay HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    code: string;
    message: string;
    data?: { payment_token: string; payment_url: string };
    description?: string;
  };

  if (data.code !== "201" || !data.data?.payment_url) {
    throw new Error(`CinetPay a refusé la transaction : ${data.message} — ${data.description ?? ""}`);
  }

  return { paymentUrl: data.data.payment_url, paymentToken: data.data.payment_token };
}

export async function verifyCinetPayPayment(transactionId: string): Promise<VerifyPaymentResult> {
  const { apiKey, siteId } = getCredentials();

  const response = await fetch(CHECK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: transactionId }),
  });

  if (!response.ok) {
    throw new Error(`CinetPay check HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    code: string;
    message: string;
    data?: { status: string; payment_method: string; amount: number };
  };

  const cpStatus = data.data?.status;
  const status: VerifyPaymentResult["status"] =
    cpStatus === "ACCEPTED" ? "completed" : cpStatus === "REFUSED" ? "failed" : "pending";

  return {
    status,
    paymentMethod: METHOD_MAP[data.data?.payment_method ?? ""] ?? null,
    amount: data.data?.amount ?? null,
  };
}

export function buildReturnUrl(paymentId: string): string {
  const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  return `${appUrl}/paiement/retour?payment_id=${paymentId}`;
}

export function buildNotifyUrl(): string {
  const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  return `${appUrl}/api/payments/webhook`;
}
