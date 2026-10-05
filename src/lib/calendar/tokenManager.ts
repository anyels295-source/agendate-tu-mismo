import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { refreshGoogleAccessToken } from "./google";
import { refreshOutlookAccessToken } from "./outlook";
import type { CalendarConnection } from "@prisma/client";

/**
 * Error lanzado cuando el refresh token ya no es válido (revocado, expirado
 * o excedió el límite de 50 tokens por usuario en Google).
 * Las capas superiores pueden detectarlo para responder 401 en lugar de 502.
 */
export class CalendarTokenExpiredError extends Error {
  constructor(public readonly connectionId: string, public readonly provider: string) {
    super(`El token de ${provider} para la conexión ${connectionId} expiró o fue revocado. El profesional debe reconectar su calendario.`);
    this.name = "CalendarTokenExpiredError";
  }
}

const EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000; // renovar 2 minutos antes de que venza

/**
 * Devuelve un access_token válido para la conexión de calendario dada.
 * Si está vencido o por vencer, lo renueva con el refresh_token y persiste
 * el nuevo par de tokens (cifrados) en la base de datos.
 */
export async function getValidAccessToken(connection: CalendarConnection): Promise<string> {
  const now = Date.now();
  const expiresAt = connection.expiresAt.getTime();

  if (expiresAt - now > EXPIRY_SAFETY_MARGIN_MS) {
    return decryptToken(connection.accessTokenEnc);
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc);

  let refreshed: Awaited<ReturnType<typeof refreshGoogleAccessToken>>;
  try {
    refreshed =
      connection.provider === "GOOGLE"
        ? await refreshGoogleAccessToken(refreshToken)
        : await refreshOutlookAccessToken(refreshToken);
  } catch (err: unknown) {
    // invalid_grant → el token ya no es válido, marcar la conexión como inactiva
    const isInvalidGrant =
      err instanceof Error &&
      (err.message.includes("invalid_grant") ||
        (err as { status?: number }).status === 400);

    if (isInvalidGrant) {
      // Si otro pedido ya renovó el token mientras este intentaba (con tokens que rotan,
      // el que llega segundo recibe invalid_grant), se usa el token ya renovado en vez
      // de marcar la conexión como rota.
      const fresh = await prisma.calendarConnection.findUnique({ where: { id: connection.id } });
      if (fresh && fresh.isActive && fresh.refreshTokenEnc !== connection.refreshTokenEnc && fresh.expiresAt.getTime() - Date.now() > EXPIRY_SAFETY_MARGIN_MS) {
        return decryptToken(fresh.accessTokenEnc);
      }
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { isActive: false },
      });
      throw new CalendarTokenExpiredError(connection.id, connection.provider);
    }
    throw err;
  }

  // Se guarda solo si nadie renovó antes (mismo refresh token que leímos): así dos pedidos
  // simultáneos no se pisan. El access token recién obtenido sirve igual en cualquier caso.
  await prisma.calendarConnection.updateMany({
    where: { id: connection.id, refreshTokenEnc: connection.refreshTokenEnc },
    data: {
      accessTokenEnc: encryptToken(refreshed.accessToken),
      refreshTokenEnc: encryptToken(refreshed.refreshToken),
      expiresAt: refreshed.expiresAt,
    },
  });

  return refreshed.accessToken;
}
