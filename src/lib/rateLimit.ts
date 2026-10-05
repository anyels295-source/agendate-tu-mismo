import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Límite de peticiones (rate limiting) con una tabla en Postgres.
 *
 * Funciona por "ventana fija": el tiempo se divide en tramos de `windowSeconds`
 * (por ejemplo, de 15 minutos) y se cuenta cuántas veces pidió algo cada
 * identificador (una IP, un email) dentro del tramo actual. Si pasa el límite,
 * se responde 429 hasta que empiece el tramo siguiente. El conteo se hace con
 * un solo INSERT ... ON CONFLICT DO UPDATE, que es atómico: dos peticiones
 * simultáneas no se pisan.
 *
 * Los identificadores no se guardan en claro: se convierten con HMAC (un hash
 * con clave) para no almacenar direcciones IP ni emails.
 *
 * Si la base falla, se deja pasar la petición (y se registra el error): es
 * preferible que la app siga reservando antes que bloquear a todos.
 */

export type RateLimitRule = {
  /** Nombre del tramo de la app que se limita (ej. "bookings"). */
  bucket: string;
  /** Cantidad máxima de peticiones permitidas por ventana. */
  limit: number;
  /** Duración de la ventana, en segundos. */
  windowSeconds: number;
};

/** Reglas de la app, por IP salvo que se indique otra cosa. */
export const RATE_LIMITS = {
  /** Crear una reserva desde la página pública. */
  bookings: { bucket: "bookings", limit: 8, windowSeconds: 15 * 60 },
  /** Consultar horarios disponibles (cada consulta llama a Google/Microsoft). */
  availability: { bucket: "availability", limit: 90, windowSeconds: 5 * 60 },
  /** Cancelar un turno con el link del cliente. */
  cancel: { bucket: "cancel", limit: 20, windowSeconds: 15 * 60 },
  /** Intentos de login por IP. */
  loginIp: { bucket: "login-ip", limit: 10, windowSeconds: 15 * 60 },
  /** Intentos de login por email (frena ataques repartidos entre muchas IP). */
  loginEmail: { bucket: "login-email", limit: 20, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/** IP del visitante. En Vercel llega en `x-real-ip` / `x-forwarded-for`. */
export function getClientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "desconocida";
}

function hashIdentifier(value: string): string {
  const secret = process.env.AUTH_SECRET ?? "sin-secreto";
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    const windowMs = rule.windowSeconds * 1000;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const key = `${rule.bucket}:${hashIdentifier(identifier)}`;

    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 1);

    // Limpieza ocasional de ventanas viejas (1 de cada 50 llamadas), para que la tabla no crezca.
    if (Math.random() < 0.02) {
      await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < ${new Date(now - 24 * 60 * 60 * 1000)}`;
    }

    return {
      allowed: count <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
    };
  } catch (err) {
    console.error("Error en el límite de peticiones (se deja pasar la petición):", err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Respuesta 429 estándar, con el encabezado Retry-After (segundos hasta poder reintentar). */
export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return NextResponse.json(
    { error: `Demasiados intentos. Probá de nuevo en ${minutes <= 1 ? "un minuto" : `${minutes} minutos`}.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
