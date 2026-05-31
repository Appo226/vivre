"use client";

/**
 * devenir-livreur/page.tsx — Candidature livreur VIVRE
 *
 * Permet à un utilisateur de postuler comme livreur (zémidjan, taxi ou les deux).
 * Le formulaire est en 3 étapes :
 *   1. Informations véhicule (type, plaque, permis)
 *   2. Documents (upload CNI, permis de conduire, carte grise)
 *   3. Coordonnées de versement (Orange Money ou Moov)
 *
 * Les documents sont uploadés sur Firebase Storage via POST /uploads
 * AVANT la soumission du formulaire principal. On récupère les URLs
 * et on les envoie dans POST /drivers/apply.
 *
 * Pourquoi 3 étapes ? Réduire l'abandon en ne présentant qu'une
 * partie du formulaire à la fois — le parcours perçu est plus court.
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { apiClient, ApiError } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface Documents {
  id_card_url?: string;
  license_url?: string;
  vehicle_reg_url?: string;
  selfie_url?: string;
}

/* ============================================================
 * CONSTANTES
 * ============================================================ */

const DRIVER_TYPES = [
  { value: "zemidjan", label: "Zémidjan (moto-taxi)", icon: "🛵", desc: "Moto — le plus courant au Burkina" },
  { value: "taxi",     label: "Taxi",                  icon: "🚕", desc: "Voiture — Ouagadougou et Bobo" },
  { value: "both",     label: "Les deux",              icon: "🏍️", desc: "Moto ET voiture selon les disponibilités" },
];

