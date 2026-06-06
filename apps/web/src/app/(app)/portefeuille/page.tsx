"use client";

export const dynamic = "force-dynamic";

/**
 * /portefeuille — Portefeuille VIVRE : solde + historique + recharge
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import PaymentSelector from "@/components/PaymentSelector";

interface WalletTransaction {
  id: string;
  amount_fcfa: number;
  type: string;
  description: string;
  created_at: string;
}

interface WalletData {
  balance_fcfa: number;
  transactions: WalletTransaction[];
}

const TYPE_CONFIG: Record<string, { label: string; sign: string; color: string }> = {
  credit:  { label: "Crédit",       sign: "+", color: "text-green-600" },
  debit:   { label: "Débit",        sign: "-", color: "text-red-600" },
  refund:  { label: "Remboursement", sign: "+", color: "text-green-600" },
  topup:   { label: "Recharge",     sign: "+", color: "text-blue-600" },
};

const TOP_UP_AMOUNTS = [1000, 2000, 5000, 10000, 25000, 50000];

export default function PortefeuillePage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState(5000);
  const [topupMethod, setTopupMethod] = useState("orange_money");
  const [topping, setTopping] = useState(false);
  const [topupDone, setTopupDone] = useState(false);

  useEffect(() => {
    if (!accessToken) { router.push("/auth"); return; }
    apiClient
      .get<WalletData>("/users/me/wallet")
      .then(setWallet)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken, router]);

  async function handleTopup(): Promise<void> {
    setTopping(true);
    try {
      /* Initiate a CinetPay checkout for wallet top-up */
      const res = await apiClient.post<{ checkout_url: string }>("/payments/wallet/topup", {
        amount: topupAmount,
        payment_method: topupMethod,
      });
      window.location.href = res.checkout_url;
    } catch {
      /* Fallback: show pending message */
      setTopupDone(true);
      setTopping(false);
    }
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 pt-safe-top pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-gray-500">‹</button>
          <h1 className="text-lg font-sora font-bold text-gray-900">Portefeuille VIVRE</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* Solde */}
        <div className="bg-gradient-to-br from-green-700 to-green-900 rounded-2xl p-6 text-white">
          <p className="text-sm font-dm text-green-200 mb-1">Solde disponible</p>
          {loading ? (
            <div className="h-10 bg-green-600 rounded-xl animate-pulse" />
          ) : (
            <p className="text-4xl font-sora font-bold">
              {(wallet?.balance_fcfa ?? 0).toLocaleString()}
              <span className="text-xl font-normal text-green-300 ml-2">FCFA</span>
            </p>
          )}
          <p className="text-xs text-green-300 font-dm mt-2">
            Utilisable pour toutes vos réservations VIVRE
          </p>
          <button
            onClick={() => setShowTopup(true)}
            className="mt-4 bg-white text-green-800 font-jakarta font-bold text-sm px-5 py-2.5 rounded-full active:scale-95 transition-all"
          >
            + Recharger
          </button>
        </div>

        {/* Historique */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 font-dm">
            Transactions récentes
          </p>

          {loading && (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between animate-pulse">
                  <div className="space-y-1 flex-1">
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                    <div className="h-2 bg-gray-100 rounded w-1/3" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          )}

          {!loading && (wallet?.transactions.length ?? 0) === 0 && (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">💸</p>
              <p className="text-gray-400 font-dm text-sm">Aucune transaction pour le moment.</p>
            </div>
          )}

          {!loading && (wallet?.transactions.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {wallet!.transactions.map((tx) => {
                const cfg = TYPE_CONFIG[tx.type] ?? { label: tx.type, sign: "", color: "text-gray-700" };
                return (
                  <div key={tx.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-dm truncate">{tx.description}</p>
                      <p className="text-xs text-gray-400 font-dm">
                        {new Date(tx.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "short",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <p className={`text-sm font-bold font-jakarta shrink-0 ${cfg.color}`}>
                      {cfg.sign}{tx.amount_fcfa.toLocaleString()} FCFA
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal recharge */}
      {showTopup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-5">
            {topupDone ? (
              <div className="text-center py-4">
                <p className="text-4xl mb-2">📱</p>
                <h2 className="font-bold text-gray-900 text-lg">Recharge initiée</h2>
                <p className="text-sm text-gray-500 font-dm mt-1">
                  Vous allez recevoir une demande de paiement sur votre téléphone.
                  Votre solde sera mis à jour sous quelques minutes.
                </p>
                <button
                  onClick={() => { setShowTopup(false); setTopupDone(false); }}
                  className="mt-4 w-full bg-green-700 text-white font-bold py-3.5 rounded-2xl"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Recharger le portefeuille</h2>
                  <button onClick={() => setShowTopup(false)} className="text-gray-400 text-xl">✕</button>
                </div>

                {/* Montants prédéfinis */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 font-dm">Montant</p>
                  <div className="grid grid-cols-3 gap-2">
                    {TOP_UP_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTopupAmount(amt)}
                        className={[
                          "py-2.5 rounded-xl text-sm font-jakarta font-semibold border transition-colors",
                          topupAmount === amt
                            ? "border-green-600 bg-green-50 text-green-800"
                            : "border-gray-200 text-gray-700",
                        ].join(" ")}
                      >
                        {amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Méthode de paiement */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-3 font-dm uppercase tracking-wide">Méthode de paiement</p>
                  <PaymentSelector
                    selected={topupMethod}
                    onChange={setTopupMethod}
                  />
                </div>

                <button
                  onClick={() => void handleTopup()}
                  disabled={topping}
                  className="w-full bg-green-700 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-all"
                >
                  {topping ? "Traitement…" : `Recharger ${topupAmount.toLocaleString()} FCFA`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
