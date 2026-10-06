import { ConfidentialClientApplication } from "@azure/msal-node";
import type { BusyBlock, CalendarConnectorTokens } from "@/lib/types";
import { EXTERNAL_CALL_TIMEOUT_MS } from "@/lib/externalTimeout";

/**
 * Conector de Outlook / Microsoft 365 vía Microsoft Graph API.
 * Reutiliza el mismo enfoque de credenciales que ya está definido para
 * Agente AgendaFácil (Microsoft Graph + OAuth2), para poder compartir
 * en el futuro la misma app registrada en Azure si conviene.
 *
 * Permisos delegados requeridos: Calendars.ReadWrite, offline_access, User.Read
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["Calendars.ReadWrite", "User.Read", "offline_access"];

function getMsalClient(): ConfidentialClientApplication {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  if (!clientId || !clientSecret) {
    throw new Error("Faltan MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET en el entorno.");
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  });
}

function getRedirectUri(): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/auth/outlook/callback`;
}

export function getOutlookAuthUrl(state: string): Promise<string> {
  const client = getMsalClient();
  return client.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: getRedirectUri(),
    state,
    prompt: "consent",
  });
}

export async function exchangeOutlookCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}> {
  const client = getMsalClient();
  const result = await client.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: getRedirectUri(),
  });

  if (!result?.accessToken) {
    throw new Error("Microsoft no devolvió un access_token.");
  }

  // msal-node no expone el refresh_token directamente (lo maneja su cache interno),
  // así que lo extraemos del cache serializado para poder persistirlo nosotros
  // mismos en la base de datos (necesario porque el MVP es stateless entre requests).
  const cache = client.getTokenCache().serialize();
  const parsed = JSON.parse(cache);
  const refreshTokenEntry = Object.values(parsed.RefreshToken ?? {})[0] as
    | { secret: string }
    | undefined;

  if (!refreshTokenEntry?.secret) {
    throw new Error(
      "No se pudo extraer el refresh_token de Microsoft. Revisar que offline_access esté en los scopes y que la app tenga consentimiento de admin si aplica."
    );
  }

  return {
    accessToken: result.accessToken,
    refreshToken: refreshTokenEntry.secret,
    expiresAt: result.expiresOn ?? new Date(Date.now() + 3600_000),
    email: result.account?.username ?? "desconocido@outlook.com",
  };
}

export async function refreshOutlookAccessToken(refreshToken: string): Promise<CalendarConnectorTokens> {
  const client = getMsalClient();
  const result = await client.acquireTokenByRefreshToken({
    refreshToken,
    scopes: SCOPES,
  });

  if (!result?.accessToken) {
    throw new Error("No se pudo renovar el access_token de Microsoft.");
  }

  const cache = client.getTokenCache().serialize();
  const parsed = JSON.parse(cache);
  const refreshTokenEntry = Object.values(parsed.RefreshToken ?? {})[0] as
    | { secret: string }
    | undefined;

  return {
    accessToken: result.accessToken,
    refreshToken: refreshTokenEntry?.secret ?? refreshToken,
    expiresAt: result.expiresOn ?? new Date(Date.now() + 3600_000),
  };
}

async function graphFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft Graph error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function getOutlookFreeBusy(params: {
  accessToken: string;
  calendarId: string; // no usado por getSchedule (trabaja por email), se mantiene por contrato común
  timeMinISO: string;
  timeMaxISO: string;
  accountEmail: string;
}): Promise<BusyBlock[]> {
  const data = await graphFetch(`/me/calendar/getSchedule`, params.accessToken, {
    method: "POST",
    body: JSON.stringify({
      schedules: [params.accountEmail],
      startTime: { dateTime: params.timeMinISO, timeZone: "UTC" },
      endTime: { dateTime: params.timeMaxISO, timeZone: "UTC" },
      availabilityViewInterval: 15,
    }),
  });

  const scheduleItems = data.value?.[0]?.scheduleItems ?? [];
  return scheduleItems.map((item: { start: { dateTime: string }; end: { dateTime: string } }) => ({
    start: `${item.start.dateTime}Z`,
    end: `${item.end.dateTime}Z`,
  }));
}

export async function createOutlookEvent(params: {
  accessToken: string;
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendeeEmail?: string;
  /** Agrega una reunión de Microsoft Teams al evento. */
  withMeeting?: boolean;
}): Promise<{ eventId: string; meetingUrl: string | null }> {
  const base = {
    subject: params.summary,
    body: { contentType: "text", content: params.description ?? "" },
    start: { dateTime: params.startISO, timeZone: params.timezone },
    end: { dateTime: params.endISO, timeZone: params.timezone },
    // Outlook envía la invitación al crear el evento con invitados.
    attendees: params.attendeeEmail ? [{ emailAddress: { address: params.attendeeEmail }, type: "required" }] : [],
  };
  const create = (withMeeting: boolean) =>
    graphFetch(`/me/events`, params.accessToken, {
      method: "POST",
      body: JSON.stringify(withMeeting ? { ...base, isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : base),
    });

  let data;
  try {
    data = await create(!!params.withMeeting);
  } catch (err) {
    // Las cuentas personales de Microsoft no admiten Teams: se reserva igual, sin la reunión.
    // Si fue un timeout, el evento pudo haberse creado igual: reintentar lo duplicaría.
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    if (!params.withMeeting || timedOut) throw err;
    console.warn("No se pudo crear la reunión de Teams; se crea el evento sin ella:", err);
    data = await create(false);
  }
  return { eventId: data.id, meetingUrl: data.onlineMeeting?.joinUrl ?? null };
}

export async function deleteOutlookEvent(params: {
  accessToken: string;
  eventId: string;
  /** Avisa a los invitados de la cancelación (envía el aviso de reunión cancelada). */
  notifyAttendees?: boolean;
}): Promise<void> {
  if (params.notifyAttendees) {
    const cancel = await fetch(`${GRAPH_BASE}/me/events/${params.eventId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ Comment: "El turno fue cancelado." }),
      signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
    });
    if (cancel.ok || cancel.status === 404) return;
    // Si no se puede cancelar con aviso (por ejemplo, el evento no tiene invitados), se borra igual.
  }
  const res = await fetch(`${GRAPH_BASE}/me/events/${params.eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${params.accessToken}` },
    signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Microsoft Graph error al eliminar evento: ${body}`);
  }
}

/** Cambia el horario de un evento existente (Outlook avisa a los invitados de la actualización por su cuenta). */
export async function moveOutlookEvent(params: {
  accessToken: string;
  eventId: string;
  startISO: string;
  endISO: string;
  timezone: string;
}): Promise<void> {
  await graphFetch(`/me/events/${params.eventId}`, params.accessToken, {
    method: "PATCH",
    body: JSON.stringify({
      start: { dateTime: params.startISO, timeZone: params.timezone },
      end: { dateTime: params.endISO, timeZone: params.timezone },
    }),
  });
}

/** Respuesta de un invitado a la invitación de un evento (Outlook), con los mismos valores que Google. */
export async function getOutlookAttendeeResponse(params: {
  accessToken: string;
  eventId: string;
  attendeeEmail: string;
}): Promise<"accepted" | "declined" | "tentative" | "needsAction" | null> {
  const data = await graphFetch(`/me/events/${params.eventId}?$select=attendees`, params.accessToken);
  const attendee = (data.attendees ?? []).find(
    (a: { emailAddress?: { address?: string } }) => a.emailAddress?.address?.toLowerCase() === params.attendeeEmail.toLowerCase()
  );
  const response = attendee?.status?.response;
  if (response === "accepted") return "accepted";
  if (response === "declined") return "declined";
  if (response === "tentativelyAccepted") return "tentative";
  if (response === "none" || response === "notResponded") return "needsAction";
  return null;
}
