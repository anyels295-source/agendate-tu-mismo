import { EXTERNAL_CALL_TIMEOUT_MS } from "@/lib/externalTimeout";

/**
 * Envío de confirmaciones por WhatsApp Business Cloud API (Meta).
 *
 * Usa una plantilla aprobada (WHATSAPP_TEMPLATE_NAME) porque Meta exige
 * plantillas pre-aprobadas para mensajes que abren una conversación nueva
 * (el cliente no le escribió primero a este número). Ver docs/whatsapp-template.md
 * para el texto exacto a enviar a aprobación.
 *
 * Si las credenciales no están configuradas, la función no falla: registra
 * el motivo y devuelve status "SKIPPED" para no bloquear el flujo de reserva
 * mientras se tramita la aprobación de Meta (puede tardar días).
 */

export type WhatsAppSendResult =
  | { status: "SENT"; providerMessageId: string }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string };

function toE164(phone: string): string {
  // Normalización mínima: quita espacios, guiones y paréntesis. Se asume que
  // el número ya viene con código de país (ej. +598 9x xxx xxx para Uruguay).
  return phone.replace(/[\s\-()]/g, "");
}

export async function sendBookingConfirmationWhatsApp(params: {
  toPhone: string;
  clientName: string;
  professionalName: string;
  serviceName: string;
  dateLabel: string; // ej. "martes 22 de julio"
  timeLabel: string; // ej. "10:00"
  cancelUrl: string;
}): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? "confirmacion_turno";
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v20.0";

  if (!token || !phoneNumberId) {
    return {
      status: "SKIPPED",
      reason: "WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados todavía.",
    };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: toE164(params.toPhone),
    type: "template",
    template: {
      name: templateName,
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.clientName },
            { type: "text", text: params.serviceName },
            { type: "text", text: params.professionalName },
            { type: "text", text: params.dateLabel },
            { type: "text", text: params.timeLabel },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
    });

    const data = await res.json();
    if (!res.ok) {
      return { status: "FAILED", error: JSON.stringify(data) };
    }
    return { status: "SENT", providerMessageId: data.messages?.[0]?.id ?? "sin-id" };
  } catch (err) {
    return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
  }
}
