import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/professional";
import ReportPeriodPicker from "@/components/admin/ReportPeriodPicker";
import ReportExportButton, { type ReportRow } from "@/components/admin/ReportExportButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "Ausente",
};
const STATUS_META: Record<string, { bg: string; fg: string }> = {
  CONFIRMED: { bg: "#e4f6ec", fg: "#1a7d45" },
  PENDING: { bg: "#fdf1dc", fg: "#a4700f" },
  CANCELLED: { bg: "#eef1f7", fg: "#6b7280" },
  COMPLETED: { bg: "#e7effb", fg: "#215a8f" },
  NO_SHOW: { bg: "#fbe7e7", fg: "#b6382f" },
};
const STATUS_ORDER = ["CONFIRMED", "PENDING", "COMPLETED", "NO_SHOW", "CANCELLED"];

type Preset = "today" | "week" | "month" | "custom";

/**
 * Reportes por período real: a diferencia del "Exportar" de Reservas (que
 * siempre bajaba nada más las últimas 200 reservas del servidor, sin ningún
 * filtro de fecha visible), esta página deja elegir Hoy / Esta semana / Este
 * mes / un rango de fechas y consulta exactamente ese período completo —
 * sin tope de filas. Ver agendate_ideas_originales_gap_analysis en memoria
 * del proyecto, gap #5 (el único de los 5 pendientes que el usuario pidió
 * para esta ronda de demo, 2026-08-21).
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { preset: presetParam, from: fromParam, to: toParam } = await searchParams;
  const professional = await getActiveProfessional();
  const tz = professional.timezone;
  const now = DateTime.now().setZone(tz);

  let preset: Preset;
  let from: DateTime;
  let to: DateTime; // exclusivo
  let rangeNotice: string | null = null;

  if (fromParam && toParam) {
    const parsedFrom = DateTime.fromISO(fromParam, { zone: tz });
    const parsedTo = DateTime.fromISO(toParam, { zone: tz });
    if (parsedFrom.isValid && parsedTo.isValid && parsedTo >= parsedFrom) {
      preset = "custom";
      from = parsedFrom.startOf("day");
      to = parsedTo.startOf("day").plus({ days: 1 });
    } else {
      rangeNotice = "El rango de fechas no es válido (la fecha final es anterior a la inicial). Se muestra el mes actual.";
      preset = "month";
      from = now.startOf("month");
      to = from.plus({ months: 1 });
    }
  } else if (presetParam === "today") {
    preset = "today";
    from = now.startOf("day");
    to = from.plus({ days: 1 });
  } else if (presetParam === "week") {
    preset = "week";
    from = now.startOf("week");
    to = from.plus({ weeks: 1 });
  } else {
    preset = "month";
    from = now.startOf("month");
    to = from.plus({ months: 1 });
  }

  // Sin `take`: a diferencia de Reservas, este listado tiene que devolver
  // el período completo elegido, no un tope fijo de filas.
  const bookings = await prisma.booking.findMany({
    where: {
      professionalId: professional.id,
      startTime: { gte: from.toJSDate(), lt: to.toJSDate() },
    },
    include: { service: true },
    orderBy: { startTime: "asc" },
  });

  const rows: (ReportRow & { id: string; status: string })[] = bookings.map((b) => {
    const dt = DateTime.fromJSDate(b.startTime).setZone(tz).setLocale("es");
    return {
      id: b.id,
      dateLabel: dt.toFormat("d LLL yyyy"),
      timeLabel: dt.toFormat("HH:mm"),
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      serviceName: b.service?.name ?? professional.serviceName,
      status: b.status,
      statusLabel: STATUS_LABEL[b.status] ?? b.status,
    };
  });

  const totalsByStatus: Record<string, number> = {};
  for (const r of rows) totalsByStatus[r.status] = (totalsByStatus[r.status] ?? 0) + 1;

  const totalsByService = new Map<string, number>();
  for (const r of rows) totalsByService.set(r.serviceName, (totalsByService.get(r.serviceName) ?? 0) + 1);
  const topServices = [...totalsByService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxServiceCount = topServices[0]?.[1] ?? 0;

  const rangeLabel =
    preset === "today"
      ? from.setLocale("es").toFormat("d 'de' LLLL yyyy")
      : `${from.setLocale("es").toFormat("d LLL")} – ${to.minus({ days: 1 }).setLocale("es").toFormat("d LLL yyyy")}`;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[var(--ink)]">Reportes</h1>
          <div className="mt-[3px] text-[13.5px] font-semibold text-[var(--muted-nav)]">{rangeLabel}</div>
        </div>
        <ReportExportButton rows={rows} rangeLabel={rangeLabel} />
      </div>

      {rangeNotice && (
        <p role="alert" className="mb-3 rounded-lg bg-[#fdf1dc] px-3 py-2 text-[13px] font-semibold text-[#8a5d0b]">
          {rangeNotice}
        </p>
      )}

      <ReportPeriodPicker preset={preset} from={from.toISODate()!} to={to.minus({ days: 1 }).toISODate()!} />

      <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <StatCard label="Total turnos" value={rows.length} highlight />
        {STATUS_ORDER.map((s) => (
          <StatCard key={s} label={STATUS_LABEL[s]} value={totalsByStatus[s] ?? 0} />
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-3 text-[14px] font-extrabold text-[var(--ink)]">Servicios más pedidos</div>
          {topServices.length === 0 ? (
            <p className="text-[13px] text-[var(--muted-nav)]">Sin turnos en este período.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topServices.map(([name, count]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-[112px] shrink-0 truncate text-[12.5px] font-semibold text-[var(--ink2)]" title={name}>
                    {name}
                  </div>
                  <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)]"
                      style={{ width: `${maxServiceCount ? (count / maxServiceCount) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-6 shrink-0 text-right text-[12.5px] font-bold text-[var(--ink2)]">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-3 text-[14px] font-extrabold text-[var(--ink)]">Distribución por estado</div>
          {rows.length === 0 ? (
            <p className="text-[13px] text-[var(--muted-nav)]">Sin turnos en este período.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {STATUS_ORDER.filter((s) => (totalsByStatus[s] ?? 0) > 0).map((s) => {
                const meta = STATUS_META[s];
                const count = totalsByStatus[s] ?? 0;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span
                      className="w-[92px] shrink-0 rounded-full px-[9px] py-[3px] text-center text-[11px] font-bold"
                      style={{ background: meta.bg, color: meta.fg }}
                    >
                      {STATUS_LABEL[s]}
                    </span>
                    <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
                      <div className="h-full rounded-full" style={{ width: `${(count / rows.length) * 100}%`, background: meta.fg }} />
                    </div>
                    <div className="w-6 shrink-0 text-right text-[12.5px] font-bold text-[var(--ink2)]">{count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-[minmax(96px,1.2fr)_minmax(120px,1.4fr)_minmax(104px,1.1fr)_minmax(100px,1fr)_minmax(88px,.9fr)] bg-[var(--subtle)] p-[13px_20px] text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted-nav)]">
          <span>Fecha</span>
          <span>Cliente</span>
          <span className="hidden sm:block">Teléfono</span>
          <span className="hidden sm:block">Servicio</span>
          <span>Estado</span>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-11 text-center text-[14px] text-[var(--muted-nav)]">
            No hay turnos en este período.
          </div>
        )}
        {rows.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.PENDING;
          return (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(96px,1.2fr)_minmax(120px,1.4fr)_minmax(104px,1.1fr)_minmax(100px,1fr)_minmax(88px,.9fr)] items-center border-t border-[var(--line3)] p-[12px_20px] text-[13.5px]"
            >
              <div className="min-w-0">
                <div className="font-bold text-[var(--ink2)]">{r.dateLabel}</div>
                <div className="text-[12px] text-[var(--muted-nav)]">{r.timeLabel}</div>
              </div>
              <div className="min-w-0 truncate font-semibold text-[var(--ink2)]">{r.clientName}</div>
              <div className="hidden truncate text-[#5a6884] sm:block">{r.clientPhone ?? "—"}</div>
              <div className="hidden truncate text-[#5a6884] sm:block">{r.serviceName}</div>
              <div>
                <span
                  className="inline-block whitespace-nowrap rounded-full px-[10px] py-1 text-[11.5px] font-bold"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  {r.statusLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: highlight ? "var(--brand)" : "var(--line)",
        background: highlight ? "var(--brand-soft)" : "var(--surface)",
      }}
    >
      <div className="text-[22px] font-extrabold" style={{ color: highlight ? "var(--brand-dk)" : "var(--ink)" }}>
        {value}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold text-[var(--muted-nav)]">{label}</div>
    </div>
  );
}
