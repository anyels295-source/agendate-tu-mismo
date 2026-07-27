"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Error boundary del panel admin — reemplaza la pantalla de error genérica de Next.js. */
export default function AdminErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error no controlado en el panel admin:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7fb] p-6 text-center">
      <div className="mx-auto mb-4 flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#fdf1dc]">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#a4700f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h1 className="text-[20px] font-extrabold text-[#1f3864]">Algo no funcionó como esperábamos</h1>
      <p className="mt-2 max-w-[420px] text-[14.5px] leading-relaxed text-[#5a6884]">
        Es un problema temporal de nuestro lado — no se perdió ninguna reserva. Probá de nuevo en
        unos segundos.
      </p>
      <div className="mt-6 flex gap-2.5">
        <Link
          href="/admin"
          className="rounded-[11px] border border-[#d6deeb] bg-white px-5 py-3 text-[14px] font-semibold text-[#2a3856]"
        >
          Volver al panel
        </Link>
        <button onClick={reset} className="rounded-[11px] bg-[#215a8f] px-5 py-3 text-[14px] font-bold text-white">
          Reintentar
        </button>
      </div>
    </div>
  );
}
