"use client";

/**
 * components/InstallPrompt.tsx — Invitation à installer la PWA
 *
 * Affiche une bannière "Installer VIVRE sur votre écran d'accueil" quand :
 *   1. Le navigateur déclenche l'événement "beforeinstallprompt" (Android/Desktop Chrome)
 *   2. L'utilisateur n'a pas déjà installé l'app (display-mode: standalone)
 *   3. L'utilisateur n'a pas fermé la bannière cette session
 *
 * Sur iOS, l'événement beforeinstallprompt n'existe pas.
 * On affiche à la place un message "Appuyez sur Partager → Sur l'écran d'accueil".
 *
 * La bannière réapparaît à chaque session (localStorage non utilisé intentionnellement) —
 * pour un marché où beaucoup d'utilisateurs ne savent pas ce qu'est une PWA,
 * un rappel régulier est utile.
 */

import { useState, useEffect } from "react";

/* Type de l'événement beforeinstallprompt (non standard — pas dans les types TypeScript) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt(): React.ReactElement | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos,          setIsIos]          = useState(false);
  const [dismissed,      setDismissed]      = useState(false);
  const [isInstalled,    setIsInstalled]    = useState(false);

  useEffect(() => {
    /* Déjà installé en tant que PWA standalone — ne rien afficher */
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    /* Détecter iOS (Safari n'émet pas beforeinstallprompt) */
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
    setIsIos(ios);

    /* Écouter l'événement PWA install sur Android/Chrome */
    function handleInstallPrompt(e: Event) {
      e.preventDefault(); /* Empêche l'invite native immédiate */
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  async function handleInstall(): Promise<void> {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setDismissed(true);
  }

  /* Ne rien afficher si : installé, refusé, ou aucun événement disponible */
  if (isInstalled || dismissed) return null;
  if (!deferredPrompt && !isIos) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-center gap-4">
        {/* Logo VIVRE */}
        <div className="w-12 h-12 rounded-xl bg-[#1A6B3A] flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-xl">V</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">Installer VIVRE</p>
          {isIos ? (
            <p className="text-xs text-gray-500 mt-0.5">
              Appuyez sur <strong>Partager</strong> puis <strong>"Sur l'écran d'accueil"</strong>
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">
              Accès rapide même sans internet
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
            aria-label="Fermer"
          >
            ✕
          </button>
          {!isIos && (
            <button
              onClick={() => void handleInstall()}
              className="bg-[#1A6B3A] text-white text-xs font-bold px-3 py-2 rounded-xl"
            >
              Installer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
