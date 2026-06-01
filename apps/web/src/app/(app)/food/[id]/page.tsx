"use client";

export const dynamic = "force-dynamic";

/**
 * food/[id]/page.tsx — FD_002 : Détail d'un restaurant + menu
 *
 * Affiche :
 *   - Infos restaurant (type, horaires, livraison, commande min)
 *   - Menu organisé par catégories avec une navbar collante pour naviguer entre sections
 *   - Bouton d'ajout au panier sur chaque plat
 *   - Bulle de panier flottante (même store que la page liste)
 *
 * L'ajout au panier depuis un restaurant différent avertit l'utilisateur
 * qu'il va vider le panier actuel avant de confirmer.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore, type CartRestaurant } from "@/store/cart.store";

/* ============================================================
 * TYPES
 * ============================================================ */

interface MenuItemData {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  prep_minutes: number | null;
}

interface MenuCategoryData {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItemData[];
}

interface RestaurantDetail {
  id: string;
  name: string;
  restaurant_type: string;
  description: string | null;
  address: string;
  phone: string;
  opening_hours: Record<string, string>;
  delivery_radius_km: number;
  min_order_fcfa: number;
  avg_prep_minutes: number;
  offers_delivery: boolean;
  offers_pickup: boolean;
  is_open_now: boolean;
  rating_avg: number;
  city: { name: string };
  menu_categories: MenuCategoryData[];
}

interface Review {
  id:          string;
  rating:      number;
  title:       string | null;
  comment:     string | null;
  is_verified: boolean;
  author:      string;
  created_at:  string;
}

interface Eligibility {
  can_review:       boolean;
  already_reviewed: boolean;
  booking_ref_id?:  string;
}

const OPENING_DAYS: Record<string, string> = {
  mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu",
  fri: "Ven", sat: "Sam", sun: "Dim",
};

