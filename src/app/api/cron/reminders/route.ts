import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { sendBookingReminderEmail } from "@/lib/notifications/email";
import { getInvitationResponses, syncPendingInvitations } from "@/lib/invitations";

/** Un turno reservado hace menos que esto no recibe recordatorio todavía: acaba de recibir la confirmación. */
const RECENT_BOOKING_HOURS = 12;

/**
 * Recordatorio por email a los clientes con turno hoy (más tarde) o mañana.
 *
 * El cron corre una sola vez por día, a las 09:00 de Montevideo. Por eso no mira solo
 * "mañana": un turno para mañana reservado después de esa hora recibe el recordatorio
 * en la corrida siguiente, el mismo día del turno. Se saltean los turnos reservados en las
 * últimas horas (el cliente acaba de recibir la confirmación) y los de clientes que
 * rechazaron la invitación del calendario.
 *
 * Lo dispara Vercel Cron una vez por día (ver vercel.json). Está protegido con
 * CRON_SECRET, igual que el resumen diario: Vercel manda ese secreto en el
 * encabezado Authorization. Cada turno se "reclama" antes de enviar
 * (reminderSentAt), así que si el cron se ejecuta dos veces no se manda el
 * mismo recordatorio dos veces.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET no configurado todavía." }, { status: 501 });
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const professionals = await prisma.professional.findMany({ where: { active: true, notifyEmail: true } });
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const professional of professionals) {
    const now = DateTime.now().setZone(professional.timezone);
    // Los pendientes que el cliente ya aceptó pasan a Confirmado antes de mandar nada.
    await syncPendingInvitations(professional.id);
    const bookings = await prisma.booking.findMany({
      where: {
        professionalId: professional.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { gt: now.toJSDate(), lte: now.plus({ days: 1 }).endOf("day").toJSDate() },
        createdAt: { lt: now.minus({ hours: RECENT_BOOKING_HOURS }).toJSDate() },
        reminderSentAt: null,
        clientEmail: { not: null },
      },
      include: { service: true },
    });

    // A quien rechazó la invitación no se le recuerda el turno.
    const connections = await prisma.calendarConnection.findMany({ where: { professionalId: professional.id, isActive: true } });
    const responses = await getInvitationResponses(connections, bookings);

    for (const booking of bookings) {
      if (responses.get(booking.id) === "declined") {
        skipped += 1;
        continue;
      }

      // Se reclama el turno antes de enviar: si otro proceso ya lo hizo, no se repite.
      const claimed = await prisma.booking.updateMany({
        where: { id: booking.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claimed.count !== 1 || !booking.clientEmail) {
        skipped += 1;
        continue;
      }

      const start = DateTime.fromJSDate(booking.startTime).setZone(professional.timezone).setLocale("es");
      const result = await sendBookingReminderEmail({
        toEmail: booking.clientEmail,
        clientName: booking.clientName,
        professionalName: professional.name,
        serviceName: booking.service?.name ?? professional.serviceName,
        dateLabel: start.toFormat("cccc d 'de' LLLL"),
        timeLabel: start.toFormat("HH:mm"),
        cancelUrl: `${appUrl}/cancelar/${booking.cancelToken}`,
        meetingUrl: booking.meetingUrl,
        isToday: start.hasSame(now, "day"),
      });

      await prisma.notificationLog.create({
        data: {
          bookingId: booking.id,
          channel: "EMAIL",
          status: result.status,
          error: result.status === "FAILED" ? result.error : result.status === "SKIPPED" ? result.reason : null,
        },
      });
      if (result.status === "SENT") sent += 1;
      else if (result.status === "FAILED") failed += 1;
      else skipped += 1;
    }
  }

  return NextResponse.json({ ok: true, professionalsProcessed: professionals.length, sent, failed, skipped });
}
