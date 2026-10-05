import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

/**
 * Autenticación del panel /admin. Diseñada deliberadamente simple para el
 * piloto de 1-2 profesionales: un único usuario admin definido por variables
 * de entorno (ADMIN_EMAIL / ADMIN_PASSWORD_HASH) y una cookie de sesión JWT.
 *
 * Antes de escalar a múltiples profesionales gestionando su propia cuenta,
 * esto debe reemplazarse por un modelo de usuarios con contraseña por
 * profesional (o SSO), como ya se señala en el informe de implementación.
 */

const COOKIE_NAME = "agendate_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 horas

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Falta AUTH_SECRET en el entorno. Generar con: openssl rand -base64 32");
  }
  return new TextEncoder().encode(secret);
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedEmail || !expectedHash) return false;
  // Se compara siempre la contraseña, aunque el email no coincida: así el tiempo de
  // respuesta no revela si el email era el correcto.
  const emailMatches = email.toLowerCase() === expectedEmail.toLowerCase();
  const passwordMatches = await bcrypt.compare(password, expectedHash);
  return emailMatches && passwordMatches;
}

export async function createAdminSession(email: string) {
  const token = await new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { email: payload.email as string };
  } catch {
    return null;
  }
}
