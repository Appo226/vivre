/**
 * services/payout.service.ts — Versements automatiques VIVRE
 *
 * Architecture : Strategy Pattern (Provider)
 * ─────────────────────────────────────────
 * Chaque réseau de paiement (Orange, Moov, Telecel, Wave future…) est
 * encapsulé dans un PayoutProvider. Le PayoutProviderRegistry fait la
 * correspondance méthode → provider au moment de l'exécution.
 *
 * Ajouter un nouveau réseau = implémenter PayoutProvider + l'enregistrer.
 * Rien d'autre ne change dans le reste du code.
 *
 *   registry.register("wave_money", new WaveMoneyProvider());
 *
 * FLUX AUTOMATIQUE
 * ─────────────────
 * 1. Driver POST /me/payout
 * 2. Route crée DriverPayout (status: "processing") + appelle dispatchPayout()
 * 3. dispatchPayout() → registry.get(payment_method) → provider.send()
 * 4. Succès → provider_transaction_id sauvegardé, status reste "processing"
 *    Le réseau confirme via webhook ou polling → status → "paid"
 * 5. Échec → status "failed" + failure_reason loggué
 * 6. Admin peut déclencher un retry via POST /admin/payouts/:id/retry
 *
 * OPÉRATEUR CINETPAY TRANSFER
 * ─────────────────────────────
 * CinetPay propose une API de décaissement ("Transfer") distincte de l'API
 * de collecte (Checkout). Elle permet d'envoyer de l'argent vers n'importe
 * quel wallet mobile money depuis notre compte CinetPay.
 *
 * Codes opérateur pour le Burkina Faso (à vérifier avec les docs CinetPay) :
 *   Orange Money BF → "OM"
 *   Moov Money BF   → "FLOOZ"   (Flooz = marque Moov BF)
 *   Telecel Money   → "TM"
 *
 * VARIABLES D'ENVIRONNEMENT
 * ──────────────────────────
 *   CINETPAY_API_KEY      — même clé que pour la collecte
 *   CINETPAY_SITE_ID      — même site ID
 *   CINETPAY_TRANSFER_URL — URL de base de l'API Transfer (défaut ci-dessous)
 */

import { prisma } from "@vivre/database";

/* ============================================================
 * INTERFACE PROVIDER — Contrat que tout provider doit respecter
 * ============================================================ */

export interface PayoutSendParams {
  /** Numéro de téléphone mobile money (avec indicatif, ex: +22670000000) */
  phoneNumber:    string;
  /** Montant en FCFA */
  amountFcfa:     number;
  /** Nom complet du bénéficiaire (affiché sur le reçu) */
  recipientName:  string;
  /** Notre référence interne (DriverPayout.id) */
  referenceId:    string;
}

export interface PayoutSendResult {
  /** ID de transaction chez l'opérateur — stocké dans provider_transaction_id */
  providerTransactionId: string;
  /** Message optionnel de l'opérateur */
  message?: string;
}

export interface PayoutStatusResult {
  status:  "processing" | "paid" | "failed";
  message?: string;
}

/**
 * Contrat minimal qu'un provider de paiement doit implémenter.
 * provider.send() déclenche le virement.
 * provider.checkStatus() permet de vérifier l'état d'un virement en cours.
 */
export interface PayoutProvider {
  readonly name: string;

  /**
   * Initie un virement vers le compte mobile money du bénéficiaire.
   * Lance une exception si le virement ne peut pas être initié.
   * Un résultat positif signifie que l'opérateur a accepté la demande
   * (≠ argent déjà reçu — c'est "processing", pas "paid").
   */
  send(params: PayoutSendParams): Promise<PayoutSendResult>;

  /**
   * Vérifie l'état d'un virement en cours.
   * Utilisé par un job de polling ou un webhook pour mettre à jour le statut.
   */
  checkStatus(providerTransactionId: string): Promise<PayoutStatusResult>;
}

/* ============================================================
 * REGISTRY — Résolution provider au runtime
 * ============================================================ */

class PayoutProviderRegistry {
  private readonly providers = new Map<string, PayoutProvider>();

  /** Enregistre un provider pour une ou plusieurs méthodes de paiement */
  register(paymentMethod: string, provider: PayoutProvider): void {
    this.providers.set(paymentMethod, provider);
  }

