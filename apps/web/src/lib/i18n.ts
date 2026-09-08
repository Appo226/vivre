"use client";

/**
 * lib/i18n.ts — Traduction fr/en de l'ossature de l'app (nav, boutons, libellés).
 *
 * Portée délibérément limitée : les labels d'interface (nav, boutons, en-têtes de section,
 * champs de formulaire) sont traduits — c'est ce qui sert vraiment quelqu'un qui ne lit pas
 * le français à faire fonctionner l'app. Le contenu écrit par les organisateurs (titre/
 * description d'événement) et les pages légales (déjà marquées comme brouillon non relu par
 * un avocat) ne le sont PAS : les traduire ajouterait de la confusion, pas de la clarté — un
 * texte d'événement mal traduit automatiquement représenterait mal ce que l'organisateur a
 * réellement écrit, et traduire un texte juridique pas encore validé ne fait que doubler le
 * problème plutôt que le résoudre.
 *
 * Remplace le petit dictionnaire local qui n'existait qu'à l'intérieur de /profile — avant
 * ce fichier, changer la langue ne changeait presque rien ailleurs dans l'app.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api";

export type Lang = "fr" | "en";

const LANG_STORAGE_KEY = "vivre_lang";
const LANG_CHANGE_EVENT = "vivre-lang-change";

export const translations = {
  fr: {
    // Navigation basse
    nav_home: "Accueil",
    nav_tickets: "Mes billets",
    nav_organize: "Organiser",
    nav_emergency: "Urgences",
    nav_profile: "Profil",

    // Accueil
    home_search_placeholder: "Rechercher un événement, un lieu…",
    home_explore_category: "Explorer par catégorie",
    home_see_all: "Voir tout",
    home_more: "Plus",
    home_sponsored: "SPONSORISÉ",
    home_your_tickets: "Vos billets",
    home_see_my_tickets: "Voir mes billets",
    home_no_tickets: "Vous n'avez aucun billet",
    home_book_next_event: "Réservez vos prochains événements en quelques clics.",
    home_featured: "À l'affiche",
    home_organize_event: "Organisez votre événement",
    home_organize_event_sub: "Gratuit pour les billets gratuits, publié en quelques minutes",
    home_advertise: "Annoncez sur VIVRE",
    home_advertise_sub: "Touchez les fans d'événements du Burkina, soumettez votre pub",
    home_emergency_numbers: "Numéros d'urgence",
    home_upcoming_ticket: "billet à venir",
    home_upcoming_tickets: "billets à venir",
    home_find_qr_codes: "Retrouvez vos QR codes et vos événements à venir.",

    // Salutation (heure locale de l'appareil)
    greeting_morning: "Bonjour",
    greeting_afternoon: "Bon après-midi",
    greeting_evening: "Bonsoir",

    // Connexion / inscription
    auth_welcome: "Bienvenue !",
    auth_login_subtitle: "Connectez-vous avec votre numéro et votre mot de passe.",
    auth_signup_subtitle: "Créez votre compte pour découvrir et réserver des événements.",
    auth_login_tab: "Se connecter",
    auth_signup_tab: "Créer un compte",
    auth_phone: "Numéro de téléphone",
    auth_password: "Mot de passe",
    auth_confirm_password: "Confirmer le mot de passe",
    auth_confirm_password_placeholder: "Retapez votre mot de passe",
    auth_forgot_password: "Mot de passe oublié ?",
    auth_at_least_8: "Au moins 8 caractères",
    auth_passwords_mismatch: "Les mots de passe ne correspondent pas.",
    auth_username: "Nom d'utilisateur",
    auth_first_name: "Prénom",
    auth_last_name: "Nom",
    auth_email: "Email",
    auth_email_optional: "(optionnel, pour récupérer l'accès et vos reçus)",
    auth_submit_login: "Se connecter",
    auth_submit_signup: "Créer mon compte",
    auth_continuing_accept: "En continuant, vous acceptez nos",
    auth_terms: "Conditions d'utilisation",
    auth_and: "et notre",
    auth_privacy: "Politique de confidentialité",
    auth_chip_qr: "Billet QR instantané",
    auth_chip_payment: "Paiement sécurisé",
    auth_chip_everywhere: "Partout au Burkina",
    auth_err_phone_password_required: "Numéro de téléphone et mot de passe requis.",
    auth_err_invalid_phone: "Numéro invalide. Exemple : 70000000",
    auth_err_login_incorrect: "Numéro de téléphone ou mot de passe incorrect.",
    auth_err_connection: "Une erreur est survenue. Vérifiez votre connexion internet.",
    auth_err_all_fields_required: "Tous les champs marqués * sont obligatoires.",
    auth_err_password_min: "Le mot de passe doit faire au moins 8 caractères.",
    auth_err_signup_generic: "Impossible de créer le compte. Réessayez.",
    auth_show_password: "Afficher le mot de passe",
    auth_hide_password: "Masquer le mot de passe",
    auth_logging_in: "Connexion…",
    auth_creating_account: "Création du compte…",

    // Billets / réservation
    tickets_header: "Billets",
    tickets_sold_out: "Complet, plus de billets disponibles",
    tickets_past_event: "Cet événement est passé",
    tickets_quantity: "Quantité",
    tickets_total: "Total",
    tickets_continue: "Continuer",
    tickets_confirm: "Confirmer",
    tickets_cancel: "Annuler",
    tickets_book_ticket: "Réserver un billet",
    tickets_order: "Commande",
    tickets_ticket: "Billet",
    tickets_holder: "Détenteur",
    tickets_transfer: "Transférer ce billet",
    tickets_transfer_to: "Transférer à qui ?",
    tickets_ready: "Prêt à entrer",
    tickets_used: "Utilisé",
    tickets_cancelled: "Annulé",
    tickets_present_qr: "Présentez ce QR code à l'entrée",
    tickets_save: "Enregistrer le billet",
    tickets_choose_option: "Choisissez une option",
    tickets_add_products: "Ajouter des produits (optionnel)",
    tickets_item_sold_out: "Épuisé",
    tickets_available_suffix: "disponible(s)",
    tickets_booking_in_progress: "Réservation...",
    tickets_free: "Gratuit",
    tickets_seated: "Place numérotée",
    tickets_remaining_suffix: "restant(s)",
    tickets_filter_all: "Tous",
    tickets_filter_upcoming: "À venir",
    tickets_filter_past: "Passés",
    tickets_filter_cancelled: "Annulés",
    tickets_status_pending: "En attente",
    tickets_status_confirmed: "Confirmé",
    tickets_status_cancelled: "Annulé",
    tickets_status_checked_in: "Scanné ✓",
    tickets_booking_status_pending: "En attente de paiement",
    tickets_booking_status_confirmed: "Confirmé, prêt à entrer",
    tickets_my_ticket: "Mon billet",
    tickets_my_tickets_count: "Mes billets",
    tickets_tap_to_see_qr: "Toucher pour voir le QR",
    tickets_organizer: "Organisateur",
    tickets_organizer_fallback: "Organisateur VIVRE",
    tickets_for: "Billet pour",
    tickets_used_caps: "BILLET UTILISÉ",
    tickets_cancelled_caps: "BILLET ANNULÉ",
    tickets_generating: "Génération…",
    tickets_transfer_confirm: "Confirmer",
    tickets_transfer_sending: "Transfert…",
    tickets_not_found: "Billet introuvable",
    tickets_back: "Retour",
    tickets_held: "Billets détenus",
    tickets_amount: "Montant",
    tickets_seat: "Place",
    tickets_save_sub: "Sauvegarde ce billet en image sur votre téléphone, utile sans connexion à l'entrée",
    tickets_transfer_explanation: "Ce billet précis passera immédiatement au numéro indiqué : vous n'y aurez plus accès. La personne le retrouvera dans « Mes billets » en se connectant avec ce numéro sur VIVRE.",
    tickets_recipient_phone_placeholder: "Numéro du destinataire (ex: 70000000 ou +226...)",
    tickets_phone_required: "Numéro de téléphone requis.",
    tickets_transfer_success: "Billet transféré. Redirection vers vos billets…",

    // Profil (migré depuis l'ancien dictionnaire local)
    profile_my_profile: "Mon profil",
    profile_edit: "Modifier",
    profile_verified: "Vérifié",
    profile_my_activity: "MON ACTIVITÉ",
    profile_settings: "PARAMÈTRES",
    profile_account: "COMPTE",
    profile_events: "Mes billets",
    profile_events_sub: "Billets que vous avez achetés",
    profile_language: "Langue",
    profile_language_sub: "Interface de l'application",
    profile_notifications: "Notifications",
    profile_help: "Aide & support",
    profile_logout: "Se déconnecter",
    profile_theme: "Thème",
    profile_theme_sub: "Apparence de l'application",
    profile_theme_light: "Clair",
    profile_theme_dark: "Sombre",
  },
  en: {
    nav_home: "Home",
    nav_tickets: "My tickets",
    nav_organize: "Organize",
    nav_emergency: "Emergency",
    nav_profile: "Profile",

    home_search_placeholder: "Search an event, a place…",
    home_explore_category: "Explore by category",
    home_see_all: "See all",
    home_more: "More",
    home_sponsored: "SPONSORED",
    home_your_tickets: "Your tickets",
    home_see_my_tickets: "See my tickets",
    home_no_tickets: "You don't have any tickets",
    home_book_next_event: "Book your next events in a few clicks.",
    home_featured: "Featured",
    home_organize_event: "Organize your event",
    home_organize_event_sub: "Free for free tickets, published in minutes",
    home_advertise: "Advertise on VIVRE",
    home_advertise_sub: "Reach Burkina's event fans, submit your ad",
    home_emergency_numbers: "Emergency numbers",
    home_upcoming_ticket: "upcoming ticket",
    home_upcoming_tickets: "upcoming tickets",
    home_find_qr_codes: "Find your QR codes and upcoming events.",

    greeting_morning: "Good morning",
    greeting_afternoon: "Good afternoon",
    greeting_evening: "Good evening",

    auth_welcome: "Welcome!",
    auth_login_subtitle: "Sign in with your phone number and password.",
    auth_signup_subtitle: "Create your account to discover and book events.",
    auth_login_tab: "Sign in",
    auth_signup_tab: "Create account",
    auth_phone: "Phone number",
    auth_password: "Password",
    auth_confirm_password: "Confirm password",
    auth_confirm_password_placeholder: "Retype your password",
    auth_forgot_password: "Forgot password?",
    auth_at_least_8: "At least 8 characters",
    auth_passwords_mismatch: "Passwords don't match.",
    auth_username: "Username",
    auth_first_name: "First name",
    auth_last_name: "Last name",
    auth_email: "Email",
    auth_email_optional: "(optional, to recover access and receipts)",
    auth_submit_login: "Sign in",
    auth_submit_signup: "Create my account",
    auth_continuing_accept: "By continuing, you accept our",
    auth_terms: "Terms of Use",
    auth_and: "and our",
    auth_privacy: "Privacy Policy",
    auth_chip_qr: "Instant QR ticket",
    auth_chip_payment: "Secure payment",
    auth_chip_everywhere: "Anywhere in Burkina",
    auth_err_phone_password_required: "Phone number and password required.",
    auth_err_invalid_phone: "Invalid number. Example: 70000000",
    auth_err_login_incorrect: "Incorrect phone number or password.",
    auth_err_connection: "Something went wrong. Check your internet connection.",
    auth_err_all_fields_required: "All fields marked * are required.",
    auth_err_password_min: "Password must be at least 8 characters.",
    auth_err_signup_generic: "Couldn't create the account. Try again.",
    auth_show_password: "Show password",
    auth_hide_password: "Hide password",
    auth_logging_in: "Signing in…",
    auth_creating_account: "Creating account…",

    tickets_header: "Tickets",
    tickets_sold_out: "Sold out, no more tickets available",
    tickets_past_event: "This event has passed",
    tickets_quantity: "Quantity",
    tickets_total: "Total",
    tickets_continue: "Continue",
    tickets_confirm: "Confirm",
    tickets_cancel: "Cancel",
    tickets_book_ticket: "Book a ticket",
    tickets_order: "Order",
    tickets_ticket: "Ticket",
    tickets_holder: "Holder",
    tickets_transfer: "Transfer this ticket",
    tickets_transfer_to: "Transfer to whom?",
    tickets_ready: "Ready to enter",
    tickets_used: "Used",
    tickets_cancelled: "Cancelled",
    tickets_present_qr: "Present this QR code at the entrance",
    tickets_save: "Save ticket",
    tickets_choose_option: "Choose an option",
    tickets_add_products: "Add products (optional)",
    tickets_item_sold_out: "Sold out",
    tickets_available_suffix: "available",
    tickets_booking_in_progress: "Booking...",
    tickets_free: "Free",
    tickets_seated: "Numbered seat",
    tickets_remaining_suffix: "left",
    tickets_filter_all: "All",
    tickets_filter_upcoming: "Upcoming",
    tickets_filter_past: "Past",
    tickets_filter_cancelled: "Cancelled",
    tickets_status_pending: "Pending",
    tickets_status_confirmed: "Confirmed",
    tickets_status_cancelled: "Cancelled",
    tickets_status_checked_in: "Scanned ✓",
    tickets_booking_status_pending: "Awaiting payment",
    tickets_booking_status_confirmed: "Confirmed, ready to enter",
    tickets_my_ticket: "My ticket",
    tickets_my_tickets_count: "My tickets",
    tickets_tap_to_see_qr: "Tap to see the QR",
    tickets_organizer: "Organizer",
    tickets_organizer_fallback: "VIVRE Organizer",
    tickets_for: "Ticket for",
    tickets_used_caps: "TICKET USED",
    tickets_cancelled_caps: "TICKET CANCELLED",
    tickets_generating: "Generating…",
    tickets_transfer_confirm: "Confirm",
    tickets_transfer_sending: "Transferring…",
    tickets_not_found: "Ticket not found",
    tickets_back: "Back",
    tickets_held: "Tickets held",
    tickets_amount: "Amount",
    tickets_seat: "Seat",
    tickets_save_sub: "Save this ticket as an image on your phone, useful with no connection at the door",
    tickets_transfer_explanation: "This exact ticket will move to the number you enter right away: you'll no longer have access to it. They'll find it under \"My tickets\" by signing in with that number on VIVRE.",
    tickets_recipient_phone_placeholder: "Recipient's number (e.g. 70000000 or +226...)",
    tickets_phone_required: "Phone number required.",
    tickets_transfer_success: "Ticket transferred. Redirecting to your tickets…",

    profile_my_profile: "My profile",
    profile_edit: "Edit",
    profile_verified: "Verified",
    profile_my_activity: "MY ACTIVITY",
    profile_settings: "SETTINGS",
    profile_account: "ACCOUNT",
    profile_events: "My tickets",
    profile_events_sub: "Tickets you've bought",
    profile_language: "Language",
    profile_language_sub: "App interface",
    profile_notifications: "Notifications",
    profile_help: "Help & support",
    profile_logout: "Sign out",
    profile_theme: "Theme",
    profile_theme_sub: "App appearance",
    profile_theme_light: "Light",
    profile_theme_dark: "Dark",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["fr"];

/* Salutation selon l'heure LOCALE DE L'APPAREIL — jamais l'heure serveur, voir le
   commentaire d'origine dans profile/page.tsx. Trois tranches, pas juste avant/après 18h :
   plus naturel pour quelqu'un qui ouvre l'app en début d'après-midi. */
