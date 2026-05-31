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

const BusIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M3 6a3 3 0 013-3h12a3 3 0 013 3v11.25a3 3 0 01-1.608 2.649l.12.6A.75.75 0 0119.5 21h-.75a.75.75 0 01-.75-.75v-.75H6v.75a.75.75 0 01-.75.75H4.5a.75.75 0 01-.012-1.5l.12-.6A3 3 0 013 17.25V6zm3-1.5a1.5 1.5 0 00-1.5 1.5V9h15V6A1.5 1.5 0 0018 4.5H6zM4.5 10.5v6.75a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V10.5h-15zM8.25 12a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75v-1.5a.75.75 0 01.75-.75h1.5zm5.25.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zm2.25-.75a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-1.5a.75.75 0 01.75-.75h1.5z" clipRule="evenodd"/>
  </svg>
);

const FoodIcon = (): React.ReactElement => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M15 3.75A5.25 5.25 0 009.75 9v10.19l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l1.72 1.72V9a6.75 6.75 0 0113.5 0v3a.75.75 0 01-1.5 0V9c0-2.9-2.35-5.25-5.25-5.25z" clipRule="evenodd"/>
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
    href: "/urgences",
    label: "Urgences",
    icon: <ShieldIcon />,
    activePattern: /^\/(urgences|services)/,
  },
  {
    href: "/transport",
    label: "Transport",
    icon: <BusIcon />,
    activePattern: /^\/transport/,
  },
  {
    href: "/food",
    label: "Food",
    icon: <FoodIcon />,
    activePattern: /^\/food/,
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
        /* Fond blanc avec bordure supérieure subtile */
        "bg-white border-t border-gray-100",
        /* Safe area iOS — évite que les onglets soient sous la barre de geste */
        "pb-safe",
        /* Ombre légère vers le haut */
        "shadow-[0_-2px_10px_rgba(0,0,0,0.06)]",
      ].join(" ")}
    >
      <ul className="flex items-center justify-around px-2 py-2">
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
                  /* Couleur active vs inactive */
                  isActive
                    ? "text-[#1A6B3A]"   /* Vert VIVRE */
                    : "text-gray-400 hover:text-gray-600",
                ].join(" ")}
              >
                {/* Fond vert pâle derrière l'icône active */}
                <span
                  className={[
                    "flex items-center justify-center w-10 h-6 rounded-full transition-colors duration-150",
                    isActive ? "bg-green-50" : "",
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
