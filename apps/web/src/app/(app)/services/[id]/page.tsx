/**
 * app/(app)/services/[id]/page.tsx — SP-003 : Détail d'un service public
 *
 * Affiche le détail complet d'un service public :
 * - Nom, adresse, catégorie
 * - Boutons d'appel direct (urgence et principal)
 * - Horaires d'ouverture
 * - Statut (ouvert/fermé/24h, pharmacie de garde)
 * - Lien Google Maps pour la navigation
 * - Modal de signalement d'erreur (SP-004)
 *
 * Cette page est "use client" car elle utilise :
 * - TanStack Query pour le data fetching
 * - Un modal de signalement (state React)
 * - L'API de géolocalisation pour "Itinéraire"
 */

"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";

/* ============================================================
 * TYPES
 * ============================================================ */

interface ServiceDetail {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone_primary: string | null;
  phone_emergency: string | null;
  is_open_now: boolean;
  is_on_duty: boolean;
  is_24h: boolean;
  on_duty_until: string | null;
  opening_hours: Record<string, string> | null;
  category: {
    id: string;
    slug: string;
    name_fr: string;
    name_en: string;
    icon: string;
    color_hex: string;
    is_emergency: boolean;
  };
  city: {
    id: string;
    name: string;
  } | null;
}

type CorrectionType = "wrong_address" | "wrong_phone" | "closed" | "wrong_hours" | "other";

interface CorrectionPayload {
  service_id: string;
  correction_type: CorrectionType;
  description: string;
}

/* ============================================================
 * FETCH
 * ============================================================ */

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/v1";

