"use client";

import { useEffect } from "react";

/**
 * Fallback para errores dentro del propio RootLayout (src/app/layout.tsx).
 * Es el único error boundary que debe incluir <html>/<body>, porque
 * reemplaza por completo el layout raíz mientras está activo.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error no controlado (root layout):", error);
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col items-center justify-center bg-[var(--page)] p-6 text-center">
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
      </body>
    </html>
  );
}