  /**
   * Retourne le provider pour une méthode de paiement.
   * Lance une exception si aucun provider n'est configuré pour cette méthode.
   */
  get(paymentMethod: string): PayoutProvider {
    const provider = this.providers.get(paymentMethod);
    if (!provider) {
      throw new Error(
        `Aucun provider de paiement configuré pour "${paymentMethod}". ` +
        `Méthodes disponibles: ${Array.from(this.providers.keys()).join(", ")}`
      );
    }
    return provider;
  }

  /** Liste toutes les méthodes de paiement disponibles */
  supportedMethods(): string[] {
    return Array.from(this.providers.keys());
  }
}

/* ============================================================
 * PROVIDER CINETPAY TRANSFER
 *
 * Implémente les virements via l'API CinetPay Transfer (décaissement).
 * Cette API est distincte de l'API CinetPay Checkout (collecte).
 *
 * Doc officielle : https://cinetpay.com/api/transfer
 * (Vérifier les codes opérateur et la structure exacte des réponses
 *  avec l'équipe CinetPay ou le portail développeur.)
 * ============================================================ */

const CINETPAY_TRANSFER_BASE =
  process.env["CINETPAY_TRANSFER_URL"] ?? "https://client.cinetpay.com/v1";

/**
 * Codes opérateur CinetPay Transfer pour le Burkina Faso.
 * CinetPay utilise des codes courts différents de l'API Checkout.
 *
 * IMPORTANT : Ces codes doivent être vérifiés dans la doc CinetPay Transfer.
 * Ils peuvent différer selon la version de l'API et le pays.
 * Source à consulter : https://cinetpay.com/api/transfer#operators
 */
const CINETPAY_OPERATOR_CODES: Record<string, string> = {
  orange_money:  "OM",     /* Orange Money Burkina Faso */
  moov:          "FLOOZ",  /* Moov Money BF — marque commerciale Flooz */
  telecel_money: "TM",     /* Telecel Money Burkina Faso */
  /* Ajouter ici les futurs opérateurs sans toucher au reste du code */
};

function getCinetPayCredentials() {
  const apiKey = process.env["CINETPAY_API_KEY"];
  const siteId = process.env["CINETPAY_SITE_ID"];
  if (!apiKey || !siteId) {
    throw new Error("CINETPAY_API_KEY et CINETPAY_SITE_ID doivent être définis pour les versements");
  }
  return { apiKey, siteId };
}

/** Extrait indicatif + numéro depuis un format +226XXXXXXXX */
function parsePhone(phone: string): { prefix: string; number: string } {
  const cleaned = phone.replace(/\s+/g, "").replace(/^00/, "+");
  const match = cleaned.match(/^\+(\d{1,4})(\d+)$/);
  if (match) return { prefix: match[1]!, number: match[2]! };
  /* Fallback : assume Burkina Faso si pas d'indicatif */
  return { prefix: "226", number: cleaned.replace(/^\+226/, "").replace(/^0/, "") };
}

class CinetPayTransferProvider implements PayoutProvider {
  readonly name = "CinetPay Transfer";

  send(_params: PayoutSendParams): Promise<PayoutSendResult> {
    /*
     * Ne pas appeler directement : le code opérateur est fixé par méthode de paiement.
     * Utiliser CinetPayTransferProviderForMethod enregistré dans le registry.
     */
    return Promise.reject(
      new Error("Utiliser CinetPayTransferProviderForMethod — ne pas appeler CinetPayTransferProvider directement")
    );
  }

  async checkStatus(providerTransactionId: string): Promise<PayoutStatusResult> {
    const { apiKey, siteId } = getCinetPayCredentials();

    const response = await fetch(`${CINETPAY_TRANSFER_BASE}/check/money`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey:  apiKey,
        site_id: siteId,
        data:    [{ transaction_id: providerTransactionId }],
      }),
    });

    if (!response.ok) {
      return { status: "processing", message: `HTTP ${response.status}` };
    }

    const data = await response.json() as {
      code: string;
      data?: Array<{ status: string; message?: string }>;
    };

    const entry = data.data?.[0];
    if (!entry) return { status: "processing" };

    /* Codes de statut CinetPay Transfer (à vérifier avec la doc) */
    if (entry.status === "COMPLETED" || entry.status === "SUCCESS") {
      return { status: "paid", ...(entry.message ? { message: entry.message } : {}) };
    }
    if (entry.status === "FAILED" || entry.status === "REJECTED" || entry.status === "ERROR") {
      return { status: "failed", ...(entry.message ? { message: entry.message } : {}) };
    }
    return { status: "processing", ...(entry.message ? { message: entry.message } : {}) };
  }
}

