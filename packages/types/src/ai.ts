/**
 * ai.ts — Types pour l'Assistant IA VIVRE (Module 10)
 *
 * L'assistant IA de VIVRE est propulsé par Claude (Anthropic) avec RAG (Retrieval-Augmented
 * Generation) via Pinecone. Il comprend le contexte burkinabè et répond en français.
 *
 * Architecture :
 * 1. L'utilisateur envoie un message textuel ("Où dormir pas cher à Bobo ?")
 * 2. L'API extrait des embeddings de la requête (via Anthropic embeddings)
 * 3. Pinecone retourne les hôtels/restaurants/guides les plus pertinents (vecteurs proches)
 * 4. Les données récupérées enrichissent le prompt Claude (contexte RAG)
 * 5. Claude génère une réponse contextualisée avec des actions (cartes interactives)
 * 6. La réponse est streamée token par token via WebSocket (/ws/ai/stream/:session_id)
 *
 * Les "actions" sont des instructions pour le frontend de rendre des cartes interactives.
 * Ex: l'IA répond "Voici 3 hôtels disponibles à Bobo" + actions:[{type:'show_hotel', data:{...}}]
 * Le frontend rend ces cards dans le chat (comme Google Flights dans Google Search).
 */

import type { UUID } from "./common.js";

/* ============================================================
 * SESSIONS ET MESSAGES
 * ============================================================ */

/**
 * Session de conversation avec l'IA.
 * Une session = une conversation complète (plusieurs messages).
 * summary = généré automatiquement après 5+ messages (ex: "Recherche hôtels Bobo").
 */
export interface AiSession {
  id: UUID;
  user_id: UUID;
  summary?: string;    /* Résumé auto-généré de la conversation */
  messages_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Message dans une conversation IA.
 * role: "user" = message du client, "assistant" = réponse Claude.
 * actions = présent uniquement sur les messages "assistant" avec des résultats concrets.
 */
export interface AiMessage {
  id: UUID;
  session_id: UUID;
  role: "user" | "assistant";
  content: string;          /* Texte brut du message */
  created_at: string;
  actions?: AiAction[];     /* Cartes interactives à rendre dans le chat */
}

/* ============================================================
 * ACTIONS IA — Cartes interactives dans le chat
 * ============================================================ */

/**
 * Types d'actions que l'IA peut déclencher.
 * Chaque action fait afficher une card interactive dans le chat.
 * "show_bus" → carte de voyage de bus avec bouton "Réserver"
 * "show_hotel" → carte d'hôtel avec bouton "Voir les chambres"
 * "show_guide" → carte de guide avec bouton "Réserver"
 * "show_emergency" → affiche les numéros d'urgence (sp_001)
 * "navigate" → redirige vers un écran de l'app (ex: "navigate": "SP_001")
 */
export type AiActionType =
  | "show_bus"
  | "show_hotel"
  | "show_restaurant"
  | "show_guide"
  | "show_attraction"
  | "show_emergency"
  | "navigate";

/**
 * Action IA avec ses données associées.
 * Le frontend utilise le `type` pour choisir quel composant rendre,
 * et `data` pour peupler ce composant.
 */
export interface AiAction {
  type: AiActionType;
  data: AiActionData;
}

/**
 * Données d'une action IA — structure varie selon le type.
 * Utilise une union discriminée pour la sécurité des types.
 */
export type AiActionData =
  | BusActionData
  | HotelActionData
  | RestaurantActionData
  | GuideActionData
  | AttractionActionData
  | EmergencyActionData
  | NavigateActionData;

/** Données pour une card de voyage de bus */
export interface BusActionData {
  trip_id: UUID;
  company_name: string;
  origin: string;
  destination: string;
  departure_time: string;
  price: number;         /* FCFA */
  available_seats: number;
}

/** Données pour une card d'hôtel */
export interface HotelActionData {
  property_id: UUID;
  name: string;
  property_type: string;
  price_per_night: number; /* FCFA */
  rating_avg: number;
  thumbnail?: string;
}

/** Données pour une card de restaurant */
export interface RestaurantActionData {
  restaurant_id: UUID;
  name: string;
  restaurant_type: string;
  avg_prep_minutes: number;
  rating_avg: number;
  thumbnail?: string;
}

/** Données pour une card de guide */
export interface GuideActionData {
  guide_id: UUID;
  name: string;
  languages: string[];
  daily_rate_fcfa: number;
  is_ontb_certified: boolean;
  rating_avg: number;
}

/** Données pour une card d'attraction */
export interface AttractionActionData {
  attraction_id: UUID;
  name: string;
  category: string;
  entry_fee_fcfa: number;
  is_unesco: boolean;
  thumbnail?: string;
}

/** Données pour l'affichage des urgences */
export interface EmergencyActionData {
  service_name: string;
  number: string;
  color_hex: string;
}

/** Navigation vers un écran de l'app */
export interface NavigateActionData {
  screen: string;   /* Ex: "SP_001", "TI_001" */
  params?: Record<string, string>;
}

/* ============================================================
 * REQUÊTES ET RÉPONSES
 * ============================================================ */

/**
 * Corps de la requête POST /ai/chat.
 * context permet à l'IA de personnaliser sa réponse selon la position de l'utilisateur.
 * Ex: si city_id = Bobo, l'IA suggère des hôtels à Bobo, pas à Ouaga.
 */
export interface AiChatRequest {
  message: string;
  session_id?: UUID;  /* null = nouvelle conversation */
  context?: {
    city_id?: UUID;
    current_screen?: string; /* Écran actuel (ex: "TI_001") pour contextualiser */
  };
}

/**
 * Réponse de POST /ai/chat.
 * La réponse complète est disponible ici.
 * Pour le streaming token-par-token, utiliser /ws/ai/stream/:session_id.
 */
export interface AiChatResponse {
  response: string;        /* Texte de la réponse Claude */
  session_id: UUID;
  actions?: AiAction[];    /* Cartes interactives à rendre */
}

/**
 * Événement WebSocket de streaming IA.
 * Envoyé token par token pour l'affichage progressif de la réponse.
 * type: "token" → caractère/mot à afficher
 * type: "done"  → fin de la réponse, actions disponibles
 * type: "error" → erreur de génération
 */
export interface AiStreamEvent {
  type: "token" | "done" | "error";
  content?: string;       /* Token de texte (si type = "token") */
  actions?: AiAction[];   /* Actions complètes (si type = "done") */
  error?: string;         /* Message d'erreur (si type = "error") */
}

/**
 * Suggestions rapides affichées en dessous du chat (écran AI-001).
 * Prédéfinies pour guider les nouveaux utilisateurs.
 */
export const AI_QUICK_SUGGESTIONS = [
  "Planifier mon voyage au Burkina Faso",
  "Où dormir à Bobo-Dioulasso ?",
  "Pharmacie de garde ce soir",
  "Bus pour Banfora demain matin",
  "Restaurants ouverts maintenant près de moi",
  "Guides pour visiter Tiébélé",
] as const;
