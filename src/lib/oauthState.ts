import { SignJWT, jwtVerify } from "jose";

/**
 * El parámetro "state" de OAuth se firma para que el callback sepa a qué
 * profesional atar la conexión de calendario, sin depender de sesiones de
 * servidor ni de que el navegador mantenga cookies durante el ida y vuelta
 * con Google/Microsoft.
 */

/** Audiencia propia del state: lo distingue de la cookie de sesión, que se firma con el mismo secreto. */
const OAUTH_STATE_AUDIENCE = "agendate:oauth-state";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET en el entorno.");
  return new TextEncoder().encode(secret);
}

export async function signOAuthState(professionalId: string, opts?: { popup?: boolean }): Promise<string> {
  return new SignJWT({ professionalId, popup: opts?.popup ?? false })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(OAUTH_STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());
}

export async function verifyOAuthState(state: string): Promise<{ professionalId: string; popup: boolean }> {
  const { payload } = await jwtVerify(state, getSecret(), { audience: OAUTH_STATE_AUDIENCE });
  return { professionalId: payload.professionalId as string, popup: Boolean(payload.popup) };
}

/**
 * Igual que verifyOAuthState pero no lanza si el state es inválido/expiró —
 * se usa en la rama de error de los callbacks de OAuth (cuando el proveedor
 * vuelve con ?error=..., el state puede venir presente pero no siempre hace
 * falta que sea 100% válido para decidir si mostrar la página de "cerrar
 * ventana" del flujo en popup).
 */
export async function tryVerifyOAuthState(state: string | null): Promise<{ professionalId: string; popup: boolean } | null> {
  if (!state) return null;
  try {
    return await verifyOAuthState(state);
  } catch {
    return null;
  }
}
