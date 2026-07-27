/**
 * Envío de email de respaldo (fallback) cuando WhatsApp no está disponible
 * o el cliente no dejó teléfono. Usa SMTP simple vía fetch a un proveedor
 * transaccional no está incluido para mantener el MVP sin dependencias
 * adicionales; se implementa con la API HTTP de Resend si RESEND_API_KEY
 * está presente, o se omite (SKIPPED) si no hay nada configurado.
 *
 * Nota: se eligió no agregar "nodemailer" como dependencia para no sumar
 * peso al MVP; si se prefiere SMTP tradicional, es un cambio acotado a este
 * archivo.
 */

export type EmailSendResult =
  | { status: "SENT" }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: string };

type BookingEmailParams = {
  toEmail: string;
  clientName: string;
  professionalName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  cancelUrl: string;
};

async function sendEmail(params: { toEmail: string; subject: string; html: string }): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SMTP_FROM ?? "Agendate Tú Mismo <no-responder@tudominio.com>";

  if (!apiKey) {
    return { status: "SKIPPED", reason: "RESEND_API_KEY no configurado todavía." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: params.toEmail, subject: params.subject, html: params.html }),
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

export async function sendBookingConfirmationEmail(params: BookingEmailParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${params.clientName},</p>
    <p>Tu turno de <strong>${params.serviceName}</strong> con <strong>${params.professionalName}</strong> quedó confirmado:</p>
    <p><strong>${params.dateLabel} a las ${params.timeLabel}</strong></p>
    <p>Si necesitás cancelar, podés hacerlo acá: <a href="${params.cancelUrl}">${params.cancelUrl}</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno confirmado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendBookingRescheduledEmail(params: BookingEmailParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${params.clientName},</p>
    <p>Tu turno de <strong>${params.serviceName}</strong> con <strong>${params.professionalName}</strong> se reprogramó. La nueva fecha es:</p>
    <p><strong>${params.dateLabel} a las ${params.timeLabel}</strong></p>
    <p>Si no te queda bien, podés cancelarlo acá: <a href="${params.cancelUrl}">${params.cancelUrl}</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno reprogramado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendBookingCancelledEmail(
  params: Omit<BookingEmailParams, "cancelUrl">
): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${params.clientName},</p>
    <p>Tu turno de <strong>${params.serviceName}</strong> con <strong>${params.professionalName}</strong>
    del ${params.dateLabel} a las ${params.timeLabel} fue cancelado.</p>
    <p>Si querés reservar un nuevo horario, escribile a ${params.professionalName}.</p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno cancelado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}
