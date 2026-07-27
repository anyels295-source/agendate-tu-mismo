/**
 * Envío de avisos a un canal de Microsoft Teams vía Incoming Webhook (o un
 * flujo de Power Automate disparado por "When a Teams webhook request is
 * received", que acepta el mismo tipo de payload JSON). El profesional pega
 * la URL del webhook en Configuración → Notificaciones; si no la configuró,
 * el envío se omite (SKIPPED) sin romper el resto del flujo de reserva.
 */

export type TeamsSendResult =
  | { status: "SENT" }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string };

export async function sendTeamsMessage(params: {
  webhookUrl?: string | null;
  title: string;
  text: string;
}): Promise<TeamsSendResult> {
  if (!params.webhookUrl) {
    return { status: "SKIPPED", reason: "No hay webhook de Microsoft Teams configurado." };
  }

  try {
    const res = await fetch(params.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        summary: params.title,
        themeColor: "215A8F",
        title: params.title,
        text: params.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { status: "FAILED", error: body };
    }
    return { status: "SENT" };
  } catch (err) {
    return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
  }
}
