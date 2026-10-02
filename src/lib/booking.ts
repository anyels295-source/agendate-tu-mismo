import { prisma } from "@/lib/prisma";
import { isSlotStillFree } from "@/lib/availability";
import { getValidAccessToken } from "@/lib/calendar/tokenManager";
import { createGoogleEvent, deleteGoogleEvent } from "@/lib/calendar/google";
import { createOutlookEvent, deleteOutlookEvent } from "@/lib/calendar/outlook";
import { notifyBookingConfirmed, notifyBookingRescheduled, notifyBookingCancelled } from "@/lib/notifications";
import { AppError } from "@/lib/errors";
import type { BookingStatus } from "@prisma/client";

export class BookingConflictError extends AppError {
  constructor() {
    super("El horario elegido ya no está disponible. Por favor elegí otro horario.");
  }
}

export async function createBooking(params: {
  professionalId: string;
  serviceId?: string;
  clientName: string;
  clientEmail?: string;
  /** Opcional: el email es el contacto obligatorio, WhatsApp es un canal extra. */
  clientPhone?: string;
  startISO: string;
  endISO: string;
  notes?: string;
}) {
  const professional = await prisma.professional.findUnique({
    where: { id: params.professionalId },
    include: { calendarConnections: true },
  });
  if (!professional || !professional.active) {
    throw new AppError("Profesional no encontrado o inactivo.");
  }
  if (professional.calendarConnections.length === 0) {
    throw new AppError("El profesional todavía no conectó ningún calendario.");
  }

  const service = params.serviceId
    ? await prisma.service.findFirst({ where: { id: params.serviceId, professionalId: professional.id, active: true } })
    : null;
  if (params.serviceId && !service) {
    throw new AppError("El servicio elegido no existe o ya no está disponible.");
  }
  const serviceLabel = service?.name ?? professional.serviceName;

  const stillFree = await isSlotStillFree({
    professional,
    connections: professional.calendarConnections,
    startISO: params.startISO,
    endISO: params.endISO,
  });
  if (!stillFree) {
    throw new BookingConflictError();
  }

  // Elegimos la conexión "de reserva" configurada por el profesional; si no
  // configuró ninguna, usamos la primera conectada (comportamiento por defecto
  // razonable para el piloto de un solo profesional con un solo calendario).
  const bookingConnection =
    professional.calendarConnections.find((c) => c.id === professional.bookingCalendarId) ??
    professional.calendarConnections[0];

  const booking = await prisma.booking.create({
    data: {
      professionalId: professional.id,
      serviceId: service?.id,
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      clientPhone: params.clientPhone,
      startTime: new Date(params.startISO),
      endTime: new Date(params.endISO),
      notes: params.notes,
      status: "PENDING",
    },
  });

  try {
    const accessToken = await getValidAccessToken(bookingConnection);
    const eventDescription = `Reserva creada vía Agendate Tú Mismo.\nCliente: ${params.clientName}${params.clientPhone ? `\nTeléfono: ${params.clientPhone}` : ""}${params.notes ? `\nNotas: ${params.notes}` : ""}`;

    const { eventId } =
      bookingConnection.provider === "GOOGLE"
        ? await createGoogleEvent({
            accessToken,
            calendarId: bookingConnection.externalCalendarId,
            summary: `${serviceLabel} — ${params.clientName}`,
            description: eventDescription,
            startISO: params.startISO,
            endISO: params.endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
          })
        : await createOutlookEvent({
            accessToken,
            summary: `${serviceLabel} — ${params.clientName}`,
            description: eventDescription,
            startISO: params.startISO,
            endISO: params.endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
          });

    // Toda reserva nace PENDIENTE: nadie la confirmó todavía. Pasa a
    // CONFIRMADA cuando el profesional la confirma (adminSetBookingStatus) o,
    // más adelante, cuando el invitado acepta desde su calendario.
    const created = await prisma.booking.update({
      where: { id: booking.id },
      data: { calendarProvider: bookingConnection.provider, externalEventId: eventId },
    });

    await notifyBookingConfirmed(created, { ...professional, serviceName: serviceLabel }, { pending: true });
    return created;
  } catch (err) {
    // Si falla la creación del evento en el calendario, no dejamos una reserva
    // "fantasma": la marcamos como cancelada para no bloquear el horario y
    // para que quede visible en el panel del profesional que algo falló.
    await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    throw err;
  }
}

