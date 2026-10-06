import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";
import { isSlotStillFree, checkSlotAllowed } from "@/lib/availability";
import { getValidAccessToken, CalendarTokenExpiredError } from "@/lib/calendar/tokenManager";
import { createGoogleEvent, deleteGoogleEvent, moveGoogleEvent } from "@/lib/calendar/google";
import { createOutlookEvent, deleteOutlookEvent, moveOutlookEvent } from "@/lib/calendar/outlook";
import { notifyBookingConfirmed, notifyBookingRescheduled, notifyBookingCancelled } from "@/lib/notifications";
import { AppError } from "@/lib/errors";
import type { BookingStatus, CalendarConnection } from "@prisma/client";

/**
 * Postgres rechazó un turno por la restricción "Booking_no_overlap" (exclusión
 * por solapamiento, error 23P01; ver la migración booking_no_overlap): otro
 * turno Pendiente o Confirmado del mismo profesional ocupa ese horario. Es lo
 * que cierra la carrera entre dos pedidos simultáneos por el mismo hueco.
 */
function isOverlapError(err: unknown): boolean {
  const message = String((err as { message?: string } | null)?.message ?? "");
  return message.includes("Booking_no_overlap") || message.includes("23P01") || message.includes("exclusion constraint");
}

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
  }).catch((err: unknown) => {
    if (isOverlapError(err)) throw new BookingConflictError();
    throw err;
  });

  let createdEventId: string | null = null;
  try {
    const accessToken = await getValidAccessToken(bookingConnection);
    const eventDescription = `Reserva creada vía Agendate Tú Mismo.\nCliente: ${params.clientName}${params.clientPhone ? `\nTeléfono: ${params.clientPhone}` : ""}${params.notes ? `\nNotas: ${params.notes}` : ""}`;

    const { eventId, meetingUrl } =
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
            withMeeting: professional.videoCallEnabled,
          })
        : await createOutlookEvent({
            accessToken,
            summary: `${serviceLabel} — ${params.clientName}`,
            description: eventDescription,
            startISO: params.startISO,
            endISO: endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
            withMeeting: professional.videoCallEnabled,
          });

    createdEventId = eventId;

    // Toda reserva nace PENDIENTE: nadie la confirmó todavía. Pasa a
    // CONFIRMADA cuando el profesional la confirma (adminSetBookingStatus) o,
    // más adelante, cuando el invitado acepta desde su calendario.
    const created = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        ...(params.confirmed ? { status: "CONFIRMED" as const } : {}),
        calendarProvider: bookingConnection.provider,
        externalEventId: eventId,
        meetingUrl,
      },
    });

    const { clientEmailStatus } = await notifyBookingConfirmed(created, { ...professional, serviceName: serviceLabel }, { pending: !params.confirmed });
    return { ...created, clientEmailStatus };
  } catch (err) {
    // Si algo falla después de reservar el horario, se deshace todo: se borra el evento
    // si ya se había creado (para no dejarlo huérfano en el calendario) y se elimina la
    // reserva, que nunca llegó a existir de verdad. Antes quedaba como "Cancelada" y
    // aparecía en el panel y en las métricas de cancelaciones.
    if (createdEventId) await deleteEventSafely(bookingConnection, createdEventId);
    await prisma.booking.delete({ where: { id: booking.id } }).catch((deleteErr: unknown) => {
      console.error("No se pudo eliminar la reserva fallida:", deleteErr);
    });
    throw err;
  }
}

/** Borra un evento del calendario real (puede lanzar error). */
async function removeCalendarEvent(connection: CalendarConnection, eventId: string, notifyAttendees = false): Promise<void> {
  const accessToken = await getValidAccessToken(connection);
  if (connection.provider === "GOOGLE") {
    await deleteGoogleEvent({ accessToken, calendarId: connection.externalCalendarId, eventId, notifyAttendees });
  } else {
    await deleteOutlookEvent({ accessToken, eventId, notifyAttendees });
  }
}

