import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { sendBookingReminderEmail } from "@/lib/notifications/email";

/**
 * Recordatorio por email, el día anterior, a los clientes con turno mañana.
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
    const tomorrow = DateTime.now().setZone(professional.timezone).plus({ days: 1 });
    const bookings = await prisma.booking.findMany({
      where: {
        professionalId: professional.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { gte: tomorrow.startOf("day").toJSDate(), lte: tomorrow.endOf("day").toJSDate() },
        reminderSentAt: null,
        clientEmail: { not: null },
      },
      include: { service: true },
    });

    for (const booking of bookings) {
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
