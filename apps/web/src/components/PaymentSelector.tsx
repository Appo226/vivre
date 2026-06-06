"use client";

/**
 * PaymentSelector — Uber-style payment method picker for VIVRE
 *
 * Renders a clean vertical list: logo + name + subtitle + radio.
 * Handles mobile money (Orange, Moov, Telecel, Wave) + credit/debit card.
 * The selected method shows a green radio dot and highlighted row.
 */

import React from "react";

/* ── Brand SVG logos ──────────────────────────────────────────────────── */

function OMLogo(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Orange Money">
      {/* Orange gradient circle */}
      <circle cx="20" cy="20" r="20" fill="#FF6600" />
      {/* Inner white ring */}
      <circle cx="20" cy="20" r="14" fill="none" stroke="white" strokeWidth="1.5" opacity="0.4" />
      {/* OM text */}
      <text x="20" y="17" textAnchor="middle" fill="white" fontSize="8" fontWeight="900"
        fontFamily="Arial,sans-serif" letterSpacing="0.5">OM</text>
      {/* "Money" sub-text */}
      <text x="20" y="26" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="500"
        fontFamily="Arial,sans-serif" letterSpacing="1" opacity="0.9">MONEY</text>
      {/* Orange dot accent */}
      <circle cx="20" cy="32" r="2.5" fill="white" opacity="0.7" />
    </svg>
  );
}

function MoovLogo(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Moov Money">
      {/* Dark blue rounded rect */}
      <rect width="40" height="40" rx="10" fill="#003DA6" />
      {/* Wave arc above text */}
      <path d="M10 17 Q15 12 20 17 Q25 22 30 17" stroke="white" strokeWidth="2"
        fill="none" strokeLinecap="round" opacity="0.7" />
      {/* moov text */}
      <text x="20" y="27" textAnchor="middle" fill="white" fontSize="10" fontWeight="900"
        fontFamily="Arial,sans-serif" letterSpacing="-0.5">moov</text>
      {/* money sub */}
      <text x="20" y="35" textAnchor="middle" fill="white" fontSize="5" fontWeight="400"
        fontFamily="Arial,sans-serif" letterSpacing="2" opacity="0.8">MONEY</text>
    </svg>
  );
}

function TelecelLogo(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Telecel Money">
      {/* Red circle */}
      <circle cx="20" cy="20" r="20" fill="#E30613" />
      {/* Star burst (4 diagonal lines around center-left) */}
      {[0, 45, 90, 135].map((deg) => (
        <line key={deg}
          x1={11 + 4 * Math.cos((deg * Math.PI) / 180)}
          y1={15 + 4 * Math.sin((deg * Math.PI) / 180)}
          x2={11 - 4 * Math.cos((deg * Math.PI) / 180)}
          y2={15 - 4 * Math.sin((deg * Math.PI) / 180)}
          stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      ))}
      {/* T glyph */}
      <text x="23" y="25" textAnchor="middle" fill="white" fontSize="18" fontWeight="900"
        fontFamily="Arial,sans-serif">T</text>
      {/* money */}
      <text x="20" y="35" textAnchor="middle" fill="white" fontSize="4.5" fontWeight="500"
        fontFamily="Arial,sans-serif" letterSpacing="1.5" opacity="0.9">MONEY</text>
    </svg>
  );
}

function WaveLogo(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Wave">
      {/* Teal circle */}
      <circle cx="20" cy="20" r="20" fill="#1BBCDB" />
      {/* Wave swoosh */}
      <path d="M8 22 Q14 14 20 20 Q26 26 32 18" stroke="white" strokeWidth="3"
        fill="none" strokeLinecap="round" />
      {/* W glyph */}
      <text x="20" y="34" textAnchor="middle" fill="white" fontSize="9" fontWeight="900"
        fontFamily="Arial,sans-serif" letterSpacing="1">WAVE</text>
    </svg>
  );
}