/** Cambia el horario de un evento ya creado (conserva el link de la videollamada). Puede lanzar error. */
async function moveCalendarEvent(
  connection: CalendarConnection,
  eventId: string,
  when: { startISO: string; endISO: string; timezone: string }
): Promise<void> {
  const accessToken = await getValidAccessToken(connection);
  if (connection.provider === "GOOGLE") {
    await moveGoogleEvent({ accessToken, calendarId: connection.externalCalendarId, eventId, ...when });
  } else {
    await moveOutlookEvent({ accessToken, eventId, ...when });
  }
}

/** Igual que removeCalendarEvent pero sin lanzar nunca: para compensaciones, donde un fallo no debe tapar el error original. */
async function deleteEventSafely(connection: CalendarConnection, eventId: string): Promise<void> {
  try {
    await removeCalendarEvent(connection, eventId);
  } catch (err) {
    console.warn("No se pudo borrar un evento del calendario durante una compensación:", err);
  }
}

/**
 * Cambia el estado de un turno solo si todavía tiene el estado esperado. Devuelve
 * false si otro proceso ya lo cambió: evita avisos y borrados de calendario duplicados
 * cuando llegan dos pedidos a la vez (doble clic, o cliente y panel al mismo tiempo).
 */
async function changeStatusIf(bookingId: string, from: BookingStatus | { not: BookingStatus }, to: BookingStatus): Promise<boolean> {
  const result = await prisma.booking.updateMany({ where: { id: bookingId, status: from }, data: { status: to } });
  return result.count === 1;
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
    // Es una cancelación real: el calendario le avisa al invitado que el evento se canceló.
    await removeCalendarEvent(connection, booking.externalEventId, true);
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

  // Si otro pedido ya canceló el turno entre medio, no se vuelve a avisar.
  if (!(await changeStatusIf(booking.id, { not: "CANCELLED" }, "CANCELLED"))) {
    return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  }
  const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

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
      return reapplyStatus(booking.id, booking.status, "CONFIRMED");
    }
    // Si otro pedido ya lo confirmó, no se vuelve a avisar al cliente.
    if (!(await changeStatusIf(booking.id, "PENDING", "CONFIRMED"))) {
      return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    }
    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const { clientEmailStatus } = await notifyBookingConfirmed(
      confirmed,
      { ...booking.professional, serviceName: booking.service?.name ?? booking.professional.serviceName },
      { skipOwner: true }
    );
    return { ...confirmed, clientEmailStatus };
  }

  if (params.status === "CANCELLED" && (booking.status === "COMPLETED" || booking.status === "NO_SHOW")) {
    // Un turno cerrado ya ocurrió: cancelarlo borraría el evento histórico y le avisaría al cliente.
    throw new AppError("Un turno completado o ausente no se puede cancelar. Si fue un error, primero volvelo a Confirmada.");
  }

  if (params.status === "CANCELLED" && booking.status !== "CANCELLED") {
    await deleteBookingEvent(booking);

    if (!(await changeStatusIf(booking.id, { not: "CANCELLED" }, "CANCELLED"))) {
      return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    }
    const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    await notifyBookingCancelled(cancelled, { ...booking.professional, serviceName: booking.service?.name ?? booking.professional.serviceName });
    return cancelled;
  }

  return reapplyStatus(booking.id, booking.status, params.status);
}

/**
 * El cliente aceptó la invitación del calendario: el turno pasa de Pendiente a Confirmado. No se
 * le envía otro aviso (ya lo sabe, porque la aceptación la hizo él). Devuelve true si cambió.
 */
export async function confirmBookingFromInvitation(bookingId: string): Promise<boolean> {
  return changeStatusIf(bookingId, "PENDING", "CONFIRMED");
}

