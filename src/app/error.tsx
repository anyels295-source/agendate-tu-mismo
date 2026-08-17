"use client";

import { useEffect } from "react";

/**
 * Error boundary de toda la app pública (fuera de /admin, que tiene el suyo).
 * Next.js renderiza esto en vez de la pantalla de error genérica ante
 * cualquier excepción no controlada en un Server o Client Component.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El detalle técnico solo queda en la consola/logs del servidor, nunca en la UI.
    console.error("Error no controlado:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--page)] p-6 text-center">
      <div className="mx-auto mb-4 flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#fdf1dc]">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#a4700f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h1 className="text-[20px] font-extrabold text-[var(--brand-dk)]">Algo no funcionó como esperábamos</h1>
      <p className="mt-2 max-w-[420px] text-[14.5px] leading-relaxed text-[#5a6884]">
        Es un problema temporal de nuestro lado. Probá de nuevo en unos segundos — si el problema
        sigue, contactanos.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-[11px] bg-[var(--brand)] px-6 py-3 text-[14px] font-bold text-white"
      >
        Reintentar
      </button>
    </div>
  );
}
