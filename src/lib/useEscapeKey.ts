import { useEffect } from "react";

/** Cierra un modal/dropdown con la tecla Escape, para que sea operable por teclado. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}