export async function cancelBooking(cancelToken: string) {
  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    include: { professional: { include: { calendarConnections: true } }, service: true },
  });
  if (!booking) {
    throw new AppError("Reserva no encontrada.");
  }
  if (booking.status === "CANCELLED") {
    return booking;
  }
  // El link de cancelación no debe quedar utilizable para siempre: una vez
  // pasada la hora del turno, ya no tiene sentido cancelarlo y el enlace
  // queda inválido.
  if (booking.startTime.getTime() < Date.now()) {
    throw new AppError("Este enlace de cancelación ya no está disponible.");
  }

  if (booking.externalEventId && booking.calendarProvider) {
    const connection = booking.professional.calendarConnections.find(
      (c) => c.provider === booking.calendarProvider
    );
    if (connection) {
      const accessToken = await getValidAccessToken(connection);
      if (booking.calendarProvider === "GOOGLE") {
        await deleteGoogleEvent({
          accessToken,
          calendarId: connection.externalCalendarId,
          eventId: booking.externalEventId,
        });
      } else {
        await deleteOutlookEvent({ accessToken, eventId: booking.externalEventId });
      }
    }
  }

  const cancelled = await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });

  // Hasta ahora, si el cliente cancelaba desde su propio link, el
  // profesional no se enteraba de ninguna forma salvo entrando al Panel a
  // mirar la agenda — ver agendate_ideas_originales_gap_analysis (68ZG6:
  // "enviar alertas si hay modificaciones en horarios"). Se avisa acá igual
  // que en la cancelación hecha desde el panel (adminSetBookingStatus más
  // abajo), reutilizando notifyBookingCancelled.
  await notifyBookingCancelled(cancelled, {
    ...booking.professional,
    serviceName: booking.service?.name ?? booking.professional.serviceName,
  });

  return cancelled;
}

/**
 * Cambia el estado de una reserva desde el panel del profesional (marcar
 * completada, ausente, o cancelar). A diferencia de `cancelBooking` (que
 * atiende el link público de cancelación del cliente), esta acción la
 * dispara el profesional y, si cancela, avisa al cliente por los canales
 * habilitados.
 */
export async function adminSetBookingStatus(params: {
  professionalId: string;
  bookingId: string;
  status: Extract<BookingStatus, "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED">;
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, professionalId: params.professionalId },
    include: { professional: { include: { calendarConnections: true } }, service: true },
  });
  if (!booking) {
    throw new AppError("Reserva no encontrada.");
  }

  if (booking.status === "CANCELLED" && params.status !== "CANCELLED") {
    throw new AppError("Un turno cancelado no se puede modificar. Creá una reserva nueva.");
  }
  if (booking.status === params.status) {
    return booking;
  }

  if ((params.status === "COMPLETED" || params.status === "NO_SHOW") && booking.startTime.getTime() > Date.now()) {
    throw new AppError("No se puede marcar como completado o ausente un turno que todavía no empezó.");
  }

  if (params.status === "CONFIRMED") {
    if (booking.status !== "PENDING") {
      // Corrección de un turno ya cerrado (completado/ausente): vuelve a
      // Confirmada sin avisarle de nuevo al cliente.
      return prisma.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    }
    const confirmed = await prisma.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    await notifyBookingConfirmed(
      confirmed,
      { ...booking.professional, serviceName: booking.service?.name ?? booking.professional.serviceName },
      { skipOwner: true }
    );
    return confirmed;
  }

  if (params.status === "CANCELLED" && booking.status !== "CANCELLED") {
    if (booking.externalEventId && booking.calendarProvider) {
      const connection = booking.professional.calendarConnections.find(
        (c) => c.provider === booking.calendarProvider
      );
      if (connection) {
        const accessToken = await getValidAccessToken(connection);
        if (booking.calendarProvider === "GOOGLE") {
          await deleteGoogleEvent({ accessToken, calendarId: connection.externalCalendarId, eventId: booking.externalEventId });
        } else {
          await deleteOutlookEvent({ accessToken, eventId: booking.externalEventId });
        }
      }
    }

    const cancelled = await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    await notifyBookingCancelled(cancelled, { ...booking.professional, serviceName: booking.service?.name ?? booking.professional.serviceName });
    return cancelled;
  }

  return prisma.booking.update({ where: { id: booking.id }, data: { status: params.status } });
}

