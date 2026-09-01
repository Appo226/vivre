/**
 * /terms — Conditions d'utilisation VIVRE (acheteurs de billets)
 *
 * REMARQUE INTERNE (ne pas supprimer) : ceci est un gabarit de démarrage rédigé pour
 * poser un cadre minimal avant le lancement. Il doit être relu par un avocat local
 * (droit burkinabè / UEMOA) avant que des sommes réelles ne transitent par la plateforme.
 * Ce n'est pas un avis juridique.
 */

export const metadata = { title: "Conditions d'utilisation | VIVRE" };

export default function TermsPage(): React.ReactElement {
  return (
    <main className="mobile-container min-h-screen pb-16">
      <header className="gradient-green text-white pt-safe-top px-4 pb-6">
        <h1 className="font-sora font-extrabold text-xl pt-6">Conditions d&apos;utilisation</h1>
        <p className="text-white/70 text-xs font-dm mt-1">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>
      </header>
      <div className="flag-band" />

      <div className="px-4 py-6 space-y-6 text-sm text-ink font-dm leading-relaxed">
        <Section title="1. Ce qu'est VIVRE">
          VIVRE est une plateforme de billetterie qui met en relation des organisateurs
          d&apos;événements et des personnes souhaitant y assister. VIVRE facilite la vente et
          l&apos;émission des billets ; VIVRE n&apos;organise pas les événements elle-même et n&apos;est pas
          responsable de leur déroulement, de leur sécurité sur place, ni de leur contenu.
        </Section>

        <Section title="2. Aucune garantie de tenue de l'événement">
          VIVRE vérifie l&apos;identité des organisateurs proposant des billets payants, mais ne
          garantit pas qu&apos;un événement aura lieu comme annoncé. En cas d&apos;annulation ou de
          modification substantielle, la politique de remboursement affichée sur la page de
          l&apos;événement s&apos;applique.
        </Section>

        <Section title="3. Billets et paiement">
          Le prix affiché est le prix payé : VIVRE n&apos;ajoute aucun frais caché à l&apos;achat sauf
          mention explicite au moment du paiement. Les paiements mobile money sont traités par
          un prestataire de paiement tiers agréé.
        </Section>

        <Section title="4. Remboursements et annulations">
          Une réservation peut être annulée par l&apos;acheteur jusqu&apos;à 24h avant l&apos;événement, sauf
          politique différente indiquée par l&apos;organisateur sur la page de l&apos;événement. Un billet
          déjà scanné à l&apos;entrée ne peut plus être annulé ni remboursé. Si un événement est
          officiellement annulé par l&apos;organisateur via VIVRE, vous êtes automatiquement
          remboursé. Aucune démarche de votre part n&apos;est nécessaire.
        </Section>

        <Section title="5. Événement qui n'a pas lieu sans annonce : délai de signalement">
          Si un événement ne se déroule pas comme prévu et que vous n&apos;avez reçu aucune
          communication officielle de VIVRE à ce sujet, vous devez le signaler dans les{" "}
          <span className="font-semibold">24 heures suivant l&apos;heure de fin prévue</span> de
          l&apos;événement pour rester éligible à un remboursement. Passé ce délai, la demande ne
          pourra plus être traitée. Le signalement se fait directement depuis votre billet dans
          l&apos;application (« Signaler un problème »).
        </Section>

        <Section title="6. Report d'un événement">
          Un organisateur peut reprogrammer un événement à une date ultérieure avant son
          déroulement. Votre billet reste valable pour la nouvelle date, mais vous conservez
          le droit d&apos;annuler et d&apos;être remboursé à tout moment avant le nouveau créneau,
          même si la règle habituelle des 24 heures ne serait normalement plus applicable.
        </Section>

        <Section title="7. Signaler un problème">
          Si un événement pour lequel vous avez acheté un billet semble frauduleux, n&apos;a pas eu
          lieu, ou si l&apos;organisateur ne répond pas, contactez le support VIVRE : nous pouvons
          suspendre le compte de l&apos;organisateur concerné et coopérer avec les autorités si
          nécessaire.
        </Section>

        <Section title="8. Compte utilisateur">
          Vous êtes responsable de la confidentialité de votre numéro de téléphone utilisé pour
          la connexion. Un compte peut être suspendu en cas d&apos;usage frauduleux (revente illégale
          de billets, utilisation de codes promo en dehors des conditions prévues, etc.).
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section>
      <h2 className="font-jakarta font-bold text-ink mb-1.5">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
