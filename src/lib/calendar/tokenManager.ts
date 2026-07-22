import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { refreshGoogleAccessToken } from "./google";
import { refreshOutlookAccessToken } from "./outlook";
import type { CalendarConnection } from "@prisma/client";

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
  const refreshed =
    connection.provider === "GOOGLE"
      ? await refreshGoogleAccessToken(refreshToken)
      : await refreshOutlookAccessToken(refreshToken);

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptToken(refreshed.accessToken),
      refreshTokenEnc: encryptToken(refreshed.refreshToken),
      expiresAt: refreshed.expiresAt,
    },
  });

  return refreshed.accessToken;
}
