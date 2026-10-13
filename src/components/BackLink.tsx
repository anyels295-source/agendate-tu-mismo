"use client";

import { useRouter } from "next/navigation";

/**
 * "← Volver" de las páginas legales: vuelve a la página de la que se vino (por
 * ejemplo, la página de reservas). Si se entró directo, o se abrió en una pestaña
 * nueva, no hay a dónde volver dentro de la app y lleva a la página principal.
 */
export default function BackLink() {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // document.referrer no cambia en las navegaciones internas de Next (solo en la
    // primera carga), así que no sirve para saber si se vino de esta misma app. Se
    // vuelve atrás siempre que haya historial, salvo que se haya entrado desde otro sitio.
    const cameFromOtherSite = document.referrer !== "" && !document.referrer.startsWith(window.location.origin);
    if (window.history.length > 1 && !cameFromOtherSite) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <a href="/" onClick={handleClick} className="text-sm font-medium text-brand-600 hover:text-brand-700">
      ← Volver
    </a>
  );
}
