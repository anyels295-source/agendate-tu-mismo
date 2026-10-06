/**
 * Cuánto se espera la respuesta de un servicio externo (Google, Microsoft, Resend,
 * WhatsApp, Teams) antes de darla por fallida. Sin este tope, un servicio colgado deja
 * colgada la reserva hasta que Vercel corta la función, y ahí ya no corre la
 * compensación que deshace lo hecho a medias.
 */
export const EXTERNAL_CALL_TIMEOUT_MS = 8_000;
