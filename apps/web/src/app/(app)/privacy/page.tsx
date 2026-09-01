/**
 * /privacy — Politique de confidentialité VIVRE
 * REMARQUE INTERNE : gabarit de démarrage, à faire relire par un avocat avant le lancement réel.
 */

export const metadata = { title: "Politique de confidentialité | VIVRE" };

export default function PrivacyPage(): React.ReactElement {
  return (
    <main className="mobile-container min-h-screen pb-16">
      <header className="gradient-green text-white pt-safe-top px-4 pb-6">
        <h1 className="font-sora font-extrabold text-xl pt-6">Confidentialité</h1>
        <p className="text-white/70 text-xs font-dm mt-1">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>
      </header>
      <div className="flag-band" />

      <div className="px-4 py-6 space-y-6 text-sm text-ink font-dm leading-relaxed">
        <section>
          <h2 className="font-jakarta font-bold text-ink mb-1.5">Ce que nous collectons</h2>
          <p>
            Numéro de téléphone (connexion), et pour les organisateurs souhaitant vendre des
            billets payants : une pièce d&apos;identité et les informations de votre compte mobile
            money de versement.
          </p>
        </section>
        <section>
          <h2 className="font-jakarta font-bold text-ink mb-1.5">Pièces d&apos;identité</h2>
          <p>
            Stockées de façon chiffrée, dans un espace privé accessible uniquement à notre
            équipe de vérification. Jamais partagées publiquement ni avec d&apos;autres
            organisateurs.
          </p>
        </section>
        <section>
          <h2 className="font-jakarta font-bold text-ink mb-1.5">Partage avec les autorités</h2>
          <p>
            Nous pouvons partager les informations nécessaires avec les autorités compétentes en
            cas de fraude avérée, de demande légale, ou pour la sécurité d&apos;un grand événement.
          </p>
        </section>
      </div>
    </main>
  );
}