/**
 * Wrapper qui fixe le code opérateur pour une méthode de paiement donnée.
 * Enregistré une fois par méthode dans le registry.
 */
class CinetPayTransferProviderForMethod implements PayoutProvider {
  readonly name: string;
  private readonly operatorCode: string;
  private readonly base = new CinetPayTransferProvider();

  constructor(paymentMethod: string, operatorCode: string) {
    this.name         = `CinetPay Transfer (${paymentMethod})`;
    this.operatorCode = operatorCode;
  }

  async send(params: PayoutSendParams): Promise<PayoutSendResult> {
    const { apiKey, siteId } = getCinetPayCredentials();
    const { prefix, number } = parsePhone(params.phoneNumber);

    const response = await fetch(`${CINETPAY_TRANSFER_BASE}/transfer/contact/add`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: apiKey,
        data: [{
          prefix,
          phone:          number,
          name:           params.recipientName,
          amount:         params.amountFcfa,
          payment_method: this.operatorCode,
          merchant_id:    siteId,
          /*
           * CinetPay utilise notre referenceId pour la traçabilité.
           * Permet de retrouver un virement côté CinetPay si besoin.
           */
          client_transaction_id: params.referenceId,
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`CinetPay Transfer HTTP ${response.status}`);
    }

    const data = await response.json() as {
      code:     string;
      message:  string;
      data?: {
        log?: Array<{ transaction_id?: string; status?: string; message?: string }>;
      };
    };

    /*
     * Code "0" = succès selon la doc CinetPay Transfer.
     * À vérifier : CinetPay peut utiliser "200" ou autre selon la version API.
     */
    if (data.code !== "0" && data.code !== "200") {
      throw new Error(`CinetPay Transfer refusé : ${data.message} (code ${data.code})`);
    }

    const log = data.data?.log?.[0];
    const providerTransactionId = log?.transaction_id ?? params.referenceId;

    return { providerTransactionId, ...(log?.message ? { message: log.message } : {}) };
  }

  checkStatus(providerTransactionId: string): Promise<PayoutStatusResult> {
    return this.base.checkStatus(providerTransactionId);
  }
}

/* ============================================================
 * INITIALISATION DU REGISTRY
 *
 * Un seul endroit pour configurer tous les providers.
 * Ajouter un nouveau réseau = une ligne ici.
 * ============================================================ */

function buildRegistry(): PayoutProviderRegistry {
  const registry = new PayoutProviderRegistry();

  /*
   * CinetPay Transfer couvre Orange Money, Moov et Telecel via une même API.
   * Chaque méthode a son propre code opérateur dans CINETPAY_OPERATOR_CODES.
   */
  for (const [method, code] of Object.entries(CINETPAY_OPERATOR_CODES)) {
    registry.register(method, new CinetPayTransferProviderForMethod(method, code));
  }

  /* Exemple futur :
   *   registry.register("wave_money", new WaveMoneyProvider());
   *   registry.register("airtel_money", new AirtelMoneyProvider());
   */

  return registry;
}

/** Singleton — partagé par tous les appels */
export const payoutRegistry = buildRegistry();

/* ============================================================
 * DISPATCH PAYOUT — Point d'entrée principal
 * ============================================================ */

/**
 * Déclenche automatiquement un virement pour un DriverPayout existant.
 *
 * Appelé immédiatement après la création du DriverPayout.
 * Opère en arrière-plan (fire-and-forget depuis la route HTTP).
 * Met à jour le statut dans la base : processing / failed.
 *
 * En cas d'échec, le record reste en "failed" avec failure_reason.
 * L'admin peut déclencher un retry via POST /admin/payouts/:id/retry.
 */
export async function dispatchPayout(payoutId: string): Promise<void> {
  /* Charger le payout + infos du livreur */
  const payout = await prisma.driverPayout.findUnique({
    where: { id: payoutId },
    select: {
      id:             true,
      amount_fcfa:    true,
      payment_method: true,
      phone_number:   true,
      driver: {
        select: {
          user: { select: { first_name: true, last_name: true } },
        },
      },
    },
  });

  if (!payout) {
    console.error(`[Payout] dispatchPayout: payout ${payoutId} introuvable`);
    return;
  }

  const recipientName =
    [payout.driver.user.first_name, payout.driver.user.last_name].filter(Boolean).join(" ")
    || "Livreur VIVRE";

  try {
    const provider = payoutRegistry.get(payout.payment_method);

    console.info(
      `[Payout] Envoi de ${payout.amount_fcfa} FCFA via ${provider.name} → ${payout.phone_number}`
    );

    const result = await provider.send({
      phoneNumber:    payout.phone_number,
      amountFcfa:     payout.amount_fcfa,
      recipientName,
      referenceId:    payout.id,
    });

    /* Virement initié — on stocke l'ID opérateur pour le suivi */
    await prisma.driverPayout.update({
      where: { id: payoutId },
      data: {
        status:                  "processing",
        provider_transaction_id: result.providerTransactionId,
      },
    });

    console.info(
      `[Payout] ✅ Virement initié : ${result.providerTransactionId} (${payout.amount_fcfa} FCFA)`
    );

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[Payout] ❌ Échec du virement pour payout ${payoutId} : ${reason}`);

    await prisma.driverPayout.update({
      where: { id: payoutId },
      data: {
        status:         "failed",
        failure_reason: reason,
      },
    });
  }
}

/**
 * Déclenche un virement mobile money pour un remboursement approuvé par l'admin.
 * Lit le payment_method du paiement original pour choisir l'opérateur.
 * Met à jour le statut du Refund : "completed" ou "failed".
 */
export async function dispatchMobileMoneyRefund(refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    select: {
      id:     true,
      amount: true,
      payment: {
        select: {
          payment_method: true,
          user: { select: { phone: true, first_name: true, last_name: true } },
        },
      },
    },
  });

  if (!refund) {
    console.error(`[Refund] dispatchMobileMoneyRefund: refund ${refundId} introuvable`);
    return;
  }

  const { payment } = refund;
  const recipientName =
    [payment.user.first_name, payment.user.last_name].filter(Boolean).join(" ")
    || "Client VIVRE";

  try {
    const provider = payoutRegistry.get(payment.payment_method);

    console.info(
      `[Refund] Remboursement ${refund.amount} FCFA via ${provider.name} → ${payment.user.phone}`
    );

    const result = await provider.send({
      phoneNumber:  payment.user.phone,
      amountFcfa:   refund.amount,
      recipientName,
      referenceId:  `refund-${refund.id}`,
    });

    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status:     "completed",
        processed_at: new Date(),
      },
    });

    console.info(`[Refund] ✅ Remboursement effectué : ${result.providerTransactionId}`);

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[Refund] ❌ Échec du remboursement ${refundId} : ${reason}`);

    /* Refund "rejected" — l'admin devra retry manuellement */
    await prisma.refund.update({
      where: { id: refundId },
      data: { status: "rejected" },
    });
  }
}

/**
 * Vérifie le statut d'un virement en cours auprès de l'opérateur.
 * Appelé manuellement par l'admin ou par un job planifié.
 * Met à jour le statut dans la base si changement.
 */
export async function refreshPayoutStatus(payoutId: string): Promise<void> {
  const payout = await prisma.driverPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, payment_method: true, provider_transaction_id: true, status: true },
  });

  if (!payout?.provider_transaction_id || payout.status === "paid") return;

  try {
    const provider = payoutRegistry.get(payout.payment_method);
    const result   = await provider.checkStatus(payout.provider_transaction_id);

    if (result.status !== payout.status) {
      await prisma.driverPayout.update({
        where: { id: payoutId },
        data: {
          status:         result.status,
          failure_reason: result.status === "failed" ? (result.message ?? null) : null,
          ...(result.status === "paid" ? { processed_at: new Date() } : {}),
        },
      });
      console.info(`[Payout] Statut ${payoutId} mis à jour : ${payout.status} → ${result.status}`);
    }
  } catch (err) {
    console.error(`[Payout] Erreur refresh statut ${payoutId} :`, err);
  }
}
