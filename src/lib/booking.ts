import { prisma } from "@/lib/prisma";
import { isSlotStillFree } from "@/lib/availability";
import { getValidAccessToken } from "@/lib/calendar/tokenManager";
import { createGoogleEvent, deleteGoogleEvent } from "@/lib/calendar/google";
import { createOutlookEvent, deleteOutlookEvent } from "@/lib/calendar/outlook";
import { notifyBookingConfirmed } from "@/lib/notifications";

export class BookingConflictError extends Error {
  constructor() {
    super("El horario elegido ya no está disponible. Por favor elegí otro horario.");
  }
}

export async function createBooking(params: {
  professionalId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone: string;
  startISO: string;
  endISO: string;
  notes?: string;
}) {
  const professional = await prisma.professional.findUnique({
    where: { id: params.professionalId },
    include: { calendarConnections: true },
  });
  if (!professional || !professional.active) {
    throw new Error("Profesional no encontrado o inactivo.");
  }
  if (professional.calendarConnections.length === 0) {
    throw new Error("El profesional todavía no conectó ningún calendario.");
  }

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
    const eventDescription = `Reserva creada vía Agendate Tú Mismo.\nCliente: ${params.clientName}\nTeléfono: ${params.clientPhone}${params.notes ? `\nNotas: ${params.notes}` : ""}`;

    const { eventId } =
      bookingConnection.provider === "GOOGLE"
        ? await createGoogleEvent({
            accessToken,
            calendarId: bookingConnection.externalCalendarId,
            summary: `${professional.serviceName} — ${params.clientName}`,
            description: eventDescription,
            startISO: params.startISO,
            endISO: params.endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
          })
        : await createOutlookEvent({
            accessToken,
            summary: `${professional.serviceName} — ${params.clientName}`,
            description: eventDescription,
            startISO: params.startISO,
            endISO: params.endISO,
            timezone: professional.timezone,
            attendeeEmail: params.clientEmail,
          });

    const confirmed = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", calendarProvider: bookingConnection.provider, externalEventId: eventId },
    });

    await notifyBookingConfirmed(confirmed, professional);
    return confirmed;
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
    include: { professional: { include: { calendarConnections: true } } },
  });
  if (!booking) {
    throw new Error("Reserva no encontrada.");
  }
  if (booking.status === "CANCELLED") {
    return booking;
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

  return prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
}