/** Cambia el estado esperando que siga siendo `from`; si otro proceso lo cambió antes, avisa en vez de pisarlo. */
async function reapplyStatus(bookingId: string, from: BookingStatus, to: BookingStatus) {
  let changed: boolean;
  try {
    changed = await changeStatusIf(bookingId, from, to);
  } catch (err) {
    return overlapOnReactivation(err);
  }
  if (!changed) {
    throw new AppError("El turno cambió mientras tanto. Actualizá la página y volvé a intentar.");
  }
  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

/** Volver a dejar activo (Pendiente/Confirmado) un turno cuyo horario otro turno ya ocupó. */
function overlapOnReactivation(err: unknown): never {
  if (isOverlapError(err)) {
    throw new AppError("No se puede volver a activar este turno: su horario ya lo ocupa otro turno.");
  }
  throw err;
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
  if (booking.status === "COMPLETED" || booking.status === "NO_SHOW") {
    throw new AppError("No se puede reprogramar un turno completado o ausente. Creá una reserva nueva.");
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

  const eventConnection =
    booking.externalEventId && booking.calendarProvider
      ? activeConnections.find((c) => c.provider === booking.calendarProvider) ?? null
      : null;
  if (booking.externalEventId && booking.calendarProvider && !eventConnection) {
    throw new AppError("El calendario de este turno está desconectado. Reconectalo en Calendarios antes de reprogramar.");
  }

  // Primero se guarda el nuevo horario en la base: si otro turno lo ocupa, la restricción lo
  // rechaza y no se toca el calendario.
  await prisma.booking
    .update({
      where: { id: booking.id },
      // reminderSentAt vuelve a null: el recordatorio que se haya mandado era para la fecha vieja,
      // y el cron solo toma turnos sin recordatorio.
      data: { startTime: new Date(params.startISO), endTime: new Date(endISO), reminderSentAt: null },
    })
    .catch((err: unknown) => {
      if (isOverlapError(err)) throw new RescheduleConflictError();
      throw err;
    });

  let replacedEvent: { externalEventId: string; calendarProvider: CalendarConnection["provider"]; meetingUrl: string | null } | null = null;
  if (booking.externalEventId && eventConnection) {
    try {
      // Se MUEVE el mismo evento en vez de borrarlo y crear otro: conserva el link de la
      // videollamada y el invitado recibe una actualización, no una cancelación más una invitación.
      await moveCalendarEvent(eventConnection, booking.externalEventId, { startISO: params.startISO, endISO, timezone: professional.timezone });
    } catch (err) {
      if (!isEventGoneError(err)) {
        // No se pudo mover: el turno vuelve a su horario anterior para que base y calendario coincidan.
        await prisma.booking
          .update({ where: { id: booking.id }, data: { startTime: booking.startTime, endTime: booking.endTime, reminderSentAt: booking.reminderSentAt } })
          .catch((revertErr: unknown) => console.error("No se pudo restaurar el horario anterior del turno:", revertErr));
        throw err;
      }
      // El evento ya no existe (se borró a mano en el calendario): se crea uno nuevo.
      const accessToken = await getValidAccessToken(eventConnection);
      const eventDescription = `Reserva reprogramada vía Agendate Tú Mismo.\nCliente: ${booking.clientName}${booking.clientPhone ? `\nTeléfono: ${booking.clientPhone}` : ""}`;
      const created =
        eventConnection.provider === "GOOGLE"
          ? await createGoogleEvent({
              accessToken,
              calendarId: eventConnection.externalCalendarId,
              summary: `${serviceLabel} — ${booking.clientName}`,
              description: eventDescription,
              startISO: params.startISO,
              endISO: endISO,
              timezone: professional.timezone,
              attendeeEmail: booking.clientEmail ?? undefined,
              withMeeting: professional.videoCallEnabled,
            })
          : await createOutlookEvent({
              accessToken,
              summary: `${serviceLabel} — ${booking.clientName}`,
              description: eventDescription,
              startISO: params.startISO,
              endISO: endISO,
              timezone: professional.timezone,
              attendeeEmail: booking.clientEmail ?? undefined,
              withMeeting: professional.videoCallEnabled,
            });
      replacedEvent = { externalEventId: created.eventId, calendarProvider: eventConnection.provider, meetingUrl: created.meetingUrl };
    }
  }

  const updated = replacedEvent
    ? await prisma.booking.update({ where: { id: booking.id }, data: replacedEvent })
    : await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

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
