import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/professional";
import type { WorkingHours } from "@/lib/types";
import CopyLinkButton from "@/components/admin/CopyLinkButton";

export const dynamic = "force-dynamic";

const WEEKDAY_KEYS: (keyof WorkingHours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function workingMinutesForWeek(workingHours: WorkingHours): number {
  return WEEKDAY_KEYS.reduce((total, key) => {
    const ranges = workingHours[key] ?? [];
    const dayMinutes = ranges.reduce((sum, r) => {
      const [sh, sm] = r.start.split(":").map(Number);
      const [eh, em] = r.end.split(":").map(Number);
      return sum + (eh * 60 + em - (sh * 60 + sm));
    }, 0);
    return total + dayMinutes;
  }, 0);
}

function trendBadge(current: number, previous: number, invertColor = false) {
  if (previous === 0) return { trend: null as string | null, up: true };
  const delta = Math.round(((current - previous) / previous) * 100);
  const up = delta >= 0;
  return { trend: `${up ? "▲" : "▼"} ${Math.abs(delta)}%`, up: invertColor ? !up : up };
}

export default async function PanelPage() {
  const professional = await getActiveProfessional();
  const tz = professional.timezone;
  const now = DateTime.now().setZone(tz);
  const startOfWeek = now.startOf("week");
  const endOfWeek = now.endOf("week");
  const startOfLastWeek = startOfWeek.minus({ weeks: 1 });
  const startOfMonth = now.startOf("month");
  const endOfMonth = now.endOf("month");
  const startOfLastMonth = startOfMonth.minus({ months: 1 });

  const rangeStart = DateTime.min(startOfLastWeek, startOfLastMonth);

  const bookings = await prisma.booking.findMany({
    where: {
      professionalId: professional.id,
      startTime: { gte: rangeStart.toJSDate(), lte: endOfMonth.toJSDate() },
    },
    include: { service: true },
    orderBy: { startTime: "asc" },
  });

  const isCountable = (status: string) => status === "CONFIRMED" || status === "COMPLETED";
  const inRange = (d: Date, from: DateTime, to: DateTime) => {
    const dt = DateTime.fromJSDate(d).setZone(tz);
    return dt >= from && dt <= to;
  };

  const thisWeek = bookings.filter((b) => isCountable(b.status) && inRange(b.startTime, startOfWeek, endOfWeek));
  const lastWeek = bookings.filter((b) => isCountable(b.status) && inRange(b.startTime, startOfLastWeek, startOfWeek.minus({ seconds: 1 })));
  const thisMonth = bookings.filter((b) => isCountable(b.status) && inRange(b.startTime, startOfMonth, endOfMonth));
  const lastMonth = bookings.filter((b) => isCountable(b.status) && inRange(b.startTime, startOfLastMonth, startOfMonth.minus({ seconds: 1 })));
  const cancelledThisMonth = bookings.filter((b) => b.status === "CANCELLED" && inRange(b.startTime, startOfMonth, endOfMonth));
  const cancelledLastMonth = bookings.filter((b) => b.status === "CANCELLED" && inRange(b.startTime, startOfLastMonth, startOfMonth.minus({ seconds: 1 })));

  const minutesOf = (list: typeof bookings) => list.reduce((sum, b) => sum + (b.endTime.getTime() - b.startTime.getTime()) / 60000, 0);
  const availableMinutes = workingMinutesForWeek(professional.workingHours as unknown as WorkingHours);
  const occupancy = availableMinutes > 0 ? Math.min(100, Math.round((minutesOf(thisWeek) / availableMinutes) * 100)) : 0;
  const occupancyLastWeek = availableMinutes > 0 ? Math.min(100, Math.round((minutesOf(lastWeek) / availableMinutes) * 100)) : 0;

  const weekTrend = trendBadge(thisWeek.length, lastWeek.length);
  const monthTrend = trendBadge(thisMonth.length, lastMonth.length);
  const cancelTrend = trendBadge(cancelledThisMonth.length, cancelledLastMonth.length, true);
  const occTrend = trendBadge(occupancy, occupancyLastWeek);

  const GREEN = { bg: "#e4f6ec", fg: "#1a7d45" };
  const BLUE = { bg: "#e7effb", fg: "#215a8f" };

  const metrics = [
    { label: "Turnos esta semana", value: String(thisWeek.length), sub: lastWeek.length ? "vs. semana pasada" : "sin datos de la semana pasada", trend: weekTrend.trend, ...(weekTrend.up ? GREEN : BLUE) },
    { label: "Turnos este mes", value: String(thisMonth.length), sub: "confirmados y completados", trend: monthTrend.trend, ...(monthTrend.up ? GREEN : BLUE) },
    { label: "Cancelaciones", value: String(cancelledThisMonth.length), sub: "este mes", trend: cancelTrend.trend, ...(cancelTrend.up ? GREEN : BLUE) },
    { label: "Ocupación", value: `${occupancy}%`, sub: "de tu agenda esta semana", trend: occTrend.trend, ...(occTrend.up ? GREEN : BLUE) },
  ];

  const chart = WEEKDAY_KEYS.map((_, i) => {
    const day = startOfWeek.plus({ days: i });
    const count = thisWeek.filter((b) => DateTime.fromJSDate(b.startTime).setZone(tz).hasSame(day, "day")).length;
    return { label: WEEKDAY_LABELS[i], count, isToday: day.hasSame(now, "day") };
  });
  const maxChart = Math.max(1, ...chart.map((c) => c.count));

  const upcoming = bookings
    .filter((b) => (b.status === "PENDING" || b.status === "CONFIRMED") && DateTime.fromJSDate(b.startTime) >= now)
    .slice(0, 5);

  const STATUS_LABEL: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada" };
  const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
    PENDING: { bg: "#fdf1dc", fg: "#a4700f" },
    CONFIRMED: { bg: "#e4f6ec", fg: "#1a7d45" },
  };

  const bookingUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reservar/${professional.slug}`;
  const bookingUrlDisplay = bookingUrl.replace(/^https?:\/\//, "");
  const connectedCount = await prisma.calendarConnection.count({ where: { professionalId: professional.id } });

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-[3px] text-[13px] font-semibold text-[#6b7280]">Hola de nuevo, {professional.name.split(" ")[0]}</div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[#16233d]">Panel</h1>
        </div>
        <div className="flex items-center gap-2.5 rounded-[11px] border border-[#e7ecf4] bg-white px-[13px] py-[9px] text-[13px] text-[#4a5878]">
          <span className="h-[9px] w-[9px] rounded-full bg-[#2e74b5]" />
          {connectedCount > 0 ? "Calendarios sincronizados" : "Sin calendarios conectados todavía"}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-[#e7ecf4] bg-white p-[18px_18px_16px]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-[#6b7280]">{m.label}</span>
              {m.trend && (
                <span className="rounded-full px-[7px] py-[2px] text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>
                  {m.trend}
                </span>
              )}
            </div>
            <div className="text-[30px] font-extrabold tracking-tight text-[#1f3864]">{m.value}</div>
            <div className="mt-0.5 text-[12px] text-[#6b7280]">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[#e7ecf4] bg-white p-[22px_24px]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-bold text-[#22314f]">Turnos por día</div>
              <div className="text-[12.5px] text-[#6b7280]">Esta semana</div>
            </div>
            <div className="rounded-lg bg-[#eef4fb] px-[11px] py-[5px] text-[12px] font-semibold text-[#4a5878]">Ocupación {occupancy}%</div>
          </div>
          <div className="flex h-[170px] items-end gap-3.5 pt-2">
            {chart.map((c) => (
              <div key={c.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[12px] font-bold text-[#22314f]">{c.count}</span>
                <div
                  className="w-full max-w-[34px] rounded-t-[8px] rounded-b-[3px]"
                  style={{
                    height: `${Math.max((c.count / maxChart) * 100, 3)}%`,
                    background: c.isToday ? "linear-gradient(180deg,#2e74b5,#215a8f)" : "#cfe0f2",
                  }}
                />
                <span className="text-[11.5px] font-semibold text-[#6b7280]">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#e7ecf4] bg-white p-[22px_22px_8px]">
          <div className="mb-1 text-[15px] font-bold text-[#22314f]">Próximos turnos</div>
          <div className="mb-3.5 text-[12.5px] text-[#6b7280]">Hoy y los próximos días</div>
          {upcoming.length === 0 ? (
            <p className="pb-4 text-sm text-[#6b7280]">No hay turnos próximos.</p>
          ) : (
            <div className="flex flex-col">
              {upcoming.map((b) => {
                const dt = DateTime.fromJSDate(b.startTime).setZone(tz).setLocale("es");
                const when = dt.hasSame(now, "day") ? "Hoy" : dt.hasSame(now.plus({ days: 1 }), "day") ? "Mañana" : dt.toFormat("d LLL");
                const sc = STATUS_COLOR[b.status];
                return (
                  <div key={b.id} className="flex items-center gap-3.5 border-t border-[#f0f3f8] py-2.5">
                    <div className="w-[46px] shrink-0 text-center">
                      <div className="text-[15px] font-extrabold leading-none text-[#215a8f]">{dt.toFormat("HH:mm")}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold text-[#6b7280]">{when}</div>
                    </div>
                    <div className="w-px self-stretch bg-[#eef1f7]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-[#2a3856]">{b.clientName}</div>
                      <div className="truncate text-[12px] text-[#6b7280]">{b.service?.name ?? professional.serviceName}</div>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-bold" style={{ background: sc.bg, color: sc.fg }}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-[#1f3864] to-[#2e74b5] px-6 py-5 text-white">
        <div>
          <div className="mb-0.5 text-[15px] font-bold">Tu página de reserva</div>
          <div className="text-[13px] opacity-85">{bookingUrlDisplay}</div>
        </div>
        <div className="flex gap-2.5">
          <CopyLinkButton url={bookingUrl} className="rounded-lg bg-white/15 px-[15px] py-[9px] text-[13px] font-semibold text-white" />
          <a href={bookingUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-[15px] py-[9px] text-[13px] font-bold text-[#1f3864]">
            Ver página
          </a>
        </div>
      </div>
    </div>
  );
}
