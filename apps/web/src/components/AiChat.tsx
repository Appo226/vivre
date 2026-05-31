"use client";

/**
 * components/AiChat.tsx — Assistant IA VIVRE
 *
 * Bouton flottant ✨ + panneau de chat slide-up.
 * Appelle POST /v1/ai/chat avec l'historique de la conversation.
 * Authentification via le Bearer token du store Zustand.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";

/* ============================================================
 * TYPES
 * ============================================================ */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  role: "assistant";
  content: string;
}

/* ============================================================
 * COMPOSANT PRINCIPAL
 * ============================================================ */

export default function AiChat(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-scroll vers le bas à chaque nouveau message */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* Focus automatique quand le panneau s'ouvre */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  /* Message d'accueil au premier ouverture */
  const handleOpen = useCallback(() => {
    setOpen(true);
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Bonjour ! Je suis l'assistant IA de VIVRE. Je peux vous aider à trouver des restaurants, hôtels, transports, événements, ou estimer le prix d'une course. Comment puis-je vous aider ?",
        },
      ]);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      /* N'envoyer que les 20 derniers messages pour éviter des payloads trop grands */
      const recentMessages = newMessages.slice(-20);
      const response = await apiClient.post<ChatResponse>("/ai/chat", {
        messages: recentMessages,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: response.content }]);
    } catch {
      setError("Une erreur est survenue. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  /* Envoyer avec Entrée (Shift+Entrée = saut de ligne) */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  return (
    <>
      {/* === BOUTON FLOTTANT === */}
      <button
        onClick={handleOpen}
        className={[
          "fixed bottom-20 right-4 z-40",
          "w-14 h-14 rounded-full",
          "bg-amber-500 text-white shadow-lg",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95",
          "transition-transform duration-200",
          open ? "opacity-0 pointer-events-none" : "opacity-100",
        ].join(" ")}
        aria-label="Ouvrir l'assistant IA VIVRE"
      >
        <span className="text-2xl">✨</span>
      </button>

      {/* === BACKDROP === */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* === PANNEAU DE CHAT === */}
      <div
        className={[
          "fixed left-0 right-0 bottom-0 z-50",
          "max-w-md mx-auto",
          "bg-white rounded-t-2xl shadow-2xl",
          "flex flex-col",
          "transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
        style={{ height: "72vh" }}
        role="dialog"
        aria-modal="true"
        aria-label="Assistant IA VIVRE"
      >
        {/* --- En-tête --- */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <p className="font-sora font-bold text-gray-900 text-sm">Assistant VIVRE</p>
              <p className="text-xs text-gray-400 font-dm">Propulsé par Claude</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* --- Messages --- */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {/* Indicateur de chargement */}
          {loading && (
            <div className="flex gap-2 items-end">
              <span className="text-lg">✨</span>
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <TypingDots />
              </div>
            </div>
          )}

          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-700 text-sm font-dm">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* --- Suggestions rapides (seulement au début) --- */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="shrink-0 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-dm px-3 py-1.5 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* --- Zone de saisie --- */}
        <div className="px-3 pb-safe-bottom py-2 border-t border-gray-100 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question..."
            rows={1}
            className={[
              "flex-1 resize-none rounded-2xl px-4 py-2.5",
              "bg-gray-100 text-gray-900 font-dm text-sm",
              "placeholder:text-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-amber-400",
              "max-h-24 overflow-y-auto",
            ].join(" ")}
            style={{ lineHeight: "1.4" }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || loading}
            className={[
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              "transition-colors duration-150",
              input.trim() && !loading
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed",
            ].join(" ")}
            aria-label="Envoyer"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </>
  );
}

/* ============================================================
 * SOUS-COMPOSANTS
 * ============================================================ */

function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 items-end ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && <span className="text-lg shrink-0">✨</span>}
      <div
        className={[
          "max-w-[78%] px-4 py-2.5 text-sm font-dm leading-relaxed",
          "whitespace-pre-wrap break-words",
          isUser
            ? "bg-amber-500 text-white rounded-2xl rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm",
        ].join(" ")}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingDots(): React.ReactElement {
  return (
    <div className="flex gap-1 items-center py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function SendIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

/* ============================================================
 * SUGGESTIONS RAPIDES
 * ============================================================ */

const QUICK_SUGGESTIONS = [
  "Restaurants à Ouagadougou",
  "Hôtels disponibles",
  "Bus pour Bobo-Dioulasso",
  "Numéros d'urgence",
  "Prix d'une course taxi",
] as const;
