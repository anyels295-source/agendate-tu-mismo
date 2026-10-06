import { EXTERNAL_CALL_TIMEOUT_MS } from "@/lib/externalTimeout";

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
  /** Turno registrado que todavía nadie confirmó. */
  pending?: boolean;
  /** Link de la videollamada (Meet o Teams), si el turno tiene una. */
  meetingUrl?: string | null;
};

/** Bloque de HTML con el link de la videollamada (vacío si el turno no tiene). Solo se muestran links https. */
function meetingBlock(meetingUrl?: string | null): string {
  if (!meetingUrl || !meetingUrl.startsWith("https://")) return "";
  return `<p><strong>Videollamada:</strong> <a href="${esc(meetingUrl)}">${esc(meetingUrl)}</a></p>`;
}

/** Escapa texto que viene de personas (nombres, notas) antes de insertarlo en el HTML de un email. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
      signal: AbortSignal.timeout(EXTERNAL_CALL_TIMEOUT_MS),
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
  if (params.pending) {
    return sendEmail({
      toEmail: params.toEmail,
      subject: `Turno pendiente de confirmación: ${params.dateLabel} ${params.timeLabel}`,
      html: `
    <p>Hola ${esc(params.clientName)},</p>
    <p>Registramos tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong>:</p>
    <p><strong>${esc(params.dateLabel)} a las ${esc(params.timeLabel)}</strong></p>
    ${meetingBlock(params.meetingUrl)}
    <p>El turno queda pendiente de confirmación; te avisaremos cuando se confirme.</p>
    <p>Si no te queda bien, podés cancelarlo acá: <a href="${esc(params.cancelUrl)}">${esc(params.cancelUrl)}</a></p>
  `,
    });
  }
  const html = `
    <p>Hola ${esc(params.clientName)},</p>
    <p>Tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong> quedó confirmado:</p>
    <p><strong>${esc(params.dateLabel)} a las ${esc(params.timeLabel)}</strong></p>
    ${meetingBlock(params.meetingUrl)}
    <p>Si necesitás cancelar, podés hacerlo acá: <a href="${esc(params.cancelUrl)}">${esc(params.cancelUrl)}</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno confirmado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendBookingRescheduledEmail(params: BookingEmailParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${esc(params.clientName)},</p>
    <p>Tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong> se reprogramó. La nueva fecha es:</p>
    <p><strong>${esc(params.dateLabel)} a las ${esc(params.timeLabel)}</strong></p>
    ${meetingBlock(params.meetingUrl)}
    <p>Si no te queda bien, podés cancelarlo acá: <a href="${esc(params.cancelUrl)}">${esc(params.cancelUrl)}</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno reprogramado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

/** Recordatorio del turno: normalmente el día anterior, o el mismo día si se reservó tarde. */
export async function sendBookingReminderEmail(params: BookingEmailParams & { isToday?: boolean }): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${esc(params.clientName)},</p>
    <p>Te recordamos tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong>:</p>
    <p><strong>${esc(params.dateLabel)} a las ${esc(params.timeLabel)}</strong></p>
    ${meetingBlock(params.meetingUrl)}
    <p>Si no podés asistir, podés cancelarlo acá: <a href="${esc(params.cancelUrl)}">${esc(params.cancelUrl)}</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Recordatorio: tu turno es ${params.isToday ? "hoy" : "mañana"}, ${params.dateLabel} a las ${params.timeLabel}`,
    html,
  });
}

export async function sendBookingCancelledEmail(
  params: Omit<BookingEmailParams, "cancelUrl">
): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${esc(params.clientName)},</p>
    <p>Tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong>
    del ${esc(params.dateLabel)} a las ${esc(params.timeLabel)} fue cancelado.</p>
    <p>Si querés reservar un nuevo horario, escribile a ${esc(params.professionalName)}.</p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno cancelado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

/**
 * Aviso al propio profesional (no al cliente) de un turno nuevo, reprogramado
 * o cancelado. Antes de esto, si el profesional no tenía Teams configurado,
 * la única forma de enterarse de un turno nuevo era entrar al Panel — ver
 * agendate_ideas_originales_gap_analysis (68ZG6: "enviar alertas si hay
 * modificaciones en horarios"). Se envía por el mismo canal de email que ya
 * existe (Professional.email siempre está presente), sin agregar ninguna
 * columna nueva a la base de datos: reutiliza el toggle notifyEmail que el
 * profesional ya tiene en Configuración → Notificaciones.
 */
type OwnerNoticeParams = {
  toEmail: string;
  professionalName: string;
  clientName: string;
  /** Opcional: el cliente puede no haber dejado WhatsApp. */
  clientPhone: string | null;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  /** Turno nuevo que todavía espera la confirmación del profesional. */
  pending?: boolean;
  /** Dirección del panel donde confirmarlo. */
  panelUrl?: string;
};

/** "(+598 9x xxx xxx)" si hay teléfono, o nada si el cliente no dejó WhatsApp. */
function phoneSuffix(clientPhone: string | null): string {
  return clientPhone ? ` (${clientPhone})` : "";
}

export async function sendOwnerNewBookingEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${esc(params.professionalName)},</p>
    <p>Tenés un turno nuevo: <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.clientName)}</strong>${esc(phoneSuffix(params.clientPhone))}.</p>
    <p><strong>${esc(params.dateLabel)} a las ${esc(params.timeLabel)}</strong></p>
    ${
      params.pending && params.panelUrl
        ? `<p>Este turno está <strong>pendiente de confirmación</strong>. <a href="${esc(params.panelUrl)}">Confirmalo desde el panel</a>.</p>`
        : ""
    }
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `${params.pending ? "Nuevo turno por confirmar" : "Nuevo turno"}: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendOwnerBookingRescheduledEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${esc(params.professionalName)},</p>
    <p>El turno de <strong>${esc(params.clientName)}</strong>${esc(phoneSuffix(params.clientPhone))} se reprogramó a:</p>
    <p><strong>${esc(params.dateLabel)} a las ${esc(params.timeLabel)}</strong></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno reprogramado: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

