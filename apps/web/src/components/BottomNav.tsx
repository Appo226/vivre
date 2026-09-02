/**
 * components/BottomNav.tsx — Navigation inférieure principale
 *
 * Barre de navigation présente sur toutes les pages authentifiées.
 * 5 onglets : Accueil, Services publics, Transport, Food, Profil.
 *
 * UX mobile-first :
 * - Sticky en bas de l'écran (fixed + bottom-0)
 * - Respecte la safe-area iOS (padding-bottom env(safe-area-inset-bottom))
 * - L'onglet actif est mis en évidence avec la couleur verte VIVRE (#1A6B3A)
 * - Animations de tap légères (scale sur active)
 *
 * "use client" requis : utilise usePathname() pour détecter l'onglet actif.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ============================================================
 * DÉFINITION DES ONGLETS
 * ============================================================ */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /* activePattern : regex qui matche toutes les sous-routes de cet onglet */
  activePattern: RegExp;
}

/* Icônes SVG inline — évite un import de bibliothèque pour 5 icônes */
const HomeIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/>
    <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z"/>
  </svg>
);

const ShieldIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M11.484 2.17a.75.75 0 011.032 0 11.209 11.209 0 007.877 3.08.75.75 0 01.722.515 12.74 12.74 0 01.635 3.985c0 5.942-4.064 10.933-9.563 12.348a.749.749 0 01-.374 0C6.314 20.683 2.25 15.692 2.25 9.75c0-1.39.223-2.73.635-3.985a.75.75 0 01.722-.516l.143.001c2.996 0 5.718-1.17 7.734-3.08zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zM12 15a.75.75 0 000 1.5.75.75 0 000-1.5z" clipRule="evenodd"/>
  </svg>
);

/* Le path précédent ici était en fait l'icône Heroicons "groupe de personnes" mal étiquetée
   TicketIcon — jamais un vrai billet. Remplacé par le vrai path "Ticket" de Heroicons
   (rectangle à bords perforés/encochés, comme un vrai talon de billet). */
const TicketIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M4.5 3.75a3 3 0 00-3 3v.75c0 .414.336.75.75.75a2.25 2.25 0 010 4.5.75.75 0 00-.75.75v.75a3 3 0 003 3h15a3 3 0 003-3v-.75a.75.75 0 00-.75-.75 2.25 2.25 0 010-4.5.75.75 0 00.75-.75v-.75a3 3 0 00-3-3h-15zm11.25 3a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008a.75.75 0 01.75-.75h.008zm0 3a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008a.75.75 0 01.75-.75h.008zm0 3a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008a.75.75 0 01.75-.75h.008z" clipRule="evenodd" />
  </svg>
);

const PlusCircleIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v2.25H15a.75.75 0 010 1.5h-2.25V15a.75.75 0 01-1.5 0v-2.25H9a.75.75 0 010-1.5h2.25V9a.75.75 0 01.75-.75z" clipRule="evenodd"/>
  </svg>
);

const UserIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd"/>
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Accueil",
    icon: <HomeIcon />,
    activePattern: /^\/$/,
  },
  {
    href: "/evenements/mes-billets",
    label: "Mes billets",
    icon: <TicketIcon />,
    activePattern: /^\/evenements\/mes-billets/,
  },
  {
    href: "/evenements/publier",
    label: "Organiser",
    icon: <PlusCircleIcon />,
    activePattern: /^\/evenements\/publier/,
  },
  {
    href: "/urgences",
    label: "Urgences",
    icon: <ShieldIcon />,
    activePattern: /^\/(urgences|services)/,
  },
  {
    href: "/profile",
    label: "Profil",
    icon: <UserIcon />,
    activePattern: /^\/profile/,
  },
];

/* ============================================================
 * COMPOSANT
 * ============================================================ */

export function BottomNav(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className={[
        /* Fixé en bas, pleine largeur */
        "fixed bottom-0 left-0 right-0 z-50",
        /* Fond vert forêt — cohérent avec la charte graphique (mark, ticket, merch) */
        "bg-dark border-t border-white/10",
        /*
         * Safe area iOS — évite que les onglets soient sous la barre de geste.
         * "pb-safe" n'est pas une classe Tailwind réelle ici (seul "safe-bottom",
         * 72px + l'inset, est défini dans @vivre/config/tailwind — bien trop grand
         * pour un padding interne à la nav elle-même) ; valeur arbitraire directe.
         */
        "pb-[env(safe-area-inset-bottom)]",
        /* Ombre légère vers le haut */
        "shadow-[0_-2px_10px_rgba(0,0,0,0.25)]",
      ].join(" ")}
    >
      <ul className="flex items-center justify-around px-2 py-2 md:max-w-2xl lg:max-w-3xl md:mx-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.activePattern.test(pathname);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex flex-col items-center gap-0.5 py-1 px-2",
                  "rounded-xl transition-all duration-150 active:scale-95",
                  /* Couleur active vs inactive — texte clair sur fond vert forêt */
                  isActive
                    ? "text-[#77C28F]"   /* Vert clair VIVRE, lisible sur fond sombre */
                    : "text-white/40 hover:text-white/70",
                ].join(" ")}
              >
                {/* Fond vert pâle derrière l'icône active */}
                <span
                  className={[
                    "flex items-center justify-center w-10 h-6 rounded-full transition-colors duration-150",
                    isActive ? "bg-white/10" : "",
                  ].join(" ")}
                >
                  {item.icon}
                </span>

                {/* Label sous l'icône */}
                <span className={[
                  "text-[10px] font-medium leading-none",
                  isActive ? "font-semibold" : "",
                ].join(" ")}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
