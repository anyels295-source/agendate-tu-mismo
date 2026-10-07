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

/** Escapa texto que viene de personas (nombres, notas) antes de insertarlo en el HTML de un email. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Diseño de los emails. Todo va con estilos en línea y tablas, que es lo que respetan
 * Gmail y Outlook (ignoran las hojas de estilo y buena parte del CSS moderno).
 */
const BRAND = "#22508c";
const BRAND_SOFT = "#eaf1fb";
const INK = "#16233d";
const MUTED = "#5a6884";
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

type Tone = "blue" | "green" | "amber" | "red" | "gray";
const TONES: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: "#e3edfa", fg: "#22508c" },
  green: { bg: "#e3f5ea", fg: "#1c7a43" },
  amber: { bg: "#fdf1dc", fg: "#9a5b00" },
  red: { bg: "#fde7e5", fg: "#b6382f" },
  gray: { bg: "#eef1f6", fg: "#5a6884" },
};

/** Etiqueta de estado (Confirmado, Pendiente, Cancelado…). */
function pill(label: string, tone: Tone): string {
  const t = TONES[tone];
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${t.bg};color:${t.fg};font-size:13px;font-weight:700;">${esc(label)}</span>`;
}

/** Botón: un link con forma de botón (los emails no admiten botones de verdad). */
function button(href: string, label: string, color = BRAND): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td style="border-radius:10px;background:${color};">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;${FONT}font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr></table>`;
}

/** Recuadro celeste con la fecha y la hora del turno, que es lo más importante del email. */
function dateBox(params: { dateLabel: string; timeLabel: string; detail?: string; status?: string; tone?: Tone }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:${BRAND_SOFT};border-left:4px solid ${BRAND};border-radius:10px;"><tr><td style="padding:16px 20px;${FONT}">
    <div style="font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Fecha y hora</div>
    <div style="font-size:20px;font-weight:800;color:${INK};margin-top:4px;">${esc(params.dateLabel)} · ${esc(params.timeLabel)}</div>
    ${params.detail ? `<div style="font-size:15px;color:${MUTED};margin-top:4px;">${esc(params.detail)}</div>` : ""}
    ${params.status ? `<div style="margin-top:10px;">${pill(params.status, params.tone ?? "blue")}</div>` : ""}
  </td></tr></table>`;
}

/** Botón para entrar a la videollamada (nada si el turno no tiene). Solo se muestran links https. */
function meetingBlock(meetingUrl?: string | null): string {
  if (!meetingUrl || !meetingUrl.startsWith("https://")) return "";
  return `${button(meetingUrl, "Unirse a la videollamada", "#1c7a43")}<p style="margin:0;font-size:13px;color:${MUTED};">${esc(meetingUrl)}</p>`;
}

/** Línea chica, al pie del contenido, con el link para cancelar el turno. */
function cancelLine(cancelUrl: string, question: string): string {
  return `<p style="margin:22px 0 0;font-size:14px;color:${MUTED};">${esc(question)} <a href="${esc(cancelUrl)}" style="color:${BRAND};">Cancelar el turno</a>.</p>`;
}

/** Párrafo con el estilo de los emails. Recibe HTML: lo que venga de personas tiene que llegar ya escapado. */
function para(html: string): string {
  return `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:${INK};">${html}</p>`;
}

/** Título chico en mayúsculas para separar secciones (por ejemplo, en el resumen diario). */
function sectionLabel(text: string, marginTop = 0): string {
  return `<p style="margin:${marginTop}px 0 8px;font-size:13px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${esc(text)}</p>`;
}

/**
 * Estructura común de todos los emails: encabezado azul con la marca y un título, una
 * tarjeta blanca con el contenido y un pie. `preheader` es el texto que Gmail muestra al
 * lado del asunto en la bandeja.
 */
function layout(params: { preheader: string; title: string; body: string }): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef2f8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="background:${BRAND};background-image:linear-gradient(135deg,#1d3f72,#2e6fb0);border-radius:16px 16px 0 0;padding:22px 28px;${FONT}">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;height:40px;border-radius:10px;background:#ffffff;color:${BRAND};font-size:22px;font-weight:800;text-align:center;vertical-align:middle;">A</td>
        <td style="padding-left:12px;color:#ffffff;font-size:17px;font-weight:700;">Agéndate Tú Mismo</td>
      </tr></table>
      <div style="color:#ffffff;font-size:24px;font-weight:800;margin-top:18px;">${esc(params.title)}</div>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:26px 28px 30px;${FONT}">${params.body}</td></tr>
    <tr><td style="padding:18px 8px;text-align:center;${FONT}font-size:12px;color:#8a97ad;">Agéndate Tú Mismo · reservá cuando quieras, sin llamadas</td></tr>
  </table>
