import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import type { Professional } from "@prisma/client";
import { type WorkingHours, workingMinutesForWeek } from "@/lib/types";

/**
 * Resumen diario de la agenda de un profesional, para mandar por email cada
 * mañana sin que tenga que entrar al Panel a buscarlo.
 *
 * Ambas ideas originales lo piden explícitamente: 68ZG6 ("reportes que
 * muestren los compromisos por día, semana") y 5C2F5 - Agente AgendaFácil
 * ("resumen diario o semanal de eventos en la agenda, vía email, móvil o
 * Teams/Slack"). Esta es una primera versión sin IA — reutiliza los mismos
 * datos que ya calcula el Panel — pensada como paso intermedio antes del
 * agente de IA completo (ver agendate_ideas_originales_gap_analysis en
 * memoria del proyecto).
 */

export type DailySummary = {
  professional: Professional;
  dateLabel: string;
  bookingsToday: Array<{
    id: string;
    clientName: string;
    clientPhone: string;
    timeLabel: string;
    serviceName: string;
    status: string;
  }>;
  totalToday: number;
  failedNotificationsYesterday: number;
  bookingsThisWeekCount: number;
  occupancyThisWeek: number;
  cancelledThisMonthCount: number;
};

export async function buildDailySummary(professional: Professional, now: DateTime): Promise<DailySummary> {
  const tz = professional.timezone;
  const today = now.setZone(tz);
  const startOfDay = today.startOf("day");
  const endOfDay = today.endOf("day");

  const bookings = await prisma.booking.findMany({
    where: {
      professionalId: professional.id,
      startTime: { gte: startOfDay.toJSDate(), lte: endOfDay.toJSDate() },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { service: true },
    orderBy: { startTime: "asc" },
  });

  const failedSince = today.minus({ days: 1 }).toJSDate();
  const failedNotificationsYesterday = await prisma.notificationLog.count({
    where: { status: "FAILED", sentAt: { gte: failedSince }, booking: { professionalId: professional.id } },
  });

  const startOfWeek = today.startOf("week");
  const endOfWeek = today.endOf("week");
  const startOfMonth = today.startOf("month");
  const endOfMonth = today.endOf("month");

  const rangeStart = DateTime.min(startOfWeek, startOfMonth);

  const bookingsRange = await prisma.booking.findMany({
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

  const thisWeek = bookingsRange.filter((b) => isCountable(b.status) && inRange(b.startTime, startOfWeek, endOfWeek));
  const cancelledThisMonth = bookingsRange.filter((b) => b.status === "CANCELLED" && inRange(b.startTime, startOfMonth, endOfMonth));

  const minutesOf = (list: typeof bookingsRange) => list.reduce((sum, b) => sum + (b.endTime.getTime() - b.startTime.getTime()) / 60000, 0);
  const availableMinutes = workingMinutesForWeek(professional.workingHours as unknown as WorkingHours);
  const occupancyThisWeek = availableMinutes > 0 ? Math.min(100, Math.round((minutesOf(thisWeek) / availableMinutes) * 100)) : 0;

  return {
    professional,
    dateLabel: today.setLocale("es").toFormat("cccc d 'de' LLLL"),
    bookingsToday: bookings.map((b) => ({
      id: b.id,
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      timeLabel: DateTime.fromJSDate(b.startTime).setZone(tz).toFormat("HH:mm"),
      serviceName: b.service?.name ?? professional.serviceName,
      status: b.status,
    })),
    totalToday: bookings.length,
    failedNotificationsYesterday,
    bookingsThisWeekCount: thisWeek.length,
    occupancyThisWeek,
    cancelledThisMonthCount: cancelledThisMonth.length,
  };
}