export function timeGreeting(lang: Lang): string {
  const hour = new Date().getHours();
  const t = translations[lang];
  if (hour < 12) return t.greeting_morning;
  if (hour < 18) return t.greeting_afternoon;
  return t.greeting_evening;
}

/**
 * useLang — langue actuelle + fonction pour la changer.
 *
 * Connecté : la préférence vient de user.preferred_language (persistée en base via
 * PATCH /auth/me) — source de vérité une fois le compte créé.
 * Non connecté (ex: /auth avant connexion) : lue depuis localStorage, pas d'appel API
 * possible puisqu'il n'y a pas encore de compte. Le changement est immédiat (pas de
 * rechargement de page nécessaire, contrairement à l'ancien flux de /profile) grâce à un
 * event custom qui notifie les autres instances du hook dans le même onglet.
 */
export function useLang(): [Lang, (lang: Lang) => void] {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [localLang, setLocalLang] = useState<Lang>("fr");

  useEffect(() => {
    const read = (): void => {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "en" || stored === "fr") setLocalLang(stored);
    };
    read();
    window.addEventListener(LANG_CHANGE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(LANG_CHANGE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const lang: Lang = user ? (user.preferred_language === "en" ? "en" : "fr") : localLang;

  const setLang = useCallback(
    (next: Lang) => {
      localStorage.setItem(LANG_STORAGE_KEY, next);
      window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
      if (user) {
        setUser({ ...user, preferred_language: next });
        void apiClient.patch("/auth/me", { preferred_language: next }).catch(() => {});
      }
    },
    [user, setUser]
  );

  return [lang, setLang];
}

/** Raccourci pratique : juste le dictionnaire courant, quand on n'a pas besoin de changer la langue. */
export function useT(): Record<TranslationKey, string> {
  const [lang] = useLang();
  return translations[lang];
}
