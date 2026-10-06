import type { CalendarConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { confirmBookingFromInvitation } from "@/lib/booking";
import { getValidAccessToken } from "@/lib/calendar/tokenManager";
import { getGoogleAttendeeResponse } from "@/lib/calendar/google";
import { getOutlookAttendeeResponse } from "@/lib/calendar/outlook";

export type InvitationResponse = "accepted" | "declined" | "tentative" | "pending";

type BookingForInvitation = {
  id: string;
  clientEmail: string | null;
  externalEventId: string | null;
  calendarProvider: "GOOGLE" | "OUTLOOK" | null;
};

/**
 * Consulta en el calendario real si cada cliente aceptó, rechazó o todavía no respondió
 * la invitación de su turno. No guarda nada: es la respuesta actual del calendario. No lanza
 * nunca: si algo falla o tarda más de 6 segundos, devuelve lo que alcanzó a obtener.
 */
export async function getInvitationResponses(
  connections: CalendarConnection[],
  bookings: BookingForInvitation[]
): Promise<Map<string, InvitationResponse>> {
  const responses = new Map<string, InvitationResponse>();
  // Tope de turnos por consulta, para no hacer decenas de llamadas al calendario.
  const candidates = bookings.filter((b) => b.clientEmail && b.externalEventId && b.calendarProvider).slice(0, 25);
  if (candidates.length === 0) return responses;

  const tokens = new Map<string, Promise<string>>();
  const work = Promise.allSettled(
    candidates.map(async (booking) => {
      const connection = connections.find((c) => c.provider === booking.calendarProvider && c.isActive);
      if (!connection) return;
      // El token de cada conexión se pide una sola vez, aunque haya muchos turnos.
      let token = tokens.get(connection.id);
      if (!token) {
        token = getValidAccessToken(connection);
        tokens.set(connection.id, token);
      }
      const accessToken = await token;
      const response =
        connection.provider === "GOOGLE"
          ? await getGoogleAttendeeResponse({
              accessToken,
              calendarId: connection.externalCalendarId,
              eventId: booking.externalEventId!,
              attendeeEmail: booking.clientEmail!,
            })
          : await getOutlookAttendeeResponse({ accessToken, eventId: booking.externalEventId!, attendeeEmail: booking.clientEmail! });
      if (response === "accepted" || response === "declined" || response === "tentative") responses.set(booking.id, response);
      else if (response === "needsAction") responses.set(booking.id, "pending");
    })
  );
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 6000))]);
  return responses;
}

/**
 * Confirma los turnos pendientes cuyo cliente ya aceptó la invitación del calendario. La usan
 * el Panel, Reservas y el cron de recordatorios, para que un turno aceptado figure Confirmado
 * en todos lados y no solo después de abrir la Agenda. Toma los 25 pendientes más próximos.
 * Devuelve cuántos turnos se confirmaron.
 */
export async function syncPendingInvitations(professionalId: string): Promise<number> {
  // Nunca lanza: si algo falla, la pantalla se muestra igual con los estados que había.
  try {
    return await confirmAcceptedInvitations(professionalId);
  } catch (err) {
    console.error("No se pudieron sincronizar las respuestas de los invitados:", err);
    return 0;
  }
}

async function confirmAcceptedInvitations(professionalId: string): Promise<number> {
  const [connections, pending] = await Promise.all([
    prisma.calendarConnection.findMany({ where: { professionalId, isActive: true } }),
    prisma.booking.findMany({
      where: { professionalId, status: "PENDING", startTime: { gt: new Date() }, externalEventId: { not: null }, clientEmail: { not: null } },
      orderBy: { startTime: "asc" },
      take: 25,
      select: { id: true, clientEmail: true, externalEventId: true, calendarProvider: true },
    }),
  ]);
  if (connections.length === 0 || pending.length === 0) return 0;

  const responses = await getInvitationResponses(connections, pending);
  let confirmed = 0;
  for (const booking of pending) {
    if (responses.get(booking.id) === "accepted" && (await confirmBookingFromInvitation(booking.id))) confirmed += 1;
  }
  return confirmed;
}
