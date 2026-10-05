import Link from "next/link";
import { getPublicBaseUrl } from "@/lib/publicUrl";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/professional";
import { type WorkingHours, WEEKDAY_KEYS, workingMinutesForWeek } from "@/lib/types";
import CopyLinkButton from "@/components/admin/CopyLinkButton";
import ShareWhatsAppButton from "@/components/admin/ShareWhatsAppButton";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const NOTIF_CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  TEAMS: "Teams",
};
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
  const BLUE = { bg: "#e7effb", fg: "var(--brand)" };

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

  const bookingUrl = `${await getPublicBaseUrl()}/reservar/${professional.slug}`;
  const bookingUrlDisplay = bookingUrl.replace(/^https?:\/\//, "");
  const connections = await prisma.calendarConnection.findMany({
    where: { professionalId: professional.id },
    select: { id: true, isActive: true },
  });
  const activeConnections = connections.filter((c) => c.isActive);
  const connectedCount = activeConnections.length;
  const bookingCalendarChosen = !!professional.bookingCalendarId && activeConnections.some((c) => c.id === professional.bookingCalendarId);
  const calendarStatus =
    connectedCount === 0
      ? { label: connections.length > 0 ? "Hay un calendario para reconectar" : "Sin calendarios conectados todavía", warn: true }
      : !bookingCalendarChosen
        ? { label: "Elegí el calendario de reservas", warn: true }
        : { label: "Calendarios sincronizados", warn: false };
  // Turnos que ya empezaron y siguen pendientes o confirmados: falta cerrarlos.
  const toCloseCount = await prisma.booking.count({
    where: { professionalId: professional.id, status: { in: ["PENDING", "CONFIRMED"] }, startTime: { lt: now.toJSDate() } },
  });

  // Los envíos fallidos quedan registrados en NotificationLog pero antes no
  // se mostraban en ningún lado del panel — el profesional podía no enterarse
  // nunca de que un cliente no recibió su confirmación/aviso. Se muestran acá
  // los de los últimos 7 días como alerta, con hasta 5 ejemplos.
  const failedSince = now.minus({ days: 7 }).toJSDate();
  const failedNotificationsWhere = {
    status: "FAILED" as const,
    sentAt: { gte: failedSince },
    booking: { professionalId: professional.id },
  };
  const [failedNotificationsTotal, failedNotifications] = await Promise.all([
    prisma.notificationLog.count({ where: failedNotificationsWhere }),
    prisma.notificationLog.findMany({
      where: failedNotificationsWhere,
      include: { booking: { select: { clientName: true } } },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-[3px] text-[13px] font-semibold text-[var(--muted-nav)]">Hola de nuevo, {professional.name.split(" ")[0]}</div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[var(--ink)]">Panel</h1>
        </div>
        {calendarStatus.warn ? (
          <Link
            href="/admin/calendarios"
            className="flex items-center gap-2.5 rounded-[11px] border border-[#f0d199] bg-[#fdf1dc] px-[13px] py-[9px] text-[13px] font-semibold text-[#8a5d0b]"
          >
            <span className="h-[9px] w-[9px] rounded-full bg-[#d9a21b]" />
            {calendarStatus.label}
          </Link>
        ) : (
          <div className="flex items-center gap-2.5 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-[13px] py-[9px] text-[13px] text-[var(--ink4)]">
            <span className="h-[9px] w-[9px] rounded-full bg-[var(--brand-lt)]" />
            {calendarStatus.label}
          </div>
        )}
      </div>

      {failedNotificationsTotal > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#f3c6c2] bg-[#fbe7e7] px-5 py-4">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#b6382f] text-[12px] font-extrabold text-white">
            !
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold text-[#8a241d]">
              {failedNotificationsTotal === 1
                ? "1 notificación no se pudo enviar en los últimos 7 días"
                : `${failedNotificationsTotal} notificaciones no se pudieron enviar en los últimos 7 días`}
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5 text-[12.5px] text-[#a5342b]">
              {failedNotifications.map((n) => (
                <span key={n.id} className="truncate">
                  {NOTIF_CHANNEL_LABEL[n.channel] ?? n.channel} · {n.booking.clientName} ·{" "}
                  {DateTime.fromJSDate(n.sentAt).setZone(tz).setLocale("es").toFormat("d LLL, HH:mm")}
                  {n.error ? ` · ${n.error.slice(0, 90)}` : ""}
                </span>
              ))}
              {failedNotificationsTotal > failedNotifications.length && (
                <span className="text-[12px] opacity-80">
                  y {failedNotificationsTotal - failedNotifications.length} más.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {toCloseCount > 0 && (
        <Link
          href="/admin/reservas?filter=toClose"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-[#f0d199] bg-[#fdf1dc] px-5 py-3.5 text-[13.5px] font-semibold text-[#8a5d0b]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d9a21b] text-[12px] font-extrabold text-white">!</span>
          <span className="min-w-0 flex-1">
            {toCloseCount === 1
              ? "1 turno ya pasó y sigue sin cerrar. Marcalo como completado o ausente."
              : `${toCloseCount} turnos ya pasaron y siguen sin cerrar. Marcalos como completados o ausentes.`}
          </span>
          <span className="shrink-0 text-[12.5px] underline">Ver turnos</span>
        </Link>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-[18px_18px_16px]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-[var(--muted-nav)]">{m.label}</span>
              {m.trend && (
                <span className="rounded-full px-[7px] py-[2px] text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>
                  {m.trend}
                </span>
              )}
            </div>
            <div className="text-[30px] font-extrabold tracking-tight text-[var(--brand-dk)]">{m.value}</div>
            <div className="mt-0.5 text-[12px] text-[var(--muted-nav)]">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-[22px_24px]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-bold text-[var(--ink3)]">Turnos por día</div>
              <div className="text-[12.5px] text-[var(--muted-nav)]">Esta semana</div>
            </div>
            <div className="rounded-lg bg-[var(--brand-soft)] px-[11px] py-[5px] text-[12px] font-semibold text-[var(--ink4)]">Ocupación {occupancy}%</div>
          </div>
          <div className="flex h-[170px] items-end gap-2 pt-2 sm:gap-3.5">
            {chart.map((c) => (
              <div key={c.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[12px] font-bold text-[var(--ink3)]">{c.count}</span>
                <div
                  className="w-full max-w-[34px] rounded-t-[8px] rounded-b-[3px]"
                  style={{
                    height: `${Math.max((c.count / maxChart) * 100, 3)}%`,
                    background: c.isToday ? "linear-gradient(180deg,var(--brand-lt),var(--brand))" : "#cfe0f2",
                  }}
                />
                <span className="text-[11.5px] font-semibold text-[var(--muted-nav)]">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-[22px_22px_8px]">
          <div className="mb-1 text-[15px] font-bold text-[var(--ink3)]">Próximos turnos</div>
          <div className="mb-3.5 text-[12.5px] text-[var(--muted-nav)]">Hoy y los próximos días</div>
          {upcoming.length === 0 ? (
            <p className="pb-4 text-sm text-[var(--muted-nav)]">No hay turnos próximos.</p>
          ) : (
            <div className="flex flex-col">
              {upcoming.map((b) => {
                const dt = DateTime.fromJSDate(b.startTime).setZone(tz).setLocale("es");
                const when = dt.hasSame(now, "day") ? "Hoy" : dt.hasSame(now.plus({ days: 1 }), "day") ? "Mañana" : dt.toFormat("d LLL");
                const sc = STATUS_COLOR[b.status];
                return (
                  <div key={b.id} className="flex items-center gap-3.5 border-t border-[#f0f3f8] py-2.5">
                    <div className="w-[46px] shrink-0 text-center">
                      <div className="text-[15px] font-extrabold leading-none text-[var(--brand)]">{dt.toFormat("HH:mm")}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold text-[var(--muted-nav)]">{when}</div>
                    </div>
                    <div className="w-px self-stretch bg-[var(--line2)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-[var(--ink2)]">{b.clientName}</div>
                      <div className="truncate text-[12px] text-[var(--muted-nav)]">{b.service?.name ?? professional.serviceName}</div>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-[var(--brand-dk)] to-[var(--brand-lt)] px-6 py-5 text-white">
        <div>
          <div className="mb-0.5 text-[15px] font-bold">Tu página de reserva</div>
          <div className="text-[13px] opacity-85">{bookingUrlDisplay}</div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ShareWhatsAppButton
            url={bookingUrl}
            professionalName={professional.name}
            className="flex items-center gap-1.5 rounded-lg bg-[#25d366] px-[15px] py-[9px] text-[13px] font-bold text-white"
          />
          <CopyLinkButton url={bookingUrl} className="rounded-lg bg-white/15 px-[15px] py-[9px] text-[13px] font-semibold text-white" />
          <a href={bookingUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-[15px] py-[9px] text-[13px] font-bold text-[var(--brand-dk)]">
            Ver página
          </a>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "Panel" };
