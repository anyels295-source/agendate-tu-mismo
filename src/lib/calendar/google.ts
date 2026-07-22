import { google } from "googleapis";
import type { BusyBlock, CalendarConnectorTokens } from "@/lib/types";

/**
 * Conector de Google Calendar. Usa OAuth2 con acceso offline (refresh_token)
 * para poder consultar disponibilidad y crear eventos sin que el profesional
 * tenga que volver a autorizar cada vez.
 *
 * Scopes requeridos: https://www.googleapis.com/auth/calendar.events
 *                     https://www.googleapis.com/auth/calendar.readonly
 */

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret) {
    throw new Error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el entorno.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, `${appUrl}/api/auth/google/callback`);
}

export function getGoogleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // fuerza a devolver refresh_token incluso si ya se autorizó antes
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google no devolvió refresh_token. Asegurate de revocar el acceso previo en https://myaccount.google.com/permissions y reintentar (prompt=consent ya está forzado)."
    );
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
    email: data.email ?? "desconocido@gmail.com",
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<CalendarConnectorTokens> {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return {
    accessToken: credentials.access_token!,
    refreshToken: credentials.refresh_token ?? refreshToken,
    expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
  };
}

export async function getGoogleFreeBusy(params: {
  accessToken: string;
  calendarId: string;
  timeMinISO: string;
  timeMaxISO: string;
}): Promise<BusyBlock[]> {
  const client = getOAuthClient();
  client.setCredentials({ access_token: params.accessToken });
  const calendar = google.calendar({ version: "v3", auth: client });

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: params.timeMinISO,
      timeMax: params.timeMaxISO,
      items: [{ id: params.calendarId }],
    },
  });

  const busy = res.data.calendars?.[params.calendarId]?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: b.start as string, end: b.end as string }));
}

export async function createGoogleEvent(params: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendeeEmail?: string;
}): Promise<{ eventId: string }> {
  const client = getOAuthClient();
  client.setCredentials({ access_token: params.accessToken });
  const calendar = google.calendar({ version: "v3", auth: client });

  const res = await calendar.events.insert({
    calendarId: params.calendarId,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startISO, timeZone: params.timezone },
      end: { dateTime: params.endISO, timeZone: params.timezone },
      attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : undefined,
      reminders: { useDefault: true },
    },
  });

  if (!res.data.id) {
    throw new Error("Google Calendar no devolvió un id de evento al crearlo.");
  }
  return { eventId: res.data.id };
}

export async function deleteGoogleEvent(params: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  const client = getOAuthClient();
  client.setCredentials({ access_token: params.accessToken });
  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.events.delete({ calendarId: params.calendarId, eventId: params.eventId });
}