/**
 * Resumen diario (ver src/lib/dailySummary.ts). Se envía una vez por día,
 * distinto de los avisos por turno individual de arriba.
 */
export async function sendDailySummaryEmail(params: {
  toEmail: string;
  professionalName: string;
  dateLabel: string;
  panelUrl: string;
  totalToday: number;
  bookingsToday: Array<{ timeLabel: string; clientName: string; serviceName: string; status: string }>;
  failedNotificationsYesterday: number;
  bookingsThisWeekCount: number;
  occupancyThisWeek: number;
  cancelledThisMonthCount: number;
}): Promise<EmailSendResult> {
  const STATUS_LABEL: Record<string, string> = { PENDING: "pendiente", CONFIRMED: "confirmado" };
  const rows = params.bookingsToday
    .map(
      (b) =>
        `<li><strong>${esc(b.timeLabel)}</strong> — ${esc(b.clientName)} (${esc(b.serviceName)}, ${esc(STATUS_LABEL[b.status] ?? b.status)})</li>`
    )
    .join("");

  const alertHtml =
    params.failedNotificationsYesterday > 0
      ? `<p style="color:#b6382f;"><strong>Atención:</strong> ${esc(params.failedNotificationsYesterday)} notificación(es) a clientes no se pudieron enviar ayer. Revisá el Panel.</p>`
      : "";

  const html = `
    <p>Hola ${esc(params.professionalName)},</p>
    <p>Tu agenda de hoy (${esc(params.dateLabel)}):</p>
    ${
      params.totalToday === 0
        ? "<p>No tenés turnos agendados para hoy.</p>"
        : `<ul>${rows}</ul><p>${esc(params.totalToday)} turno(s) en total.</p>`
    }
    
    <h3>Resumen de la semana</h3>
    <ul>
      <li><strong>Turnos confirmados esta semana:</strong> ${esc(params.bookingsThisWeekCount)}</li>
      <li><strong>Ocupación semanal:</strong> ${esc(params.occupancyThisWeek)}%</li>
      <li><strong>Cancelaciones este mes:</strong> ${esc(params.cancelledThisMonthCount)}</li>
    </ul>

    ${alertHtml}
    <p><a href="${esc(params.panelUrl)}">Ver el Panel completo</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: params.totalToday === 0 ? `Hoy no tenés turnos (${params.dateLabel})` : `Tu agenda de hoy: ${params.totalToday} turno(s) (${params.dateLabel})`,
    html,
  });
}

export async function sendOwnerBookingCancelledEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${esc(params.professionalName)},</p>
    <p><strong>${esc(params.clientName)}</strong>${esc(phoneSuffix(params.clientPhone))} canceló su turno de
    <strong>${esc(params.serviceName)}</strong> del ${esc(params.dateLabel)} a las ${esc(params.timeLabel)}.</p>
    <p>Ese horario ya quedó libre en tu agenda.</p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno cancelado: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}
