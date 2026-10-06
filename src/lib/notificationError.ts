/**
 * Convierte el error crudo de un envío fallido (a veces un JSON del proveedor) en un
 * mensaje que entienda quien administra el panel.
 */
export function friendlyNotificationError(raw: string | null | undefined): string {
  if (!raw) return "";
  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.message === "string") message = parsed.message;
  } catch {
    // No era JSON: se usa el texto tal cual.
  }
  if (/only send testing emails/i.test(message)) {
    return "El proveedor de email está en modo de prueba: solo envía a la dirección autorizada. Hay que verificar un dominio en Resend.";
  }
  if (/invalid .?to.? field/i.test(message)) {
    return "La dirección de email del destinatario no es válida.";
  }
  return message.length > 120 ? `${message.slice(0, 117)}…` : message;
}
