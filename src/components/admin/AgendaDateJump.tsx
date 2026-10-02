"use client";

import { useRouter } from "next/navigation";
import { IconCalendarSmall } from "./icons";

/**
 * Selector de fecha para saltar directamente a cualquier semana de la Agenda,
 * en vez de depender solo de las flechas prev/next y "Hoy". Ver
 * agendate_ideas_originales_gap_analysis en memoria del proyecto — mejora
 * pedida el 2026-08-20 ("un calendario tipo filtro" para navegar la agenda).
 */
export default function AgendaDateJump({ currentDate }: { currentDate: string }) {
  const router = useRouter();

  return (
    <label className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[var(--line-btn)] bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--ink2)]">
      <IconCalendarSmall className="shrink-0 text-[var(--muted-nav)]" />
      <input
        key={currentDate}
        type="date"
        min="2020-01-01"
        max="2100-12-31"
        defaultValue={currentDate}
        onChange={(e) => {
          // Mientras se tipea el año, el navegador emite fechas intermedias
          // (0002, 0020, 20265…): solo se navega con una fecha completa y razonable.
          const value = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "2020-01-01" && value <= "2100-12-31") {
            router.push(`/admin/agenda?date=${value}`);
          }
        }}
        aria-label="Ir a una fecha de la agenda"
        className="w-[122px] cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-[var(--ink2)] focus:outline-none"
      />
    </label>
  );
}