const RESTAURANT_TYPE_LABELS: Record<string, string> = {
  restaurant: "Restaurant", maquis: "Maquis", fastfood: "Fast food",
  bakery: "Boulangerie", street_food: "Street food",
};

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function RestaurantDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const router    = useRouter();
  const cartStore = useCartStore();
  const { accessToken } = useAuthStore();

  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [showHoursModal, setShowHoursModal]     = useState(false);
  const [pendingItem, setPendingItem]           = useState<{ item: MenuItemData; qty: number } | null>(null);
  const [showCartConflict, setShowCartConflict] = useState(false);

  /* --- Avis --- */
  const [reviews, setReviews]           = useState<Review[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [eligibility, setEligibility]   = useState<Eligibility | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  /* Références des sections de catégorie pour le scroll spy */
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const navRef      = useRef<HTMLDivElement | null>(null);

  const loadReviews = useCallback(() => {
    apiClient
      .get<{ reviews: Review[]; total: number }>(
        `/reviews?entity_type=restaurant&entity_id=${params.id}`
      )
      .then((res) => { setReviews(res.reviews); setReviewsTotal(res.total); })
      .catch(() => { /* ignore */ });
  }, [params.id]);

  useEffect(() => {
    apiClient
      .get<RestaurantDetail>(`/restaurants/${params.id}`)
      .then((res) => {
        setRestaurant(res);
        if (res.menu_categories.length > 0) {
          setActiveCategoryId(res.menu_categories[0]!.id);
        }
      })
      .catch(() => setRestaurant(null))
      .finally(() => setIsLoading(false));

    loadReviews();
  }, [params.id, loadReviews]);

  /* Vérifier l'éligibilité à noter quand l'utilisateur est connecté */
  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .get<Eligibility>(`/reviews/eligibility?entity_type=restaurant&entity_id=${params.id}`)
      .then((res) => setEligibility(res))
      .catch(() => { /* ignore */ });
  }, [params.id, accessToken]);

  /**
   * Scroll spy : met à jour la catégorie active en fonction du scroll.
   */
  useEffect(() => {
    const handleScroll = (): void => {
      const navHeight = navRef.current?.offsetHeight ?? 60;
      for (const [catId, ref] of Object.entries(sectionRefs.current)) {
        if (!ref) continue;
        const rect = ref.getBoundingClientRect();
        if (rect.top <= navHeight + 20) {
          setActiveCategoryId(catId);
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToCategory(categoryId: string): void {
    const ref = sectionRefs.current[categoryId];
    if (!ref) return;
    const navHeight = navRef.current?.offsetHeight ?? 60;
    const top = ref.getBoundingClientRect().top + window.scrollY - navHeight - 60;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveCategoryId(categoryId);
  }

  /**
   * Ajouter un plat au panier.
   * Si l'article vient d'un restaurant différent, demander confirmation.
   */
  function handleAddToCart(item: MenuItemData, quantity: number): void {
    if (!restaurant) return;

    /* Conflit de restaurant — demander confirmation */
    if (cartStore.restaurant && cartStore.restaurant.id !== restaurant.id) {
      setPendingItem({ item, qty: quantity });
      setShowCartConflict(true);
      return;
    }

    addItemToCart(item, quantity);
  }

  function addItemToCart(item: MenuItemData, quantity: number): void {
    if (!restaurant) return;

    const cartRestaurant: CartRestaurant = {
      id: restaurant.id,
      name: restaurant.name,
      min_order_fcfa: restaurant.min_order_fcfa,
      avg_prep_minutes: restaurant.avg_prep_minutes,
      offers_delivery: restaurant.offers_delivery,
      offers_pickup: restaurant.offers_pickup,
      city_name: restaurant.city.name,
    };

    cartStore.addItem(cartRestaurant, {
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
    }, quantity);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#EF2B2D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="font-semibold text-gray-800">Restaurant introuvable</p>
          <button onClick={() => router.back()} className="mt-4 text-[#EF2B2D] font-semibold">
            Retour
          </button>
        </div>
      </div>
    );
  }

  const cartTotal = cartStore.totalItems();
  const cartSubtotal = cartStore.subtotal();

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* En-tête */}
      <div className="bg-white sticky top-0 z-30 border-b border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{restaurant.name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`w-2 h-2 rounded-full ${restaurant.is_open_now ? "bg-green-500" : "bg-red-400"}`} />
            <span>{restaurant.is_open_now ? "Ouvert" : "Fermé"}</span>
            <span>·</span>
            <span>⏱ {restaurant.avg_prep_minutes} min</span>
          </div>
        </div>
      </div>

      {/* Infos restaurant */}
      <div className="bg-white px-4 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="font-bold text-xl text-gray-900">{restaurant.name}</h1>
            <p className="text-sm text-gray-500">
              {RESTAURANT_TYPE_LABELS[restaurant.restaurant_type] ?? restaurant.restaurant_type}
              {" · "}{restaurant.city.name}
            </p>
          </div>
          {restaurant.rating_avg > 0 && (
            <span className="bg-[#1A6B3A]/10 text-[#1A6B3A] font-bold text-sm px-3 py-1 rounded-xl">
              ★ {restaurant.rating_avg.toFixed(1)}
            </span>
          )}
        </div>

        {restaurant.description && (
          <p className="text-sm text-gray-600 mb-3">{restaurant.description}</p>
        )}

        {/* Services + infos clés */}
        <div className="flex flex-wrap gap-2 mb-3">
          {restaurant.offers_delivery && (
            <span className="bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full">
              🛵 Livraison disponible
            </span>
          )}
          {restaurant.offers_pickup && (
            <span className="bg-amber-50 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-full">
              🏃 À emporter
            </span>
          )}
          {restaurant.min_order_fcfa > 0 && (
            <span className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full">
              Min {formatFCFA(restaurant.min_order_fcfa)}
            </span>
          )}
        </div>

        {/* Horaires */}
        <button
          onClick={() => setShowHoursModal(true)}
          className="text-xs text-[#EF2B2D] font-semibold"
        >
          Voir les horaires →
        </button>
      </div>

      {/* Navbar catégories — sticky sous l'en-tête */}
      <div
        ref={navRef}
        className="sticky top-[61px] z-20 bg-white border-b border-gray-100 overflow-x-auto"
      >
        <div className="flex gap-0 px-4">
          {restaurant.menu_categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                activeCategoryId === cat.id
                  ? "border-[#EF2B2D] text-[#EF2B2D]"
                  : "border-transparent text-gray-500"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu par catégories */}
      <div className="px-4 py-4 space-y-8">
        {restaurant.menu_categories.map((category) => (
          <div
            key={category.id}
            ref={(el) => { sectionRefs.current[category.id] = el; }}
          >
            <h2 className="font-bold text-gray-900 text-lg mb-3">{category.name}</h2>
            <div className="space-y-3">
              {category.items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  cartQuantity={
                    cartStore.restaurant?.id === restaurant.id
                      ? (cartStore.items.find((i) => i.menu_item_id === item.id)?.quantity ?? 0)
                      : 0
                  }
                  onAdd={(qty) => handleAddToCart(item, qty)}
                  onRemove={() => cartStore.updateQuantity(item.id, (cartStore.items.find((i) => i.menu_item_id === item.id)?.quantity ?? 1) - 1)}
                />
              ))}
            </div>
          </div>
        ))}

        {restaurant.menu_categories.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-gray-500">Ce restaurant n'a pas encore de menu en ligne.</p>
          </div>
        )}

        {/* Section avis */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-lg">
              Avis{reviewsTotal > 0 ? ` (${reviewsTotal})` : ""}
            </h2>
            {eligibility?.can_review && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="text-sm font-semibold text-[#EF2B2D]"
              >
                + Laisser un avis
              </button>
            )}
            {eligibility?.already_reviewed && (
              <span className="text-xs text-gray-400 font-medium">Vous avez déjà noté ce restaurant</span>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
              <p className="text-gray-400 text-sm">Aucun avis pour le moment</p>
              {eligibility?.can_review && (
                <button
                  onClick={() => setShowReviewModal(true)}
                  className="mt-2 text-sm font-semibold text-[#EF2B2D]"
                >
                  Soyez le premier à noter !
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.slice(0, 5).map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
              {reviewsTotal > 5 && (
                <p className="text-center text-xs text-gray-400 pt-1">
                  + {reviewsTotal - 5} avis supplémentaire{reviewsTotal - 5 > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bulle panier */}
      {cartTotal > 0 && cartStore.restaurant?.id === restaurant.id && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-30">
          <button
            onClick={() => router.push("/food/panier")}
            className="w-full bg-[#EF2B2D] text-white font-bold py-4 rounded-2xl shadow-2xl flex items-center justify-between px-5 active:scale-[0.99] transition-all"
          >
            <span className="bg-white/20 rounded-xl px-3 py-1 text-sm font-bold">
              {cartTotal} article{cartTotal > 1 ? "s" : ""}
            </span>
            <span>Voir le panier →</span>
            <span>{formatFCFA(cartSubtotal)}</span>
          </button>
        </div>
      )}

      {/* Modal horaires */}
      {showHoursModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setShowHoursModal(false)}>
          <div className="bg-white w-full rounded-t-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Horaires d'ouverture</h3>
            <div className="space-y-2">
              {Object.entries(OPENING_DAYS).map(([key, label]) => {
                const hours = restaurant.opening_hours[key];
                return (
                  <div key={key} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                    <span className={`text-sm font-semibold ${hours === "closed" || !hours ? "text-red-400" : "text-gray-900"}`}>
                      {hours === "closed" || !hours ? "Fermé" : hours}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setShowHoursModal(false)}
              className="w-full mt-5 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Modal conflit de panier */}
      {showCartConflict && pendingItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <p className="text-xl mb-2">🛒</p>
            <h3 className="font-bold text-lg text-gray-900 mb-2">Vider le panier ?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Votre panier contient des articles de{" "}
              <strong>{cartStore.restaurant?.name}</strong>. Ajouter cet article
              vidra votre panier actuel.
            </p>
            <button
              onClick={() => {
                cartStore.clearCart();
                addItemToCart(pendingItem.item, pendingItem.qty);
                setPendingItem(null);
                setShowCartConflict(false);
              }}
              className="w-full bg-[#EF2B2D] text-white font-bold py-4 rounded-xl mb-3"
            >
              Vider et ajouter
            </button>
            <button
              onClick={() => { setPendingItem(null); setShowCartConflict(false); }}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal soumettre un avis */}
      {showReviewModal && (
        <ReviewModal
          entityType="restaurant"
          entityId={params.id}
          entityName={restaurant.name}
          {...(eligibility?.booking_ref_id ? { bookingRefId: eligibility.booking_ref_id } : {})}
          onClose={() => setShowReviewModal(false)}
          onSubmitted={() => {
            setShowReviewModal(false);
            setEligibility({ can_review: false, already_reviewed: true });
            loadReviews();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
 * CARTE AVIS
 * ============================================================ */

function ReviewCard({ review }: { review: Review }): React.ReactElement {
  const date = new Date(review.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <span className="font-semibold text-gray-900 text-sm">{review.author}</span>
          {review.is_verified && (
            <span className="ml-2 text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded-full">
              ✓ Achat vérifié
            </span>
          )}
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={`text-sm ${star <= review.rating ? "text-[#F5A623]" : "text-gray-200"}`}>
              ★
            </span>
          ))}
        </div>
      </div>
      {review.title && <p className="text-sm font-semibold text-gray-800 mb-0.5">{review.title}</p>}
      {review.comment && <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>}
      <p className="text-xs text-gray-400 mt-2">{date}</p>
    </div>
  );
}

/* ============================================================
 * MODAL SOUMETTRE UN AVIS
 * ============================================================ */

function ReviewModal({
  entityType,
  entityId,
  entityName,
  bookingRefId,
  onClose,
  onSubmitted,
}: {
  entityType:    string;
  entityId:      string;
  entityName:    string;
  bookingRefId?: string;
  onClose:       () => void;
  onSubmitted:   () => void;
}): React.ReactElement {
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle]     = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (rating === 0) { setError("Choisissez une note entre 1 et 5 étoiles"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/reviews", {
        entity_type: entityType,
        entity_id:   entityId,
        rating,
        ...(title.trim()   ? { title: title.trim() }     : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(bookingRefId   ? { booking_ref_id: bookingRefId } : {}),
      });
      onSubmitted();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Erreur réseau — réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-xl text-gray-900">Noter {entityName}</h2>

        {/* Étoiles */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Votre note</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className={`text-4xl transition-transform active:scale-90 ${
                  star <= (hovered || rating) ? "text-[#F5A623]" : "text-gray-200"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {["", "Très mauvais", "Mauvais", "Correct", "Bien", "Excellent"][rating]}
            </p>
          )}
        </div>

        {/* Titre optionnel */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Titre <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Ex : Délicieux mais livraison lente"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF2B2D]/30"
          />
        </div>

        {/* Commentaire */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Commentaire <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Partagez votre expérience..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF2B2D]/30 resize-none"
          />
        </div>

        {bookingRefId && (
          <p className="text-xs text-green-600 bg-green-50 rounded-xl px-3 py-2 font-medium">
            ✓ Votre avis sera marqué "Achat vérifié"
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={() => void handleSubmit()}
          disabled={saving || rating === 0}
          className="w-full bg-[#EF2B2D] text-white font-bold py-4 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
        >
          {saving ? "Publication en cours…" : "Publier mon avis"}
        </button>
        <button
          onClick={onClose}
          className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * CARTE PLAT DU MENU
 * ============================================================ */

function MenuItemCard({
  item,
  cartQuantity,
  onAdd,
  onRemove,
}: {
  item: MenuItemData;
  cartQuantity: number;
  onAdd: (qty: number) => void;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 ${!item.is_available ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Image ou placeholder */}
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
            🍽️
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-gray-900 text-sm">{item.name}</p>
                {item.is_featured && (
                  <span className="text-xs bg-[#F5A623]/10 text-[#F5A623] font-semibold px-1.5 py-0.5 rounded">★</span>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
              )}
              {item.prep_minutes && (
                <p className="text-xs text-gray-400 mt-0.5">⏱ {item.prep_minutes} min</p>
              )}
              <p className="font-bold text-[#EF2B2D] text-sm mt-1">{formatFCFA(item.price)}</p>
            </div>

            {/* Contrôles quantité */}
            {item.is_available && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {cartQuantity > 0 ? (
                  <>
                    <button
                      onClick={onRemove}
                      className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-700 active:scale-95"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-bold text-sm">{cartQuantity}</span>
                    <button
                      onClick={() => onAdd(1)}
                      className="w-8 h-8 bg-[#EF2B2D] rounded-full flex items-center justify-center font-bold text-white active:scale-95"
                    >
                      +
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onAdd(1)}
                    className="w-8 h-8 bg-[#EF2B2D] rounded-full flex items-center justify-center font-bold text-white active:scale-95"
                  >
                    +
                  </button>
                )}
              </div>
            )}
          </div>

          {!item.is_available && (
            <p className="text-xs text-red-400 font-semibold mt-1">Indisponible</p>
          )}
        </div>
      </div>
    </div>
  );
}
