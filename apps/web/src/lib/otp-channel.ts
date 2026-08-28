/**
 * lib/otp-channel.ts — Canal de livraison des codes OTP
 *
 * OTP_CHANNEL="dev" (défaut) : le code est retourné dans la réponse API
 * (dev_code) au lieu d'être envoyé — gratuit, aucun compte tiers requis.
 * Le frontend lit déjà ce champ (voir app/(auth)/auth/page.tsx) pour
 * pré-remplir le code en environnement de dev/démo.
 *
 * OTP_CHANNEL="sms" : canal de production — API Orange SMS Burkina Faso
 * (OAuth2 client_credentials, testé en direct avec de vrais envois). Couvre
 * les trois opérateurs (Orange/Moov/Telecel) d'après la doc Orange — à
 * confirmer empiriquement dès qu'un numéro Moov/Telecel réel est disponible
 * pour un test croisé.
 *
 * OTP_CHANNEL="whatsapp" : à connecter à la WhatsApp Cloud API (Meta) une
 * fois qu'un compte Meta Business + numéro vérifié existent — canal de
 * secours envisagé, abandonné au profit du SMS Orange une fois celui-ci
 * opérationnel.
 *
 * SÉCURITÉ — en production, "dev" ne renvoie JAMAIS le code en clair sauf :
 *   (a) pour les numéros listés dans OTP_DEV_ALLOWLIST (numéros de test connus
 *       à l'avance), ou
 *   (b) si la requête porte le bon OTP_DEMO_ACCESS_CODE (voir isDemoAccessGranted) —
 *       pour les démos/tests où on ne connaît PAS le numéro à l'avance (ex: un
 *       investisseur teste avec son propre téléphone). Le lien de démo contient
 *       ce code en paramètre d'URL ; qui a le lien peut se connecter comme
 *       n'importe qui — à traiter comme un secret, jamais posté publiquement.
 * Sans ces garde-fous, n'importe qui sur l'URL publique pourrait demander un
 * OTP pour n'importe quel numéro et se connecter sans jamais recevoir le
 * SMS/WhatsApp — c'est un contournement total de l'auth.
 */

type OtpChannel = "dev" | "sms" | "whatsapp";

function getChannel(): OtpChannel {
  const channel = process.env["OTP_CHANNEL"];
  if (channel === "sms" || channel === "whatsapp") return channel;
  return "dev";
}

/**
 * Token OAuth2 Orange mis en cache en mémoire (process serverless) — évite un aller-retour
 * d'authentification à chaque SMS. expires_in réel est 3600s ; on se garde 60s de marge
 * pour ne jamais envoyer avec un token tout juste expiré.
 */
let cachedOrangeToken: { token: string; expiresAt: number } | null = null;

async function getOrangeAccessToken(): Promise<string> {
  if (cachedOrangeToken && cachedOrangeToken.expiresAt > Date.now()) {
    return cachedOrangeToken.token;
  }

  const clientId = process.env["ORANGE_CLIENT_ID"];
  const clientSecret = process.env["ORANGE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("OTP_CHANNEL=sms mais ORANGE_CLIENT_ID / ORANGE_CLIENT_SECRET manquants");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.orange.com/oauth/v3/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Échec authentification Orange OAuth2 : ${response.status} ${detail}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedOrangeToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

/**
 * Envoie un SMS Orange à texte libre — utilisé pour l'OTP (voir sendViaOrangeSms ci-dessous)
 * et pour les notifications transactionnelles hors-OTP (paiement confirmé, événement
 * approuvé...). N'échoue jamais l'action principale à l'appelant : chaque site d'appel
 * attrape déjà l'erreur et continue (une notification manquée n'est jamais bloquante).
 */
export async function sendOrangeSms(phone: string, message: string): Promise<void> {
  const sender = process.env["ORANGE_SENDER_NUMBER"]; // ex: "22654162130", sans le "+"
  if (!sender) {
    throw new Error("ORANGE_SENDER_NUMBER manquant");
  }

  const token = await getOrangeAccessToken();
  const recipient = phone.replace("+", "");
  const response = await fetch(
    `https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B${sender}/requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:+${recipient}`,
          senderAddress: `tel:+${sender}`,
          outboundSMSTextMessage: { message },
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Échec envoi SMS Orange : ${response.status} ${detail}`);
  }
}

async function sendViaOrangeSms(phone: string, code: string): Promise<void> {
  // La dernière ligne suit le format exigé par la WebOTP API (Android Chrome) pour
  // l'auto-remplissage du code sans que l'utilisateur ouvre le SMS : domaine exact de
  // l'origine (sans protocole), espace, puis "#" + code. Cassé (mauvais domaine, ligne pas
  // en dernière position) = pas d'auto-remplissage, mais le SMS reste lisible normalement
  // dans tous les cas — dégradation silencieuse, pas un risque.
  await sendOrangeSms(phone, `Votre code VIVRE : ${code} (valable 10 minutes)\n@vivrebf.com #${code}`);
}

function isAllowlistedForDevCode(phone: string): boolean {
  const raw = process.env["OTP_DEV_ALLOWLIST"] ?? "";
  const allowlist = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return allowlist.includes(phone);
}

function isDemoAccessGranted(demoCode: string | undefined): boolean {
  const secret = process.env["OTP_DEMO_ACCESS_CODE"];
  return Boolean(secret) && demoCode === secret;
}

/**
 * Envoie le code OTP au numéro donné.
 * Retourne le code en clair uniquement si le canal est "dev" (pour l'auto-fill) — sinon null.
 */
export async function sendOtpCode(
  phone: string,
  code: string,
  demoCode?: string
): Promise<{ devCode: string | null }> {
  const channel = getChannel();

  if (isAllowlistedForDevCode(phone) || isDemoAccessGranted(demoCode)) {
    console.log(`[OTP:dev-bypass] ${phone} → ${code}`);
    return { devCode: code };
  }

  if (channel === "dev") {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error(
        "Envoi SMS/WhatsApp non configuré pour ce numéro (OTP_CHANNEL=dev désactivé en production)"
      );
    }
    console.log(`[OTP:dev] ${phone} → ${code}`);
    return { devCode: code };
  }

  if (channel === "sms") {
    await sendViaOrangeSms(phone, code);
    return { devCode: null };
  }

  // channel === "whatsapp"
  const token = process.env["WHATSAPP_BUSINESS_TOKEN"];
  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  if (!token || !phoneNumberId) {
    throw new Error(
      "OTP_CHANNEL=whatsapp mais WHATSAPP_BUSINESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID manquants"
    );
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "text",
      text: { body: `Votre code VIVRE : ${code} (valable 10 minutes)` },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Échec envoi WhatsApp OTP : ${response.status} ${detail}`);
  }

  return { devCode: null };
}
