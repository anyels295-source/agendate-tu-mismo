import { DateTime } from "luxon";
import type { Professional } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expireUnconfirmedBooking } from "@/lib/booking";
import { sendConfirmationRequestEmail } from "@/lib/notifications/email";

/**
 * Turnos que siguen Pendientes: el cron diario le pide al cliente que confirme y, si en 24 h
 * no lo hizo, cancela el turno para liberar el horario.
 *
 * Así un turno falso (un bot, o alguien que puso el email de otra persona) no ocupa la agenda
 * para siempre: nadie lo confirma y se cancela solo. El cliente confirma desde /confirmar/[token].
 * Los turnos Pendientes ya no llevan invitado en el calendario (la invitación sale al confirmar);
 * syncPendingInvitations sigue confirmando los turnos viejos que sí la tenían.
 */

/** Un turno reservado hace menos que esto no recibe el pedido todavía: acaba de recibir el email de turno registrado. */
const REQUEST_AFTER_HOURS = 12;
/**
 * Plazo para confirmar. El cron corre una vez por día, así que en la práctica se cancela en la
 * corrida siguiente al pedido. Se usa 23 h y no 24 para que unos minutos de diferencia en la
 * hora de ejecución del cron no lo pasen a un día más tarde.
 */
const CONFIRMATION_DEADLINE_HOURS = 23;

export async function processPendingConfirmations(professional: Professional, appUrl: string) {
  const now = DateTime.now();
  let requested = 0;
  let requestFailed = 0;
  let expired = 0;
  /** Turnos a los que se les pidió confirmación en esta corrida: no reciben además el recordatorio. */
  const requestedIds = new Set<string>();

  // 1. Cancelar los que pasaron el plazo sin confirmar. Solo turnos futuros: uno que ya pasó no ocupa nada.
  const overdue = await prisma.booking.findMany({
    where: {
      professionalId: professional.id,
      status: "PENDING",
      startTime: { gt: now.toJSDate() },
      confirmationRequestedAt: { lte: now.minus({ hours: CONFIRMATION_DEADLINE_HOURS }).toJSDate() },
    },
    select: { id: true },
  });
  for (const booking of overdue) {
    try {
      if (await expireUnconfirmedBooking(booking.id)) expired += 1;
    } catch (err) {
      // Un error transitorio del calendario: se reintenta en la próxima corrida.
      console.error("No se pudo cancelar un turno sin confirmar:", err);
    }
  }

  // 2. Pedir confirmación a los pendientes que todavía no la recibieron.
  const toRequest = await prisma.booking.findMany({
    where: {
      professionalId: professional.id,
      status: "PENDING",
      startTime: { gt: now.toJSDate() },
      createdAt: { lt: now.minus({ hours: REQUEST_AFTER_HOURS }).toJSDate() },
      confirmationRequestedAt: null,
      clientEmail: { not: null },
    },
    include: { service: true },
  });
  for (const booking of toRequest) {
    // Se reclama el turno antes de enviar: si el cron corre dos veces, no se manda dos veces.
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: "PENDING", confirmationRequestedAt: null },
      data: { confirmationRequestedAt: new Date() },
    });
    if (claimed.count !== 1 || !booking.clientEmail) continue;

    const start = DateTime.fromJSDate(booking.startTime).setZone(professional.timezone).setLocale("es");
    const result = await sendConfirmationRequestEmail({
      toEmail: booking.clientEmail,
      clientName: booking.clientName,
      professionalName: professional.name,
      serviceName: booking.service?.name ?? professional.serviceName,
      dateLabel: start.toFormat("cccc d 'de' LLLL"),
      timeLabel: start.toFormat("HH:mm"),
      cancelUrl: `${appUrl}/cancelar/${booking.cancelToken}`,
      confirmUrl: `${appUrl}/confirmar/${booking.cancelToken}`,
      bookingUrl: `${appUrl}/reservar/${professional.slug}`,
    });

    await prisma.notificationLog.create({
      data: {
        bookingId: booking.id,
        channel: "EMAIL",
        status: result.status,
        error: result.status === "FAILED" ? `[cliente] ${result.error}` : result.status === "SKIPPED" ? `[cliente] ${result.reason}` : null,
      },
    });

    if (result.status === "SENT") {
      requested += 1;
      requestedIds.add(booking.id);
    } else {
      // Si el email no salió, el cliente no se enteró del plazo: no se le puede cancelar el
      // turno por no responder. Se vuelve a intentar en la próxima corrida.
      requestFailed += 1;
      await prisma.booking.updateMany({ where: { id: booking.id, status: "PENDING" }, data: { confirmationRequestedAt: null } });
    }
  }

  return { requested, requestFailed, expired, requestedIds };
}