</td></tr></table>
</body></html>`;
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
      html: layout({
        preheader: `Registramos tu turno del ${params.dateLabel} a las ${params.timeLabel}.`,
        title: "Recibimos tu reserva",
        body: `
          ${para(`Hola ${esc(params.clientName)},`)}
          ${para(`Registramos tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong>.`)}
          ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel, status: "Pendiente de confirmación", tone: "amber" })}
          ${para("Te avisamos por este medio apenas se confirme.")}
          ${meetingBlock(params.meetingUrl)}
          ${cancelLine(params.cancelUrl, "¿No te queda bien?")}`,
      }),
    });
  }
  const html = layout({
    preheader: `Te esperamos el ${params.dateLabel} a las ${params.timeLabel}.`,
    title: "¡Tu turno está confirmado!",
    body: `
      ${para(`Hola ${esc(params.clientName)},`)}
      ${para(`Tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong> quedó confirmado.`)}
      ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel, status: "Confirmado", tone: "green" })}
      ${meetingBlock(params.meetingUrl)}
      ${cancelLine(params.cancelUrl, "¿Necesitás cancelar?")}`,
  });
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno confirmado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendBookingRescheduledEmail(params: BookingEmailParams): Promise<EmailSendResult> {
  const html = layout({
    preheader: `Nueva fecha: ${params.dateLabel} a las ${params.timeLabel}.`,
    title: "Tu turno cambió de horario",
    body: `
      ${para(`Hola ${esc(params.clientName)},`)}
      ${para(`Tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong> se reprogramó. La nueva fecha es:`)}
      ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel, status: "Reprogramado", tone: "blue" })}
      ${meetingBlock(params.meetingUrl)}
      ${cancelLine(params.cancelUrl, "¿No te queda bien?")}`,
  });
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno reprogramado: ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

/** Recordatorio del turno: normalmente el día anterior, o el mismo día si se reservó tarde. */
export async function sendBookingReminderEmail(params: BookingEmailParams & { isToday?: boolean }): Promise<EmailSendResult> {
  const when = params.isToday ? "hoy" : "mañana";
  const html = layout({
    preheader: `Tu turno es ${when} a las ${params.timeLabel}.`,
    title: `Tu turno es ${when}`,
    body: `
      ${para(`Hola ${esc(params.clientName)},`)}
      ${para(`Te recordamos tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong>.`)}
      ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel })}
      ${meetingBlock(params.meetingUrl)}
      ${cancelLine(params.cancelUrl, "¿No podés asistir?")}`,
  });
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Recordatorio: tu turno es ${when}, ${params.dateLabel} a las ${params.timeLabel}`,
    html,
  });
}

