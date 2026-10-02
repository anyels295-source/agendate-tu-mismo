import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";
import { isSlotStillFree, checkSlotAllowed } from "@/lib/availability";
import { getValidAccessToken, CalendarTokenExpiredError } from "@/lib/calendar/tokenManager";
import { createGoogleEvent, deleteGoogleEvent } from "@/lib/calendar/google";
import { createOutlookEvent, deleteOutlookEvent } from "@/lib/calendar/outlook";
import { notifyBookingConfirmed, notifyBookingRescheduled, notifyBookingCancelled } from "@/lib/notifications";
import { AppError } from "@/lib/errors";
import type { BookingStatus, CalendarConnection } from "@prisma/client";

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
  /** Alta manual desde el panel: el cliente ya aceptó, así que nace Confirmada en vez de Pendiente. */
  confirmed?: boolean;
  /**
   * Quién crea la reserva. "PUBLIC" (por defecto) es la página de reservas:
   * se exige aviso mínimo y anticipación máxima. "ADMIN" es el panel.
   */
  origin?: "PUBLIC" | "ADMIN";
}) {
  const origin = params.origin ?? "PUBLIC";
  const professional = await prisma.professional.findUnique({
    where: { id: params.professionalId },
    // Solo conexiones activas: una conexión vencida o desconectada no debe tumbar las reservas.
    include: { calendarConnections: { where: { isActive: true } } },
  });
  if (!professional || !professional.active) {
    throw new AppError("Profesional no encontrado o inactivo.");
  }
  if (professional.calendarConnections.length === 0) {
    throw new AppError("El profesional todavía no tiene un calendario conectado y activo.");
  }

  const service = params.serviceId
    ? await prisma.service.findFirst({ where: { id: params.serviceId, professionalId: professional.id, active: true } })
    : null;
  if (params.serviceId && !service) {
    throw new AppError("El servicio elegido no existe o ya no está disponible.");
  }
  const serviceLabel = service?.name ?? professional.serviceName;

  // El fin del turno se calcula acá a partir de la duración del servicio: lo que
  // mande el navegador en `endISO` no se usa, y el inicio se valida contra el
  // horario de atención y los límites de anticipación.
  const start = DateTime.fromISO(params.startISO);
  if (!start.isValid) {
    throw new AppError("Fecha u hora inválida.");
  }
  const end = start.plus({ minutes: service?.durationMinutes ?? professional.durationMinutes });
  const endISO = end.toISO()!;
  const notAllowedReason = checkSlotAllowed({ professional, start, end, origin });
  if (notAllowedReason) {
    // Para el público, cualquier horario no reservable se trata como "ya no disponible".
    throw origin === "PUBLIC" ? new BookingConflictError() : new AppError(notAllowedReason);
  }

  const stillFree = await isSlotStillFree({
    professional,
    connections: professional.calendarConnections,
    startISO: params.startISO,
    endISO: endISO,
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
      endTime: new Date(endISO),
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
            endISO: endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
          })
        : await createOutlookEvent({
            accessToken,
            summary: `${serviceLabel} — ${params.clientName}`,
            description: eventDescription,
            startISO: params.startISO,
            endISO: endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
          });

    // Toda reserva nace PENDIENTE: nadie la confirmó todavía. Pasa a
    // CONFIRMADA cuando el profesional la confirma (adminSetBookingStatus) o,
    // más adelante, cuando el invitado acepta desde su calendario.
    const created = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        ...(params.confirmed ? { status: "CONFIRMED" as const } : {}),
        calendarProvider: bookingConnection.provider,
        externalEventId: eventId,
      },
    });

    await notifyBookingConfirmed(created, { ...professional, serviceName: serviceLabel }, { pending: !params.confirmed });
    return created;
  } catch (err) {
    // Si falla la creación del evento en el calendario, no dejamos una reserva
    // "fantasma": la marcamos como cancelada para no bloquear el horario y
    // para que quede visible en el panel del profesional que algo falló.
    await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    throw err;
  }
}

/** El proveedor respondió que el evento ya no existe (404/410): para una cancelación equivale a "ya está borrado". */
function isEventGoneError(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number; response?: { status?: number }; message?: string } | null;
  const status = e?.response?.status ?? e?.status ?? Number(e?.code);
  if (status === 404 || status === 410) return true;
  return /\b(404|410)\b/.test(String(e?.message ?? ""));
}

/**
 * Borra el evento de una reserva en el calendario real. Es "mejor esfuerzo"
 * para los casos que nunca van a poder resolverse (el evento ya no existe, o
 * la conexión está desconectada/vencida): ahí la cancelación sigue igual en
 * vez de quedar bloqueada para siempre. Los errores transitorios (red,
 * 5xx del proveedor) sí se propagan para que se pueda reintentar.
 */
async function deleteBookingEvent(booking: {
  externalEventId: string | null;
  calendarProvider: "GOOGLE" | "OUTLOOK" | null;
  professional: { calendarConnections: CalendarConnection[] };
}): Promise<void> {
  if (!booking.externalEventId || !booking.calendarProvider) return;
  const connection = booking.professional.calendarConnections.find((c) => c.provider === booking.calendarProvider);
  if (!connection || !connection.isActive) {
    console.warn("No se pudo borrar el evento del calendario: la conexión no está activa.");
    return;
  }
  try {
    const accessToken = await getValidAccessToken(connection);
    if (booking.calendarProvider === "GOOGLE") {
      await deleteGoogleEvent({ accessToken, calendarId: connection.externalCalendarId, eventId: booking.externalEventId });
    } else {
      await deleteOutlookEvent({ accessToken, eventId: booking.externalEventId });
    }
  } catch (err) {
    if (err instanceof CalendarTokenExpiredError || isEventGoneError(err)) {
      console.warn("El evento del calendario no se pudo borrar (ya no existe o la conexión venció); se cancela igual.");
      return;
    }
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

  await deleteBookingEvent(booking);

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
    await deleteBookingEvent(booking);

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
  const activeConnections = professional.calendarConnections.filter((c) => c.isActive);

  // Se conserva la duración original del turno y se valida el nuevo inicio
  // contra el horario de atención (lo que mande el navegador en `endISO` no se usa).
  const start = DateTime.fromISO(params.startISO);
  const end = start.plus({ milliseconds: booking.endTime.getTime() - booking.startTime.getTime() });
  const notAllowedReason = checkSlotAllowed({ professional, start, end, origin: "ADMIN" });
  if (notAllowedReason) {
    throw new AppError(notAllowedReason);
  }
  const endISO = end.toISO()!;

  const stillFree = await isSlotStillFree({
    professional,
    connections: activeConnections,
    startISO: params.startISO,
    endISO,
    excludeBookingId: booking.id,
    // El evento actual del propio turno figura como ocupado en el calendario: no debe bloquear su nuevo horario.
    ignoreInterval: { start: booking.startTime, end: booking.endTime },
  });
  if (!stillFree) {
    throw new RescheduleConflictError();
  }

  let newExternalEventId = booking.externalEventId;
  let newProvider = booking.calendarProvider;

  if (booking.externalEventId && booking.calendarProvider) {
    const connection = activeConnections.find((c) => c.provider === booking.calendarProvider);
    if (!connection) {
      throw new AppError("El calendario de este turno está desconectado. Reconectalo en Calendarios antes de reprogramar.");
    }
    {
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
          endISO: endISO,
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
          endISO: endISO,
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
      endTime: new Date(endISO),
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
