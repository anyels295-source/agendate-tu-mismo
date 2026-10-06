import type { CalendarConnection } from "@prisma/client";
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