export async function sendBookingCancelledEmail(
  params: Omit<BookingEmailParams, "cancelUrl">
): Promise<EmailSendResult> {
  const html = layout({
    preheader: `Se canceló tu turno del ${params.dateLabel} a las ${params.timeLabel}.`,
    title: "Tu turno fue cancelado",
    body: `
      ${para(`Hola ${esc(params.clientName)},`)}
      ${para(`Tu turno de <strong>${esc(params.serviceName)}</strong> con <strong>${esc(params.professionalName)}</strong> fue cancelado.`)}
      ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel, status: "Cancelado", tone: "gray" })}
      ${para(`Si querés reservar un nuevo horario, escribile a ${esc(params.professionalName)}.`)}`,
  });
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
  const html = layout({
    preheader: `${params.clientName} reservó para el ${params.dateLabel} a las ${params.timeLabel}.`,
    title: params.pending ? "Tenés un turno por confirmar" : "Tenés un turno nuevo",
    body: `
      ${para(`Hola ${esc(params.professionalName)},`)}
      ${para(`<strong>${esc(params.clientName)}</strong>${esc(phoneSuffix(params.clientPhone))} reservó un turno de <strong>${esc(params.serviceName)}</strong>.`)}
      ${dateBox({
        dateLabel: params.dateLabel,
        timeLabel: params.timeLabel,
        status: params.pending ? "Pendiente de confirmación" : "Confirmado",
        tone: params.pending ? "amber" : "green",
      })}
      ${params.pending && params.panelUrl ? button(params.panelUrl, "Confirmar desde el panel") : ""}`,
  });
  return sendEmail({
    toEmail: params.toEmail,
    subject: `${params.pending ? "Nuevo turno por confirmar" : "Nuevo turno"}: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}

export async function sendOwnerBookingRescheduledEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = layout({
    preheader: `Nueva fecha: ${params.dateLabel} a las ${params.timeLabel}.`,
    title: "Un turno cambió de horario",
    body: `
      ${para(`Hola ${esc(params.professionalName)},`)}
      ${para(`El turno de <strong>${esc(params.clientName)}</strong>${esc(phoneSuffix(params.clientPhone))} se reprogramó a:`)}
      ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel, detail: params.serviceName, status: "Reprogramado", tone: "blue" })}`,
  });
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
  const STATUS: Record<string, { label: string; tone: Tone }> = {
    PENDING: { label: "Pendiente", tone: "amber" },
    CONFIRMED: { label: "Confirmado", tone: "green" },
  };
  // Un renglón por turno de hoy: la hora destacada, el cliente y el servicio, y su estado.
  const rows = params.bookingsToday
    .map((b) => {
      const status = STATUS[b.status] ?? { label: b.status, tone: "gray" as Tone };
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #e6ebf3;width:72px;font-size:18px;font-weight:800;color:${BRAND};vertical-align:top;">${esc(b.timeLabel)}</td>
        <td style="padding:12px 0;border-bottom:1px solid #e6ebf3;vertical-align:top;">
          <div style="font-size:16px;font-weight:700;color:${INK};">${esc(b.clientName)}</div>
          <div style="font-size:14px;color:${MUTED};">${esc(b.serviceName)}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e6ebf3;text-align:right;vertical-align:top;">${pill(status.label, status.tone)}</td>
      </tr>`;
    })
    .join("");

  const agenda =
    params.totalToday === 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_SOFT};border-radius:10px;"><tr><td style="padding:18px 20px;font-size:16px;color:${INK};">☕ No tenés turnos agendados para hoy.</td></tr></table>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
         <p style="margin:12px 0 0;font-size:14px;color:${MUTED};">${esc(params.totalToday)} turno(s) en total.</p>`;

  // Los números de la semana, como tres tarjetas.
  const stat = (value: string, label: string) =>
    `<td width="33%" style="padding:4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_SOFT};border-radius:10px;"><tr><td style="padding:14px 10px;text-align:center;${FONT}">
      <div style="font-size:26px;font-weight:800;color:${BRAND};">${esc(value)}</div>
      <div style="font-size:12px;color:${MUTED};margin-top:2px;">${esc(label)}</div>
    </td></tr></table></td>`;

  const alertHtml =
    params.failedNotificationsYesterday > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:${TONES.red.bg};border-radius:10px;"><tr><td style="padding:14px 18px;font-size:15px;color:${TONES.red.fg};">
          <strong>Atención:</strong> ${esc(params.failedNotificationsYesterday)} notificación(es) a clientes no se pudieron enviar ayer. Revisá el Panel.
        </td></tr></table>`
      : "";

  const html = layout({
    preheader: params.totalToday === 0 ? "Hoy no tenés turnos agendados." : `Hoy tenés ${params.totalToday} turno(s).`,
    title: "Tu agenda de hoy",
    body: `
      ${para(`Hola ${esc(params.professionalName)},`)}
      ${sectionLabel(params.dateLabel, 6)}
      ${agenda}
      ${sectionLabel("Resumen de la semana", 26)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${stat(String(params.bookingsThisWeekCount), "turnos confirmados")}
        ${stat(`${params.occupancyThisWeek}%`, "ocupación semanal")}
        ${stat(String(params.cancelledThisMonthCount), "cancelaciones del mes")}
      </tr></table>
      ${alertHtml}
      ${button(params.panelUrl, "Ver el Panel completo")}`,
  });
  return sendEmail({
    toEmail: params.toEmail,
    subject: params.totalToday === 0 ? `Hoy no tenés turnos (${params.dateLabel})` : `Tu agenda de hoy: ${params.totalToday} turno(s) (${params.dateLabel})`,
    html,
  });
}

export async function sendOwnerBookingCancelledEmail(params: OwnerNoticeParams): Promise<EmailSendResult> {
  const html = layout({
    preheader: `${params.clientName} canceló su turno del ${params.dateLabel}.`,
    title: "Se canceló un turno",
    body: `
      ${para(`Hola ${esc(params.professionalName)},`)}
      ${para(`<strong>${esc(params.clientName)}</strong>${esc(phoneSuffix(params.clientPhone))} canceló su turno de <strong>${esc(params.serviceName)}</strong>.`)}
      ${dateBox({ dateLabel: params.dateLabel, timeLabel: params.timeLabel, status: "Cancelado", tone: "gray" })}
      ${para("Ese horario ya quedó libre en tu agenda.")}`,
  });
  return sendEmail({
    toEmail: params.toEmail,
    subject: `Turno cancelado: ${params.clientName} · ${params.dateLabel} ${params.timeLabel}`,
    html,
  });
}
