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
        type="date"
        defaultValue={currentDate}
        onChange={(e) => {
          if (e.target.value) router.push(`/admin/agenda?date=${e.target.value}`);
        }}
        aria-label="Ir a una fecha de la agenda"
        className="w-[122px] cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-[var(--ink2)] focus:outline-none"
      />
    </label>
  );
}
