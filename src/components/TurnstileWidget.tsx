"use client";

import { useEffect, useRef } from "react";

/**
 * Widget de Cloudflare Turnstile (CAPTCHA casi siempre invisible) para la reserva pública.
 * No muestra nada si no está configurada NEXT_PUBLIC_TURNSTILE_SITE_KEY. Cada token sirve una
 * sola vez: para pedir uno nuevo (por ejemplo, después de una reserva rechazada), el
 * componente que lo usa le cambia la `key` y así se vuelve a montar.
 */

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("No se pudo cargar Turnstile."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/** Si en este tiempo no hay token ni error, se avisa: el widget puede quedar trabado sin decir nada. */
const STUCK_AFTER_MS = 20_000;

/**
 * `onError` recibe el código de error de Cloudflare (por ejemplo "300030"), o
 * "tiempo" si la verificación no terminó en 20 segundos. Se llama con null
 * cuando la verificación por fin funciona, para borrar un aviso anterior.
 *
 * Auditoría/arreglo 2026-10-13: antes el widget era invisible hasta que pedía un
 * clic ("interaction-only") y no avisaba los errores. Si Cloudflare se trababa,
 * el botón quedaba en "Verificando…" para siempre, sin explicación. Ahora el
 * recuadro de Cloudflare se ve siempre y los problemas se informan.
 */
export default function TurnstileWidget({
  onToken,
  onError,
}: {
  onToken: (token: string | null) => void;
  onError?: (code: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Las funciones pueden cambiar en cada render del padre; el widget usa siempre las últimas.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const stuckTimer = setTimeout(() => onErrorRef.current?.("tiempo"), STUCK_AFTER_MS);

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: "es",
          callback: (token: string) => {
            clearTimeout(stuckTimer);
            onErrorRef.current?.(null);
            onTokenRef.current(token);
          },
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": (code: string) => {
            clearTimeout(stuckTimer);
            onTokenRef.current(null);
            onErrorRef.current?.(String(code || "desconocido"));
          },
        });
      })
      .catch(() => {
        clearTimeout(stuckTimer);
        onTokenRef.current(null);
        onErrorRef.current?.("no-cargo");
      });
    return () => {
      cancelled = true;
      clearTimeout(stuckTimer);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