async function fetchService(id: string): Promise<ServiceDetail> {
  const res = await fetch(`${API_URL}/public-services/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("SERVICE_NOT_FOUND");
    throw new Error("Erreur chargement service");
  }
  const data = await res.json() as { service: ServiceDetail };
  return data.service;
}

async function submitCorrection(payload: CorrectionPayload): Promise<void> {
  const res = await fetch(`${API_URL}/service-corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
}

/* ============================================================
 * MODAL DE SIGNALEMENT (SP-004)
 * ============================================================ */

const CORRECTION_TYPES: { value: CorrectionType; label: string }[] = [
  { value: "wrong_address", label: "Adresse incorrecte" },
  { value: "wrong_phone", label: "Téléphone incorrect" },
  { value: "closed", label: "Établissement fermé définitivement" },
  { value: "wrong_hours", label: "Horaires incorrects" },
  { value: "other", label: "Autre problème" },
];

interface CorrectionModalProps {
  serviceId: string;
  onClose: () => void;
}

function CorrectionModal({ serviceId, onClose }: CorrectionModalProps): React.ReactElement {
  const [correctionType, setCorrectionType] = useState<CorrectionType>("wrong_address");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: submitCorrection,
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = useCallback((e: React.FormEvent): void => {
    e.preventDefault();
    if (description.trim().length < 5) return;
    mutation.mutate({ service_id: serviceId, correction_type: correctionType, description: description.trim() });
  }, [description, correctionType, mutation, serviceId]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-modal-title"
    >
      {/* Panel — bottom sheet */}
      <div
        className="w-full bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <h2 id="correction-modal-title" className="text-lg font-bold text-gray-900 mb-1">
          Signaler une erreur
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Votre signalement sera examiné par notre équipe. Merci de votre contribution !
        </p>

        {submitted ? (
          /* Confirmation */
          <div className="text-center py-6">
            <span className="text-5xl" aria-hidden="true">✅</span>
            <p className="text-base font-semibold text-gray-900 mt-4">Signalement envoyé !</p>
            <p className="text-sm text-gray-500 mt-1">Merci pour votre aide.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-3 bg-[#1A6B3A] text-white rounded-2xl font-medium"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type de correction */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">Type de problème</legend>
              <div className="space-y-2">
                {CORRECTION_TYPES.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="correction_type"
                      value={value}
                      checked={correctionType === value}
                      onChange={() => setCorrectionType(value)}
                      className="accent-[#1A6B3A] w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Description */}
            <div>
              <label htmlFor="correction-desc" className="text-sm font-medium text-gray-700 block mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="correction-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez le problème en détail (minimum 5 caractères)…"
                rows={4}
                maxLength={500}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1A6B3A] focus:border-transparent"
                required
                minLength={5}
              />
              <p className="text-xs text-gray-400 text-right mt-1">{description.length}/500</p>
            </div>

            {/* Erreur */}
            {mutation.isError && (
              <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
            )}

            {/* Boutons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl font-medium text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || description.trim().length < 5}
                className="flex-1 py-3 bg-[#1A6B3A] text-white rounded-2xl font-medium text-sm disabled:opacity-50"
              >
                {mutation.isPending ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */

const DAYS_FR: Record<string, string> = {
  monday: "Lundi", tuesday: "Mardi", wednesday: "Mercredi",
  thursday: "Jeudi", friday: "Vendredi", saturday: "Samedi", sunday: "Dimanche",
};

export default function ServiceDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showCorrection, setShowCorrection] = useState(false);

  const { data: service, isLoading, isError, error } = useQuery({
    queryKey: ["service", id],
    queryFn: () => fetchService(id),
    retry: (count, err) => (err as Error).message !== "SERVICE_NOT_FOUND" && count < 2,
  });

  /* ===== CHARGEMENT ===== */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 animate-pulse">
        <div className="h-56 bg-gray-200" />
        <div className="px-4 py-5 space-y-4">
          <div className="h-6 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-12 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  /* ===== ERREUR ===== */
  if (isError || !service) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <span className="text-5xl mb-4" aria-hidden="true">😕</span>
        <p className="text-lg font-semibold text-gray-900">Service introuvable</p>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          {(error as Error)?.message === "SERVICE_NOT_FOUND"
            ? "Ce service n'existe pas ou a été supprimé."
            : "Impossible de charger ce service. Vérifiez votre connexion."}
        </p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 bg-[#1A6B3A] text-white rounded-2xl font-medium text-sm"
        >
          Retour
        </button>
      </div>
    );
  }

  /* URLs Google Maps */
  const mapsUrl = `https://maps.google.com/?q=${service.latitude},${service.longitude}`;
  const directionsUrl = `https://maps.google.com/maps?daddr=${service.latitude},${service.longitude}`;

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* ===== HEADER AVEC COULEUR DE CATÉGORIE ===== */}
        <header
          className="px-4 pt-12 pb-6 text-white relative"
          style={{ backgroundColor: service.category.color_hex }}
        >
          {/* Bouton retour */}
          <button
            onClick={() => router.back()}
            aria-label="Retour"
            className="flex items-center gap-1 text-white/80 hover:text-white mb-4 text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd"/>
            </svg>
            Retour
          </button>

          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden="true">{service.category.icon}</span>
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wide">{service.category.name_fr}</p>
              <h1 className="text-xl font-bold font-sora leading-snug">{service.name}</h1>
              {service.city && (
                <p className="text-white/70 text-sm mt-0.5">{service.city.name}</p>
              )}
            </div>
          </div>

          {/* Badges statut */}
          <div className="flex gap-2 mt-3">
            {service.is_24h && (
              <span className="bg-white/20 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                24h/24
              </span>
            )}
            {service.is_on_duty && (
              <span className="bg-white/20 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                De garde
              </span>
            )}
            {!service.is_24h && (
              <span className={[
                "text-xs font-medium px-2.5 py-1 rounded-full",
                service.is_open_now
                  ? "bg-green-500 text-white"
                  : "bg-white/20 text-white",
              ].join(" ")}>
                {service.is_open_now ? "Ouvert maintenant" : "Fermé"}
              </span>
            )}
          </div>
        </header>

        <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">

          {/* ===== ADRESSE ===== */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Adresse</p>
            <p className="text-gray-900 text-sm">{service.address}</p>

            <div className="flex gap-2 mt-3">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.099 3.468-4.698 3.468-8.05a6.75 6.75 0 00-13.5 0c0 3.352 1.524 5.951 3.468 8.05a19.58 19.58 0 002.683 2.282 16.975 16.975 0 001.144.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
                </svg>
                Voir sur Maps
              </a>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1A6B3A] text-white rounded-xl text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/>
                </svg>
                Itinéraire
              </a>
            </div>
          </div>

          {/* ===== TÉLÉPHONES ===== */}
          {(service.phone_emergency || service.phone_primary) && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Contact</p>

              {service.phone_emergency && (
                <a
                  href={`tel:${service.phone_emergency}`}
                  className="flex items-center gap-3 py-2.5 px-3 bg-red-50 border border-red-100 rounded-xl mb-2"
                >
                  <span className="flex items-center justify-center w-8 h-8 bg-red-500 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                      <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd"/>
                    </svg>
                  </span>
                  <div>
                    <p className="text-xs text-red-400 font-medium">Urgence</p>
                    <p className="text-base font-bold text-red-600">{service.phone_emergency}</p>
                  </div>
                </a>
              )}

              {service.phone_primary && (
                <a
                  href={`tel:${service.phone_primary}`}
                  className="flex items-center gap-3 py-2.5 px-3 bg-gray-50 border border-gray-100 rounded-xl"
                >
                  <span className="flex items-center justify-center w-8 h-8 bg-gray-200 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-600">
                      <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd"/>
                    </svg>
                  </span>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Principal</p>
                    <p className="text-base font-semibold text-gray-900">{service.phone_primary}</p>
                  </div>
                </a>
              )}
            </div>
          )}

          {/* ===== HORAIRES ===== */}
          {service.opening_hours && Object.keys(service.opening_hours).length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Horaires</p>
              <div className="space-y-1.5">
                {Object.entries(service.opening_hours).map(([day, hours]) => (
                  <div key={day} className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">{DAYS_FR[day] ?? day}</span>
                    <span className="text-gray-900">{hours}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== SIGNALER UNE ERREUR ===== */}
          <button
            onClick={() => setShowCorrection(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-600 font-medium shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-orange-400">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
            </svg>
            Signaler une erreur
          </button>

        </div>
      </div>

      {/* Modal de correction (SP-004) */}
      {showCorrection && (
        <CorrectionModal
          serviceId={service.id}
          onClose={() => setShowCorrection(false)}
        />
      )}
    </>
  );
}