export class RescheduleConflictError extends AppError {
  constructor() {
    super("El nuevo horario ya no está disponible. Por favor elegí otro.");
  }
}

/** Reprograma un turno confirmado/pendiente a un nuevo horario, moviendo el evento en el calendario real y avisando al cliente. */
export async function rescheduleBooking(params: {
  professionalId: string;
  bookingId: string;
  startISO: string;
  endISO: string;
  /** Si se pasa, sobreescribe (solo para este aviso puntual) qué canales se usan, en vez de los canales por defecto del profesional. */
  channels?: ("WHATSAPP" | "EMAIL" | "TEAMS")[];
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, professionalId: params.professionalId },
    include: { professional: { include: { calendarConnections: true } }, service: true },
  });
  if (!booking) {
    throw new AppError("Reserva no encontrada.");
  }
  if (booking.status === "CANCELLED") {
    throw new AppError("No se puede reprogramar un turno cancelado.");
  }

  const professional = booking.professional;
  const serviceLabel = booking.service?.name ?? professional.serviceName;
  const stillFree = await isSlotStillFree({
    professional,
    connections: professional.calendarConnections,
    startISO: params.startISO,
    endISO: params.endISO,
    excludeBookingId: booking.id,
  });
  if (!stillFree) {
    throw new RescheduleConflictError();
  }

  let newExternalEventId = booking.externalEventId;
  let newProvider = booking.calendarProvider;

  if (booking.externalEventId && booking.calendarProvider) {
    const connection = professional.calendarConnections.find((c) => c.provider === booking.calendarProvider);
    if (connection) {
      const accessToken = await getValidAccessToken(connection);
      const eventDescription = `Reserva reprogramada vía Agendate Tú Mismo.\nCliente: ${booking.clientName}${booking.clientPhone ? `\nTeléfono: ${booking.clientPhone}` : ""}`;

      if (booking.calendarProvider === "GOOGLE") {
        await deleteGoogleEvent({ accessToken, calendarId: connection.externalCalendarId, eventId: booking.externalEventId });
        const created = await createGoogleEvent({
          accessToken,
          calendarId: connection.externalCalendarId,
          summary: `${serviceLabel} — ${booking.clientName}`,
          description: eventDescription,
          startISO: params.startISO,
          endISO: params.endISO,
          timezone: professional.timezone,
          attendeeEmail: booking.clientEmail ?? undefined,
        });
        newExternalEventId = created.eventId;
      } else {
        await deleteOutlookEvent({ accessToken, eventId: booking.externalEventId });
        const created = await createOutlookEvent({
          accessToken,
          summary: `${serviceLabel} — ${booking.clientName}`,
          description: eventDescription,
          startISO: params.startISO,
          endISO: params.endISO,
          timezone: professional.timezone,
          attendeeEmail: booking.clientEmail ?? undefined,
        });
        newExternalEventId = created.eventId;
      }
      newProvider = connection.provider;
    }
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      startTime: new Date(params.startISO),
      endTime: new Date(params.endISO),
      externalEventId: newExternalEventId,
      calendarProvider: newProvider,
    },
  });

  const notifyProfessional = params.channels
    ? {
        ...professional,
        serviceName: serviceLabel,
        notifyWhatsapp: params.channels.includes("WHATSAPP"),
        notifyEmail: params.channels.includes("EMAIL"),
        notifyTeams: params.channels.includes("TEAMS") && !!professional.teamsWebhookUrl,
      }
    : { ...professional, serviceName: serviceLabel };

  await notifyBookingRescheduled(updated, notifyProfessional);
  return updated;
}
