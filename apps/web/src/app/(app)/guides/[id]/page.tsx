"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface GuideProfile {
  id: string;
  bio: string;
  languages: string[];
  specialties: string[];
  daily_rate_fcfa: number;
  half_day_rate_fcfa: number | null;
  is_ontb_certified: boolean;
  certification_number: string | null;
  rating_avg: number;
  experience_years: number | null;
  completed_trips: number;
  city: { id: string; name: string };
  user: { first_name: string | null; last_name: string | null; avatar_url: string | null; phone: string | null };
}

const SPECIALTY_LABELS: Record<string, string> = {
  culture:     "Culture & Histoire",
  nature:      "Nature & Randonnée",
  gastronomie: "Gastronomie",
  heritage:    "Patrimoine",
  urban:       "Découverte urbaine",
};

/* ============================================================
 * PAGE
 * ============================================================ */

export default function GuideProfilePage(): React.ReactElement {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();

  const [guide,   setGuide]   = useState<GuideProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  /* Booking form state */
  const today = new Date().toISOString().split("T")[0] as string;
  const [bookingDate,  setBookingDate]  = useState(today);
  const [bookingType,  setBookingType]  = useState<"full_day" | "half_day">("full_day");
  const [groupSize,    setGroupSize]    = useState(1);
  const [specialReq,   setSpecialReq]   = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [bookingDone,  setBookingDone]  = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    void apiClient
      .get<{ guide: GuideProfile }>(`/guides/${params.id}`)
      .then((r) => setGuide(r.guide))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleBook(): Promise<void> {
    if (!accessToken) { router.push("/auth"); return; }
    if (!guide) return;

    setSubmitting(true);
    setBookingError(null);
    try {
      await apiClient.post<{ booking_id: string; total_amount: number }>(`/guides/${guide.id}/book`, {
        booking_date:   bookingDate,
        booking_type:   bookingType,
        group_size:     groupSize,
        attraction_ids: [],
        ...(specialReq.trim() ? { special_requests: specialReq.trim() } : {}),
      });
      setBookingDone(true);
    } catch {
      setBookingError("Impossible de créer la réservation. Vérifiez la date et réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 pb-24">
        <div className="h-40 bg-gray-200 animate-pulse" />
        <div className="px-4 pt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-4xl">👤</p>
        <p className="text-gray-500 font-dm">Guide introuvable.</p>
        <button onClick={() => router.back()} className="text-green-700 font-jakarta text-sm font-semibold">
          Retour
        </button>
      </div>
    );
  }

  const name = [guide.user.first_name, guide.user.last_name].filter(Boolean).join(" ") || "Guide VIVRE";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const estimatedPrice = bookingType === "full_day"
    ? guide.daily_rate_fcfa
    : (guide.half_day_rate_fcfa ?? Math.round(guide.daily_rate_fcfa * 0.6));

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-32">
      {/* Header vert */}
      <div className="bg-[#1A6B3A] px-4 pt-safe-top pb-8">
        <div className="flex items-center gap-3 pt-4">
          <button onClick={() => router.back()} className="text-white/70 text-xl">‹</button>
          <p className="text-white font-sora font-bold">Profil du guide</p>
        </div>
      </div>

      {/* Carte identité flottante */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg p-5 flex gap-4 items-start">
          <div className="w-16 h-16 rounded-full bg-[#1A6B3A]/10 flex items-center justify-center flex-shrink-0 text-[#1A6B3A] font-jakarta font-bold text-xl">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-sora font-bold text-gray-900">{name}</h1>
              {guide.is_ontb_certified && (
                <span className="text-xs bg-blue-100 text-blue-700 font-jakarta font-bold px-2 py-0.5 rounded-full">
                  ONTB ✓
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 font-dm">📍 {guide.city.name}</p>
            {guide.rating_avg > 0 && (
              <p className="text-sm text-amber-500 font-dm">⭐ {guide.rating_avg.toFixed(1)}</p>
            )}

            {/* Stats */}
            <div className="flex gap-4 mt-3">
              {guide.experience_years && (
                <div className="text-center">
                  <p className="text-base font-sora font-bold text-gray-900">{guide.experience_years}</p>
                  <p className="text-[10px] text-gray-400 font-dm">ans exp.</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-base font-sora font-bold text-gray-900">{guide.completed_trips}</p>
                <p className="text-[10px] text-gray-400 font-dm">voyages</p>
              </div>
              <div className="text-center">
                <p className="text-base font-sora font-bold text-gray-900">{guide.languages.length}</p>
                <p className="text-[10px] text-gray-400 font-dm">langues</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-5">
        {/* Langues & spécialités */}
        <section>
          <h2 className="text-sm font-sora font-bold text-gray-900 mb-2">Langues</h2>
          <div className="flex flex-wrap gap-2">
            {guide.languages.map((lang) => (
              <span key={lang} className="text-xs bg-white border border-gray-200 text-gray-700 font-dm px-3 py-1.5 rounded-full">
                {lang}
              </span>
            ))}
          </div>
        </section>

        {guide.specialties.length > 0 && (
          <section>
            <h2 className="text-sm font-sora font-bold text-gray-900 mb-2">Spécialités</h2>
            <div className="flex flex-wrap gap-2">
              {guide.specialties.map((s) => (
                <span key={s} className="text-xs bg-green-50 border border-green-100 text-green-700 font-dm px-3 py-1.5 rounded-full">
                  {SPECIALTY_LABELS[s] ?? s}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Bio */}
        <section>
          <h2 className="text-sm font-sora font-bold text-gray-900 mb-2">À propos</h2>
          <p className="text-sm text-gray-600 font-dm leading-relaxed">{guide.bio}</p>
        </section>

        {/* Tarifs */}
        <section>
          <h2 className="text-sm font-sora font-bold text-gray-900 mb-3">Tarifs</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
              <p className="text-lg font-sora font-bold text-[#1A6B3A]">
                {guide.daily_rate_fcfa.toLocaleString("fr-FR")}
              </p>
              <p className="text-[10px] text-gray-400 font-dm">FCFA / jour</p>
            </div>
            {guide.half_day_rate_fcfa && (
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-lg font-sora font-bold text-amber-600">
                  {guide.half_day_rate_fcfa.toLocaleString("fr-FR")}
                </p>
                <p className="text-[10px] text-gray-400 font-dm">FCFA / demi-journée</p>
              </div>
            )}
          </div>
        </section>

        {/* Certification ONTB */}
        {guide.is_ontb_certified && guide.certification_number && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
            <span className="text-xl">🏅</span>
            <div>
              <p className="text-sm font-jakarta font-semibold text-blue-800">Guide certifié ONTB</p>
              <p className="text-xs text-blue-600 font-dm mt-0.5">
                N° {guide.certification_number} — Office National du Tourisme du Burkina
              </p>
            </div>
          </div>
        )}

        {/* === FORMULAIRE RÉSERVATION === */}
        {bookingDone ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-sora font-bold text-green-800">Demande envoyée !</p>
            <p className="text-sm text-green-600 font-dm mt-1">
              Le guide vous contactera pour confirmer votre visite.
            </p>
            <button
              onClick={() => router.push("/guides")}
              className="mt-4 text-green-700 font-jakarta font-semibold text-sm underline"
            >
              Retour aux guides
            </button>
          </div>
        ) : (
          <section>
            <h2 className="text-sm font-sora font-bold text-gray-900 mb-3">Réserver ce guide</h2>
            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
              {/* Date */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={bookingDate}
                  min={today}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1A6B3A]"
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Durée</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["full_day", "half_day"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBookingType(t)}
                      className={[
                        "py-2.5 rounded-xl text-sm font-jakarta font-semibold border transition-colors",
                        bookingType === t
                          ? "bg-[#1A6B3A] text-white border-[#1A6B3A]"
                          : "bg-white text-gray-700 border-gray-200",
                      ].join(" ")}
                    >
                      {t === "full_day" ? "Journée" : "Demi-journée"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Groupe */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Taille du groupe
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setGroupSize((s) => Math.max(1, s - 1))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 text-xl font-bold flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-lg font-sora font-bold text-gray-900 w-8 text-center">
                    {groupSize}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGroupSize((s) => Math.min(50, s + 1))}
                    className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 text-xl font-bold flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Demandes spéciales */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Demandes spéciales (optionnel)
                </label>
                <textarea
                  rows={3}
                  value={specialReq}
                  onChange={(e) => setSpecialReq(e.target.value)}
                  placeholder="Sites particuliers à visiter, langue préférée..."
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1A6B3A] resize-none"
                />
              </div>

              {bookingError && (
                <p className="text-xs text-red-600 font-dm bg-red-50 rounded-lg px-3 py-2">
                  {bookingError}
                </p>
              )}

              {/* Prix estimé */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-sm text-gray-600 font-dm">Prix estimé</span>
                <span className="text-base font-sora font-bold text-[#1A6B3A]">
                  {estimatedPrice.toLocaleString("fr-FR")} FCFA
                </span>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* CTA sticky */}
      {!bookingDone && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 px-4 py-3 pb-safe-bottom">
          <button
            onClick={() => void handleBook()}
            disabled={submitting}
            className="w-full bg-[#1A6B3A] text-white font-jakarta font-bold py-4 rounded-2xl text-sm disabled:opacity-50 transition-opacity active:scale-[0.98]"
          >
            {submitting ? "Envoi en cours…" : `Réserver — ${estimatedPrice.toLocaleString("fr-FR")} FCFA`}
          </button>
        </div>
      )}
    </div>
  );
}
