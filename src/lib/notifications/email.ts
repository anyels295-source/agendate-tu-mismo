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
};

/** "(+598 9x xxx xxx)" si hay teléfono, o nada si el cliente no dejó WhatsApp. */
function phoneSuffix(clientPhone: string | null): string {
  return clientPhone ? ` (${clientPhone})` : "";
}

export async function sendOwnerNewBookingEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${params.professionalName},</p>
    <p>Tenés un turno nuevo: <strong>${params.serviceName}</strong> con <strong>${params.clientName}</strong>${phoneSuffix(params.clientPhone)}.</p>
    <p><strong>${params.dateLabel} a las ${params.timeLabel}</strong></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Nuevo turno: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendOwnerBookingRescheduledEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${params.professionalName},</p>
    <p>El turno de <strong>${params.clientName}</strong>${phoneSuffix(params.clientPhone)} se reprogramó a:</p>
    <p><strong>${params.dateLabel} a las ${params.timeLabel}</strong></p>
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
        `<li><strong>${b.timeLabel}</strong> — ${b.clientName} (${b.serviceName}, ${STATUS_LABEL[b.status] ?? b.status})</li>`
    )
    .join("");

  const alertHtml =
    params.failedNotificationsYesterday > 0
      ? `<p style="color:#b6382f;"><strong>Atención:</strong> ${params.failedNotificationsYesterday} notificación(es) a clientes no se pudieron enviar ayer. Revisá el Panel.</p>`
      : "";

  const html = `
    <p>Hola ${params.professionalName},</p>
    <p>Tu agenda de hoy (${params.dateLabel}):</p>
    ${
      params.totalToday === 0
        ? "<p>No tenés turnos agendados para hoy.</p>"
        : `<ul>${rows}</ul><p>${params.totalToday} turno(s) en total.</p>`
    }
    
    <h3>Resumen de la semana</h3>
    <ul>
      <li><strong>Turnos confirmados esta semana:</strong> ${params.bookingsThisWeekCount}</li>
      <li><strong>Ocupación semanal:</strong> ${params.occupancyThisWeek}%</li>
      <li><strong>Cancelaciones este mes:</strong> ${params.cancelledThisMonthCount}</li>
    </ul>

    ${alertHtml}
    <p><a href="${params.panelUrl}">Ver el Panel completo</a></p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: params.totalToday === 0 ? `Hoy no tenés turnos (${params.dateLabel})` : `Tu agenda de hoy: ${params.totalToday} turno(s) (${params.dateLabel})`,
    html,
  });
}

export async function sendOwnerBookingCancelledEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = `
    <p>Hola ${params.professionalName},</p>
    <p><strong>${params.clientName}</strong>${phoneSuffix(params.clientPhone)} canceló su turno de
    <strong>${params.serviceName}</strong> del ${params.dateLabel} a las ${params.timeLabel}.</p>
    <p>Ese horario ya quedó libre en tu agenda.</p>
  `;
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno cancelado: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}
