import { SignJWT, jwtVerify } from "jose";

/**
 * El parámetro "state" de OAuth se firma para que el callback sepa a qué
 * profesional atar la conexión de calendario, sin depender de sesiones de
 * servidor ni de que el navegador mantenga cookies durante el ida y vuelta
 * con Google/Microsoft.
 */

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET en el entorno.");
  return new TextEncoder().encode(secret);
}

export async function signOAuthState(professionalId: string): Promise<string> {
  return new SignJWT({ professionalId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());
}

export async function verifyOAuthState(state: string): Promise<{ professionalId: string }> {
  const { payload } = await jwtVerify(state, getSecret());
  return { professionalId: payload.professionalId as string };
}
