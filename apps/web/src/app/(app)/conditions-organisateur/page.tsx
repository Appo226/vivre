/**
 * /conditions-organisateur — Contrat organisateur VIVRE
 *
 * REMARQUE INTERNE (ne pas supprimer) : gabarit de démarrage, à faire relire par un
 * avocat local avant que des sommes réelles ne transitent par la plateforme. Ce n'est
 * pas un avis juridique. Voir aussi docs/LEGACY_SUPERAPP_ROADMAP.md pour le contexte du pivot.
 */

export const metadata = { title: "Conditions organisateur — VIVRE" };

export default function OrganizerTermsPage(): React.ReactElement {
  return (
    <main className="mobile-container min-h-screen pb-16">
      <header className="gradient-green text-white pt-safe-top px-4 pb-6">
        <h1 className="font-sora font-extrabold text-xl pt-6">Contrat organisateur</h1>
        <p className="text-white/70 text-xs font-dm mt-1">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>
      </header>
      <div className="flag-band" />

      <div className="px-4 py-6 space-y-6 text-sm text-gray-700 font-dm leading-relaxed">
        <Section title="1. Votre responsabilité">
          En publiant un événement sur VIVRE, vous déclarez avoir le droit d&apos;organiser cet
          événement au lieu et à la date indiqués (autorisations, permis, accord du propriétaire
          du lieu). Vous êtes seul responsable de la sécurité, du bon déroulement et de la
          légalité de votre événement — VIVRE facilite la vente de billets, elle n&apos;organise pas
          l&apos;événement.
        </Section>

        <Section title="2. Vérification d'identité">
          Tout événement proposant au moins un billet payant exige une vérification préalable :
          pièce d&apos;identité et appel téléphonique de confirmation par l&apos;équipe VIVRE. Cette
          vérification n&apos;est demandée qu&apos;une seule fois — les événements suivants n&apos;ont pas à la
          repasser. VIVRE se réserve le droit de refuser ou révoquer une vérification en cas de
          doute raisonnable sur l&apos;authenticité des informations fournies.
        </Section>

        <Section title="3. Frais de plateforme">
          Tout événement, gratuit ou payant, règle des frais de mise en ligne au moment de la
          soumission — le montant en vigueur vous est indiqué avant paiement. Si vos billets
          sont payants, VIVRE prélève en plus une commission sur chaque billet vendu, affichée
          au moment où vous fixez le prix. Vous pouvez également ajouter une publicité (photo
          ou vidéo) mise en avant sur l&apos;accueil, facturée par jour, réglée dans le même
          paiement. Les montants en vigueur au moment de votre soumission restent fixes pour
          cet événement, même si les tarifs généraux changent ensuite.
        </Section>

        <Section title="4. Versement des fonds">
          Les sommes perçues restent sur le compte agrégateur de paiement de VIVRE jusqu&apos;à la
          fin de votre événement, puis un délai supplémentaire (indiqué dans votre tableau de
          bord organisateur) avant le versement sur votre compte mobile money. Ce délai est
          plus court pour les organisateurs ayant un historique d&apos;événements réussis. VIVRE peut
          suspendre un versement en cas de litige, de signalement de fraude, ou de doute sur la
          tenue réelle de l&apos;événement.
        </Section>

        <Section title="5. Comportements interdits">
          Sont interdits : la création d&apos;événements fictifs, la vente de billets pour un
          événement que vous n&apos;avez pas l&apos;autorisation d&apos;organiser, l&apos;usage de fausses pièces
          d&apos;identité, et toute tentative de contourner les frais de plateforme. Ces
          comportements entraînent la suspension immédiate du compte et la rétention des fonds
          concernés, et peuvent être signalés aux autorités compétentes.
        </Section>

        <Section title="6. Remboursements">
          Vous définissez votre politique de remboursement au moment de la création de
          l&apos;événement. En cas d&apos;annulation de votre part, vous vous engagez à ce que les
          acheteurs soient remboursés selon cette politique.
        </Section>

        <Section title="7. Grands événements">
          Pour les événements de grande capacité, VIVRE peut notifier les autorités locales
          compétentes (ex : police) à titre préventif, conformément à ses obligations de
          coopération.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section>
      <h2 className="font-jakarta font-bold text-gray-900 mb-1.5">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
