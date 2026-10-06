/**
 * Convierte el error crudo de un envío fallido (a veces un JSON del proveedor) en un
 * mensaje que entienda quien administra el panel.
 */
export function friendlyNotificationError(raw: string | null | undefined): string {
  if (!raw) return "";
  // El detalle puede empezar con "[cliente]" o "[profesional]": a quién iba el aviso.
  const audienceMatch = raw.match(/^\[(cliente|profesional)\]\s*/);
  const audience = audienceMatch ? (audienceMatch[1] === "cliente" ? "Aviso al cliente" : "Aviso para vos") : null;
  const prefix = audience ? `${audience}: ` : "";
  let message = audienceMatch ? raw.slice(audienceMatch[0].length) : raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.message === "string") message = parsed.message;
  } catch {
    // No era JSON: se usa el texto tal cual.
  }
  if (/only send testing emails/i.test(message)) {
    const advice =
      audienceMatch?.[1] === "profesional"
        ? "Poné en Configuración, Email para avisos, la dirección autorizada, o verificá un dominio en Resend."
        : "Para escribirle a cualquier cliente hay que verificar un dominio en Resend.";
    return `${prefix}el proveedor de email está en modo de prueba y solo envía a la dirección autorizada. ${advice}`;
  }
  if (/invalid .?to.? field/i.test(message)) {
    return `${prefix}la dirección de email del destinatario no es válida.`;
  }
  return `${prefix}${message.length > 120 ? `${message.slice(0, 117)}…` : message}`;
}
