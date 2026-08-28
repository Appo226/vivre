"use client";

/**
 * components/QrCameraScanner.tsx — Scan QR par caméra, en direct dans le navigateur.
 *
 * Utilise getUserMedia + jsQR (décodage pur JS, gratuit, fonctionne sur tous les
 * navigateurs mobiles y compris Safari/iOS — contrairement à l'API native
 * BarcodeDetector qui n'existe que sur Chrome/Android). Dès qu'un QR est détecté,
 * onDetect() est appelé une seule fois — le composant se met en pause jusqu'à ce
 * que le parent l'autorise à reprendre (évite de re-scanner le même billet en boucle).
 */

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface QrCameraScannerProps {
  onDetect: (rawValue: string) => void;
  paused: boolean;
}

export function QrCameraScanner({ onDetect, paused }: QrCameraScannerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, // caméra arrière — celle qu'on tend vers le client
        });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
        tick();
      } catch {
        setError("Impossible d'accéder à la caméra. Utilisez la saisie manuelle ci-dessous.");
      }
    }

    function tick() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !paused) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            onDetect(code.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    void start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <p className="text-white/70 text-sm text-center py-6">{error}</p>;
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      {ready && (
        <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" aria-hidden="true" />
      )}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/60 text-sm">Activation de la caméra…</p>
        </div>
      )}
    </div>
  );
}
