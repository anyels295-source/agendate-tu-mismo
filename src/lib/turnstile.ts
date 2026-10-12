import { EXTERNAL_CALL_TIMEOUT_MS } from "@/lib/externalTimeout";

/**
 * Cloudflare Turnstile: el CAPTCHA (prueba de "sos una persona") de la reserva pública.
 * Casi siempre es invisible: la persona no tiene que hacer nada.
 *
 * Se activa solo si están las dos claves: NEXT_PUBLIC_TURNSTILE_SITE_KEY (la usa el
 * navegador para mostrar el widget) y TURNSTILE_SECRET_KEY (la usa el servidor para
 * verificar). Con una sola, queda apagado, para no bloquear todas las reservas por una
 * configuración a medias. Las claves salen del panel de Cloudflare → Turnstile.
 */
export function isTurnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/**
 * Pregunta a Cloudflare si el token que mandó el navegador es válido. Cada token sirve una
 * sola vez. Si Cloudflare no responde (caída o demora), se deja pasar la reserva: los límites
 * por IP y por email siguen activos, y es preferible eso a que nadie pueda reservar.
 */
export async function verifyTurnstileToken(token: string | undefined, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? "", response: token });
    if (ip !== "desconocida") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("Turnstile respondió con error; se deja pasar la reserva:", res.status);
      return true;
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("No se pudo verificar Turnstile; se deja pasar la reserva:", err);
    return true;
  }
}
