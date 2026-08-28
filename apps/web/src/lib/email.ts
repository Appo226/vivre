/**
 * lib/email.ts — Envoi d'emails transactionnels via Resend.
 *
 * Best-effort partout où c'est utilisé : l'email est optionnel sur le compte
 * (auth 100% téléphone — voir packages/utils/src/phone.ts), donc une notification
 * par email ne doit jamais faire échouer l'action principale (transfert de billet,
 * approbation d'événement, etc.) si l'utilisateur n'a pas renseigné d'email, ou si
 * Resend n'est pas encore configuré (RESEND_API_KEY absente).
 */

const FROM_ADDRESS = "VIVRE <notifications@vivrebf.com>";

export function emailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]);
}

/**
 * Envoie un email si — et seulement si — Resend est configuré ET que le destinataire
 * a un email renseigné. Ne lève jamais d'exception : un échec d'envoi est loggé mais
 * n'interrompt jamais le flux appelant (contrairement à l'OTP, où l'échec bloque
 * volontairement la connexion — ici l'email est un bonus, pas un canal critique).
 */
export async function sendEmail(params: {
  to: string | null | undefined;
  subject: string;
  html: string;
}): Promise<void> {
  const { to, subject, html } = params;
  if (!to || !emailConfigured()) return;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["RESEND_API_KEY"]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });
    if (!response.ok) {
      console.error(`[email] Échec envoi à ${to} : ${response.status} ${await response.text()}`);
    }
  } catch (err) {
    console.error(`[email] Erreur réseau envoi à ${to} :`, err);
  }
}

/** Wrapper HTML commun — cohérent avec la charte VIVRE (vert forêt, Sora/DM Sans). */
function emailShell(bodyHtml: string): string {
  return `
    <div style="font-family: 'DM Sans', Arial, sans-serif; background: #F4F4F2; padding: 32px 16px;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden;">
        <div style="background: #0F2E20; padding: 24px 28px;">
          <span style="font-family: Georgia, serif; font-weight: 800; font-size: 20px; color: #ffffff; letter-spacing: 0.02em;">VIVRE</span>
        </div>
        <div style="padding: 28px;">
          ${bodyHtml}
        </div>
        <div style="padding: 16px 28px; border-top: 1px solid #EEEEEE; font-size: 11px; color: #9AA79E;">
          VIVRE — la billetterie des événements du Burkina Faso · vivrebf.com
        </div>
      </div>
    </div>
  `;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block; margin-top:16px; padding:12px 22px; background:#1A6B3A; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:600; font-size:14px;">${label}</a>`;
}

export function ticketTransferredEmail(params: { eventTitle: string; ticketUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Vous avez reçu un billet 🎟️</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0 0 4px;">
      Quelqu'un vous a transféré son billet pour <strong>${params.eventTitle}</strong>. Il est déjà dans votre compte VIVRE.
    </p>
    ${button("Voir mon billet", params.ticketUrl)}
  `);
}

export function eventApprovedEmail(params: { eventTitle: string; eventUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Événement approuvé ✅</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0 0 4px;">
      <strong>${params.eventTitle}</strong> est maintenant visible publiquement et ouvert aux réservations.
    </p>
    ${button("Voir mon événement", params.eventUrl)}
  `);
}

export function eventRejectedEmail(params: { eventTitle: string; reason: string; editUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Événement non approuvé</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0 0 4px;">
      <strong>${params.eventTitle}</strong> n'a pas été approuvé par notre équipe.
    </p>
    <p style="font-size:13.5px; line-height:1.6; color:#4B5B53; background:#FDF3F3; border:1px solid #F3D6D6; border-radius:10px; padding:12px 14px; margin:12px 0 0;">
      <strong>Motif :</strong> ${params.reason}
    </p>
    ${button("Modifier et resoumettre", params.editUrl)}
  `);
}

export function refundCompletedEmail(params: { eventTitle: string; amountFcfa: number }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Remboursement effectué 💸</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0;">
      Votre remboursement de <strong>${params.amountFcfa.toLocaleString("fr-FR")} FCFA</strong> pour
      <strong>${params.eventTitle}</strong> a été envoyé vers votre moyen de paiement mobile money.
    </p>
  `);
}

export function refundRejectedEmail(params: { eventTitle: string; note: string }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Demande de remboursement refusée</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0 0 4px;">
      Votre demande de remboursement pour <strong>${params.eventTitle}</strong> a été examinée et refusée.
    </p>
    <p style="font-size:13.5px; line-height:1.6; color:#4B5B53; background:#FDF3F3; border:1px solid #F3D6D6; border-radius:10px; padding:12px 14px; margin:12px 0 0;">
      <strong>Motif :</strong> ${params.note}
    </p>
  `);
}

export function verificationApprovedEmail(params: { profileUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Compte organisateur vérifié 🪪</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0;">
      Votre identité est vérifiée — vous pouvez maintenant publier des événements payants sur VIVRE.
    </p>
    ${button("Publier un événement", params.profileUrl)}
  `);
}

export function verificationRejectedEmail(params: { reason: string; profileUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px; margin:0 0 12px; color:#14231C;">Vérification non validée</h1>
    <p style="font-size:14.5px; line-height:1.6; color:#4B5B53; margin:0 0 4px;">
      Votre demande de vérification organisateur n'a pas été validée.
    </p>
    <p style="font-size:13.5px; line-height:1.6; color:#4B5B53; background:#FDF3F3; border:1px solid #F3D6D6; border-radius:10px; padding:12px 14px; margin:12px 0 0;">
      <strong>Motif :</strong> ${params.reason}
    </p>
    ${button("Resoumettre", params.profileUrl)}
  `);
}