function CardLogo(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Carte bancaire">
      {/* Dark card bg */}
      <rect width="40" height="40" rx="8" fill="#1A1A2E" />
      {/* Card outline */}
      <rect x="6" y="10" width="28" height="20" rx="3" stroke="rgba(255,255,255,0.3)"
        strokeWidth="1" fill="rgba(255,255,255,0.06)" />
      {/* Magnetic stripe */}
      <rect x="6" y="14" width="28" height="5" fill="rgba(255,255,255,0.15)" />
      {/* Gold chip */}
      <rect x="10" y="22" width="7" height="5" rx="1.5" fill="#F5A623" opacity="0.9" />
      {/* Visa-style dots */}
      <circle cx="27" cy="24.5" r="3.5" fill="#EB001B" opacity="0.8" />
      <circle cx="31" cy="24.5" r="3.5" fill="#F79E1B" opacity="0.8" />
    </svg>
  );
}

/* ── Payment method definitions ───────────────────────────────────────── */

export interface PaymentMethod {
  key: string;
  label: string;
  subtitle: string;
  Logo: () => React.ReactElement;
  type: "mobile" | "card" | "wallet";
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    key: "orange_money",
    label: "Orange Money",
    subtitle: "Paiement instantané — Orange BF",
    Logo: OMLogo,
    type: "mobile",
  },
  {
    key: "moov",
    label: "Moov Money",
    subtitle: "Paiement instantané — Moov Africa",
    Logo: MoovLogo,
    type: "mobile",
  },
  {
    key: "telecel_money",
    label: "Telecel Money",
    subtitle: "Paiement instantané — Telecel BF",
    Logo: TelecelLogo,
    type: "mobile",
  },
  {
    key: "wave",
    label: "Wave",
    subtitle: "Paiement instantané — Wave",
    Logo: WaveLogo,
    type: "mobile",
  },
  {
    key: "card",
    label: "Carte bancaire",
    subtitle: "Visa · Mastercard — paiement sécurisé",
    Logo: CardLogo,
    type: "card",
  },
];

/* ── Selector component ───────────────────────────────────────────────── */

interface PaymentSelectorProps {
  selected: string;
  onChange: (key: string) => void;
  /** Show wallet option with current balance */
  walletBalance?: number | null;
  /** Hide specific method keys */
  exclude?: string[];
}

export default function PaymentSelector({
  selected,
  onChange,
  walletBalance,
  exclude = [],
}: PaymentSelectorProps): React.ReactElement {

  const methods: PaymentMethod[] = [
    /* Wallet first if balance available */
    ...(walletBalance != null && walletBalance > 0
      ? [{
          key: "wallet",
          label: "Portefeuille VIVRE",
          subtitle: `Solde : ${walletBalance.toLocaleString("fr-FR")} FCFA`,
          Logo: () => (
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="#1A6B3A" />
              <text x="20" y="26" textAnchor="middle" fill="white" fontSize="18">💰</text>
            </svg>
          ),
          type: "wallet" as const,
        }]
      : []),
    ...PAYMENT_METHODS.filter((m) => !exclude.includes(m.key)),
  ];

  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white shadow-card">
      {methods.map((method, idx) => {
        const isSelected = selected === method.key;
        return (
          <button
            key={method.key}
            type="button"
            onClick={() => onChange(method.key)}
            className={[
              "w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors",
              idx > 0 ? "border-t border-gray-50" : "",
              isSelected ? "bg-green-50" : "bg-white hover:bg-gray-50 active:bg-gray-100",
            ].join(" ")}
          >
            {/* Logo */}
            <div className="flex-shrink-0">
              <method.Logo />
            </div>

            {/* Label + subtitle */}
            <div className="flex-1 min-w-0">
              <p className={[
                "text-sm font-semibold font-jakarta leading-tight",
                isSelected ? "text-green-800" : "text-gray-900",
              ].join(" ")}>
                {method.label}
              </p>
              <p className="text-xs text-gray-400 font-dm mt-0.5 truncate">
                {method.subtitle}
              </p>
            </div>

            {/* Radio indicator */}
            <div className="flex-shrink-0">
              {isSelected ? (
                <div className="w-5 h-5 rounded-full border-2 border-green-600 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
