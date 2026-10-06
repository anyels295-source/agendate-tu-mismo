"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Selector de período para la página Reportes: presets rápidos (Hoy/Esta
 * semana/Este mes) más un rango de fechas personalizado. A diferencia del
 * "Exportar" viejo de Reservas (que solo bajaba las últimas 200 reservas
 * sin filtro de fecha visible), acá el período elegido controla la consulta
 * completa al servidor — ver agendate_ideas_originales_gap_analysis en
 * memoria del proyecto, gap #5.
 */
export default function ReportPeriodPicker({
  preset,
  from,
  to,
}: {
  preset: "today" | "week" | "month" | "custom";
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Los campos siguen al período que se está viendo (al elegir "Hoy" o "Esta semana" cambian solos).
  useEffect(() => {
    setCustomFrom(from);
    setCustomTo(to);
    setRangeError(null);
  }, [from, to]);

  const PRESETS: { key: "today" | "week" | "month"; label: string }[] = [
    { key: "today", label: "Hoy" },
    { key: "week", label: "Esta semana" },
    { key: "month", label: "Este mes" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {PRESETS.map((p) => {
        const active = preset === p.key;
        return (
          <Link
            key={p.key}
            href={`/admin/reportes?preset=${p.key}`}
            className="rounded-full border px-[13px] py-2 text-[12.5px] font-semibold"
            style={{
              borderColor: active ? "var(--brand)" : "var(--line-in)",
              background: active ? "var(--brand)" : "var(--surface)",
              color: active ? "#fff" : "#5a6884",
            }}
          >
            {p.label}
          </Link>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!customFrom || !customTo || customFrom > customTo) {
            setRangeError("La fecha inicial tiene que ser anterior o igual a la final.");
            return;
          }
          setRangeError(null);
          router.push(`/admin/reportes?from=${customFrom}&to=${customTo}`);
        }}
        className="flex items-center gap-1.5 rounded-full border border-[var(--line-in)] bg-[var(--surface)] px-2 py-1"
        style={preset === "custom" ? { borderColor: "var(--brand)" } : undefined}
      >
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          aria-label="Desde"
          className="w-[112px] rounded-md border-none bg-transparent px-1 py-1 text-[12.5px] font-semibold text-[var(--ink2)] focus:outline-none"
        />
        <span className="text-[12px] text-[var(--muted-nav)]">a</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          aria-label="Hasta"
          className="w-[112px] rounded-md border-none bg-transparent px-1 py-1 text-[12.5px] font-semibold text-[var(--ink2)] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-[12px] font-bold text-white"
        >
          Aplicar
        </button>
      </form>
      {rangeError && (
        <p role="alert" className="basis-full text-[12.5px] font-semibold text-red-600">
          {rangeError}
        </p>
      )}
    </div>
  );
}