const REQUIRED_DOCS = [
  { key: "id_card_url",     label: "CNI ou Passeport",      desc: "Pièce d'identité nationale en cours de validité" },
  { key: "license_url",     label: "Permis de conduire",    desc: "Permis adapté à votre véhicule (A pour moto, B pour voiture)" },
  { key: "vehicle_reg_url", label: "Carte grise",           desc: "Document d'immatriculation de votre véhicule" },
  { key: "selfie_url",      label: "Selfie (optionnel)",    desc: "Photo de vous tenant votre CNI — renforce la confiance des clients" },
];

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function DevenirLivreurPage(): React.ReactElement {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  if (!accessToken) {
    router.push("/auth?redirect=/devenir-livreur");
    return <></>;
  }

  /* État du formulaire multi-étapes */
  const [step, setStep] = useState(1);

  /* Étape 1 : infos véhicule */
  const [cityId, setCityId] = useState("");
  const [driverType, setDriverType] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  /* Étape 2 : documents */
  const [documents, setDocuments] = useState<Documents>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  /* Étape 3 : versement */
  const [payoutMethod, setPayoutMethod] = useState("orange_money");
  const [payoutPhone, setPayoutPhone] = useState("");

  /* Soumission finale */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [citiesLoaded, setCitiesLoaded] = useState(false);

  /* Charger les villes à l'affichage de l'étape 1 */
  React.useEffect(() => {
    if (!citiesLoaded) {
      apiClient.get<{ cities: { id: string; name: string }[] }>("/cities")
        .then((res) => { setCities(res.cities); setCitiesLoaded(true); })
        .catch(() => {});
    }
  }, [citiesLoaded]);

  /**
   * Uploader un document vers Firebase Storage via l'API VIVRE.
   * Retourne l'URL publique du fichier uploadé.
   */
  async function handleDocumentUpload(key: string, file: File): Promise<void> {
    setUploadingKey(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "driver-docs");

      /* POST /uploads retourne { url } */
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/v1/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload échoué");
      const data = (await res.json()) as { url: string };
      setDocuments((prev) => ({ ...prev, [key]: data.url }));
    } catch {
      setSubmitError("Erreur lors de l'upload — vérifiez votre connexion.");
    } finally {
      setUploadingKey(null);
    }
  }

  /* Validation par étape */
  function canProceedStep1(): boolean {
    return Boolean(cityId && driverType && vehicleType.trim() && vehiclePlate.trim() && licenseNumber.trim());
  }

  function canProceedStep2(): boolean {
    return Boolean(documents.id_card_url && documents.license_url && documents.vehicle_reg_url);
  }

  function canSubmit(): boolean {
    return Boolean(payoutMethod && payoutPhone.trim().length >= 8);
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit()) return;

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await apiClient.post("/drivers/apply", {
        city_id: cityId,
        driver_type: driverType,
        vehicle_type: vehicleType.trim(),
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        license_number: licenseNumber.trim(),
        documents: {
          id_card_url: documents.id_card_url,
          license_url: documents.license_url,
          vehicle_reg_url: documents.vehicle_reg_url,
          ...(documents.selfie_url && { selfie_url: documents.selfie_url }),
        },
        payout_method: payoutMethod,
        payout_phone: payoutPhone.trim(),
      });

      router.push("/livreur?applied=1");
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Erreur réseau — vérifiez votre connexion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* En-tête */}
      <div className="bg-gradient-to-br from-[#1A1A2E] to-[#2d2d5e] px-4 pt-10 pb-8">
        <button onClick={() => (step > 1 ? setStep(step - 1) : router.back())} className="mb-4 text-white/60 text-sm">
          ← Retour
        </button>
        <h1 className="text-white font-bold text-2xl mb-1">Devenir livreur VIVRE</h1>
        <p className="text-white/70 text-sm mb-4">
          Livrez des repas, gagnez de l'argent — à votre rythme
        </p>

        {/* Indicateur d'étape */}
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                n <= step ? "bg-[#F5A623]" : "bg-white/20"
              }`}
            />
          ))}
        </div>
        <p className="text-white/50 text-xs mt-2">Étape {step} sur 3</p>
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* ── ÉTAPE 1 : Informations véhicule ── */}
        {step === 1 && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Votre véhicule</h2>

              {/* Type de chauffeur */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Type de prestation</p>
              <div className="space-y-2 mb-5">
                {DRIVER_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setDriverType(type.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      driverType === type.value
                        ? "border-[#F5A623] bg-[#F5A623]/5"
                        : "border-gray-200"
                    }`}
                  >
                    <span className="text-2xl">{type.icon}</span>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{type.label}</p>
                      <p className="text-xs text-gray-500">{type.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Ville */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Ville principale</label>
                <select
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
                >
                  <option value="">Choisissez votre ville...</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Type de véhicule */}
              <Field
                label="Type de véhicule"
                placeholder="Ex : Moto Honda CG 125, Toyota Corolla..."
                value={vehicleType}
                onChange={setVehicleType}
              />
              <Field
                label="Plaque d'immatriculation"
                placeholder="Ex : OUA-1234-A"
                value={vehiclePlate}
                onChange={(v) => setVehiclePlate(v.toUpperCase())}
              />
              <Field
                label="Numéro de permis de conduire"
                placeholder="Numéro figurant sur votre permis"
                value={licenseNumber}
                onChange={setLicenseNumber}
              />
            </div>

            {/* Avantages */}
            <div className="bg-[#F5A623]/10 rounded-2xl p-4">
              <p className="font-semibold text-amber-800 mb-2">💰 Combien gagnez-vous ?</p>
              <ul className="space-y-1 text-sm text-amber-700">
                <li>• 80% du frais de livraison sur chaque commande</li>
                <li>• Versements hebdomadaires via Orange Money ou Moov</li>
                <li>• Travaillez quand vous voulez — aucun engagement</li>
                <li>• Assurance accident incluse dès la 1ère livraison</li>
              </ul>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1()}
              className="w-full bg-[#1A1A2E] text-white font-bold py-4 rounded-2xl disabled:opacity-40"
            >
              Continuer →
            </button>
          </>
        )}

        {/* ── ÉTAPE 2 : Documents ── */}
        {step === 2 && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 text-lg mb-2">Pièces du dossier</h2>
              <p className="text-sm text-gray-500 mb-4">
                Ces documents sont vérifiés par notre équipe dans les 48h ouvrées.
                Vos données sont stockées de façon sécurisée et ne sont jamais partagées.
              </p>

              <div className="space-y-4">
                {REQUIRED_DOCS.map((doc) => {
                  const isUploaded = Boolean(documents[doc.key as keyof Documents]);
                  const isUploading = uploadingKey === doc.key;

                  return (
                    <div key={doc.key} className={`border-2 rounded-xl p-4 transition-all ${
                      isUploaded ? "border-green-400 bg-green-50" : "border-gray-200"
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 text-sm">
                            {isUploaded && "✓ "}{doc.label}
                            {doc.key === "selfie_url" && (
                              <span className="ml-1 text-xs text-gray-400 font-normal">(optionnel)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{doc.desc}</p>
                        </div>
                        <label className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isUploading ? "bg-gray-100 text-gray-400" : "bg-[#1A1A2E] text-white"
                        }`}>
                          {isUploading ? "Upload..." : isUploaded ? "Remplacer" : "Choisir"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleDocumentUpload(doc.key, file);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button
              onClick={() => { setSubmitError(""); setStep(3); }}
              disabled={!canProceedStep2() || uploadingKey !== null}
              className="w-full bg-[#1A1A2E] text-white font-bold py-4 rounded-2xl disabled:opacity-40"
            >
              Continuer →
            </button>
          </>
        )}

        {/* ── ÉTAPE 3 : Coordonnées de versement ── */}
        {step === 3 && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 text-lg mb-2">Recevoir vos gains</h2>
              <p className="text-sm text-gray-500 mb-4">
                Choisissez comment vous souhaitez recevoir vos versements.
                Vous pourrez modifier ces informations depuis votre tableau de bord.
              </p>

              {/* Méthode de paiement */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Méthode de versement</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { value: "orange_money", label: "Orange Money", icon: "🟠" },
                  { value: "moov",         label: "Moov Money",   icon: "🔵" },
                ].map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setPayoutMethod(m.value)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      payoutMethod === m.value ? "border-[#F5A623] bg-[#F5A623]/5" : "border-gray-200"
                    }`}
                  >
                    <p className="text-2xl mb-1">{m.icon}</p>
                    <p className="font-semibold text-sm text-gray-800">{m.label}</p>
                  </button>
                ))}
              </div>

              <Field
                label={`Numéro ${payoutMethod === "orange_money" ? "Orange Money" : "Moov Money"}`}
                placeholder="Ex : +226 70 00 00 00"
                value={payoutPhone}
                onChange={setPayoutPhone}
                type="tel"
              />
            </div>

            {/* Résumé avant soumission */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="font-bold text-gray-900 mb-3">Récapitulatif</p>
              <div className="space-y-2 text-sm">
                <SummaryRow label="Type" value={DRIVER_TYPES.find((t) => t.value === driverType)?.label ?? driverType} />
                <SummaryRow label="Véhicule" value={vehicleType} />
                <SummaryRow label="Plaque" value={vehiclePlate} />
                <SummaryRow label="Permis n°" value={licenseNumber} />
                <SummaryRow label="Documents" value={`${Object.values(documents).filter(Boolean).length} fichier(s) uploadé(s)`} />
                <SummaryRow label="Versement" value={`${payoutMethod === "orange_money" ? "Orange Money" : "Moov"} — ${payoutPhone}`} />
              </div>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit() || isSubmitting}
              className="w-full bg-[#F5A623] text-white font-bold py-4 rounded-2xl disabled:opacity-40 active:scale-[0.99] transition-all"
            >
              {isSubmitting ? "Envoi en cours..." : "Soumettre ma candidature"}
            </button>

            <p className="text-xs text-center text-gray-400">
              En soumettant, vous acceptez les Conditions d'utilisation VIVRE pour les livreurs
              et certifiez que les informations fournies sont exactes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * MINI-COMPOSANTS
 * ============================================================ */

function Field({
  label, placeholder, value, onChange, type = "text",
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string;
}): React.ReactElement {
  return (
    <div className="mb-4 last:mb-0">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20"
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800 text-right ml-4 max-w-[60%] truncate">{value}</span>
    </div>
  );
}
