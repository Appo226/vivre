/**
 * components/PaymentLogos.tsx — Logos des méthodes de paiement VIVRE
 *
 * Exporte des composants SVG pour chaque méthode de paiement acceptée
 * sur la plateforme VIVRE : Orange Money, Moov Money, Telecel Money, Carte bancaire.
 */

import React from "react";

interface LogoProps {
  size?: number;
}

/** Orange Money — cercle orange (#FF6600), texte "OM" blanc en gras, arc de vague en bas */
export function OrangeMoneyLogo({ size = 40 }: LogoProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Orange Money"
    >
      <circle cx="20" cy="20" r="20" fill="#FF6600" />
      {/* Arc / vague Orange en bas du cercle */}
      <path
        d="M8 30 Q14 25 20 28 Q26 31 32 26"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="bold"
        fontFamily="Arial,sans-serif"
      >
        OM
      </text>
    </svg>
  );
}

/** Moov Money — rectangle bleu foncé arrondi (#003DA6), "moov" minuscule + "money" en dessous */
export function MoovMoneyLogo({ size = 40 }: LogoProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Moov Money"
    >
      <rect width="40" height="40" rx="9" fill="#003DA6" />
      {/* Petite vague / checkmark au-dessus de "moov" */}
      <path
        d="M14 15 Q17 12 20 15 Q23 18 26 15"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="25"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="bold"
        fontFamily="Arial,sans-serif"
        letterSpacing="0.5"
      >
        moov
      </text>
      <text
        x="20"
        y="33"
        textAnchor="middle"
        fill="rgba(255,255,255,0.75)"
        fontSize="6.5"
        fontFamily="Arial,sans-serif"
        letterSpacing="1"
      >
        money
      </text>
    </svg>
  );
}

/** Telecel Money — cercle rouge (#E30613), "T" blanc en gras, petite étoile à gauche */
export function TelecelMoneyLogo({ size = 40 }: LogoProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Telecel Money"
    >
      <circle cx="20" cy="20" r="20" fill="#E30613" />
      {/* Petite étoile à burst à gauche du T */}
      <g transform="translate(9, 12)" opacity="0.85">
        <line x1="3" y1="0" x2="3" y2="6" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="0" y1="3" x2="6" y2="3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="0.8" y1="0.8" x2="5.2" y2="5.2" stroke="white" strokeWidth="1" strokeLinecap="round" />
        <line x1="5.2" y1="0.8" x2="0.8" y2="5.2" stroke="white" strokeWidth="1" strokeLinecap="round" />
      </g>
      <text
        x="22"
        y="27"
        textAnchor="middle"
        fill="white"
        fontSize="19"
        fontWeight="bold"
        fontFamily="Arial,sans-serif"
      >
        T
      </text>
    </svg>
  );
}

/** Carte bancaire — rect gris (#374151), bande de puce en haut, texte "CARTE" */
export function CardLogo({ size = 40 }: LogoProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Carte bancaire"
    >
      <rect width="40" height="40" rx="7" fill="#374151" />
      {/* Silhouette d'une carte bancaire */}
      <rect x="7" y="10" width="26" height="17" rx="2.5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.75" />
      {/* Bande magnétique / puce en haut */}
      <rect x="7" y="13" width="26" height="4" fill="rgba(255,255,255,0.22)" />
      {/* Puce dorée */}
      <rect x="10" y="19" width="6" height="4.5" rx="1" fill="#F5A623" opacity="0.85" />
      <text
        x="20"
        y="34"
        textAnchor="middle"
        fill="rgba(255,255,255,0.85)"
        fontSize="6"
        fontFamily="Arial,sans-serif"
        letterSpacing="1.5"
        fontWeight="bold"
      >
        CARTE
      </text>
    </svg>
  );
}

/** Wave Money — cercle bleu turquoise (#1BBCDB), W blanc stylisé */
export function WaveLogo({ size = 40 }: LogoProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Wave">
      <circle cx="20" cy="20" r="20" fill="#1BBCDB" />
      <text x="20" y="27" textAnchor="middle" fill="white" fontSize="18" fontWeight="900" fontFamily="Arial,sans-serif">W</text>
    </svg>
  );
}

/** Liste centralisée des méthodes de paiement VIVRE */
export const PAYMENT_METHODS = [
  { key: "orange_money",  label: "Orange Money",   Logo: OrangeMoneyLogo },
  { key: "moov",          label: "Moov Money",     Logo: MoovMoneyLogo },
  { key: "telecel_money", label: "Telecel Money",  Logo: TelecelMoneyLogo },
  { key: "wave",          label: "Wave",           Logo: WaveLogo },
  { key: "card",          label: "Carte bancaire", Logo: CardLogo },
] as const;
