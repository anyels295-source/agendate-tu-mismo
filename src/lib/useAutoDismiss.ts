import { useEffect } from "react";

/** Limpia un aviso (toast) solo, a los `ms` milisegundos de mostrarse. */
export function useAutoDismiss(value: string | null, set: (value: null) => void, ms = 6000) {
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => set(null), ms);
    return () => clearTimeout(timer);
  }, [value, set, ms]);
}
