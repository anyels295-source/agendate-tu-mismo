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

/**
 * Cookie de "dispositivo conocido": se guarda en el navegador después de un login correcto.
 * El límite de intentos por email (ver api/auth/admin) no se aplica desde un dispositivo
 * conocido. Así, si alguien prueba contraseñas con el email del admin hasta bloquearlo, el
 * admin igual puede entrar desde su navegador de siempre. El límite por IP sigue valiendo.
 */
const DEVICE_COOKIE_NAME = "agendate_admin_device";
const DEVICE_AUDIENCE = "agendate:known-device";
const DEVICE_DURATION_SECONDS = 60 * 60 * 24 * 180; // 180 días

export async function markKnownDevice(email: string) {
  const token = await new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(DEVICE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${DEVICE_DURATION_SECONDS}s`)
    .sign(getSecret());
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_DURATION_SECONDS,
    path: "/api/auth/admin",
  });
}

export async function isKnownDevice(email: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: DEVICE_AUDIENCE });
    return typeof payload.email === "string" && payload.email === email.toLowerCase();
  } catch {
    return false;
  }
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
    // El mismo secreto firma también el "state" de OAuth (ver oauthState.ts): sin estos
    // chequeos, cualquier JWT firmado por la app valdría como sesión de admin.
    const expectedEmail = process.env.ADMIN_EMAIL;
    if (payload.role !== "admin" || typeof payload.email !== "string" || !expectedEmail) return null;
    if (payload.email.toLowerCase() !== expectedEmail.toLowerCase()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
