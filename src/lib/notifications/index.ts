import { prisma } from "@/lib/prisma";
import { sendBookingConfirmationWhatsApp } from "./whatsapp";
import { sendBookingConfirmationEmail } from "./email";
import type { Booking, Professional } from "@prisma/client";
import { DateTime } from "luxon";

/**
 * Punto único desde el que se disparan las confirmaciones. Intenta WhatsApp
 * primero (canal principal validado en el mercado uruguayo); si falla o no
 * hay teléfono, cae a email. Cada intento queda registrado en
 * NotificationLog para trazabilidad ante el cliente y para depurar el piloto.
 */
export async function notifyBookingConfirmed(booking: Booking, professional: Professional) {
  const dt = DateTime.fromJSDate(booking.startTime).setZone(professional.timezone).setLocale("es");
  const dateLabel = dt.toFormat("cccc d 'de' LLLL");
  const timeLabel = dt.toFormat("HH:mm");
  const cancelUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/cancelar/${booking.cancelToken}`;

  const whatsappResult = await sendBookingConfirmationWhatsApp({
    toPhone: booking.clientPhone,
    clientName: booking.clientName,
    professionalName: professional.name,
    serviceName: professional.serviceName,
    dateLabel,
    timeLabel,
    cancelUrl,
  });

  await prisma.notificationLog.create({
    data: {
      bookingId: booking.id,
      channel: "WHATSAPP",
      status: whatsappResult.status,
      error: whatsappResult.status === "FAILED" ? whatsappResult.error : whatsappResult.status === "SKIPPED" ? whatsappResult.reason : null,
    },
  });

  // Email siempre se intenta también como respaldo si el cliente dejó email,
  // independientemente de si WhatsApp funcionó (redundancia deliberada en el piloto).
  if (booking.clientEmail) {
    const emailResult = await sendBookingConfirmationEmail({
      toEmail: booking.clientEmail,
      clientName: booking.clientName,
      professionalName: professional.name,
      serviceName: professional.serviceName,
      dateLabel,
      timeLabel,
      cancelUrl,
    });

    await prisma.notificationLog.create({
      data: {
        bookingId: booking.id,
        channel: "EMAIL",
        status: emailResult.status,
        error: emailResult.status === "FAILED" ? emailResult.error : emailResult.status === "SKIPPED" ? emailResult.reason : null,
      },
    });
  }
}
