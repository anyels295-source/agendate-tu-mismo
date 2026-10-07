import { prisma } from "@/lib/prisma";
import { sendBookingConfirmationWhatsApp } from "./whatsapp";
import {
  sendBookingConfirmationEmail,
  sendBookingRescheduledEmail,
  sendBookingCancelledEmail,
  sendOwnerNewBookingEmail,
  sendOwnerBookingRescheduledEmail,
  sendOwnerBookingCancelledEmail,
} from "./email";
import { sendTeamsMessage } from "./teams";
import type { Booking, Professional } from "@prisma/client";
import { DateTime } from "luxon";

/**
 * Punto único desde el que se disparan los avisos de turnos (confirmación,
 * reprogramación, cancelación). Respeta los canales que el profesional tiene
 * habilitados (notifyWhatsapp / notifyEmail / notifyTeams en Configuración →
 * Notificaciones). Cada intento queda registrado en NotificationLog para
 * trazabilidad ante el cliente y para depurar el piloto.
 *
 * WhatsApp exige plantillas pre-aprobadas por Meta para abrir conversación
 * (ver docs/whatsapp-template.md). Hoy solo existe la plantilla de
 * confirmación, así que se reutiliza también para reprogramaciones (el
 * contenido —fecha y hora del turno— sigue siendo válido); para
 * cancelaciones no hay plantilla aprobada todavía, así que ese envío queda
 * registrado como SKIPPED en vez de enviarse.
 *
 * Además de avisar al cliente, cada función manda una copia corta al propio
 * profesional (a su Professional.email) cuando notifyEmail está activo — así
 * se entera de un turno nuevo/reprogramado/cancelado aunque no tenga Teams
 * configurado, en vez de tener que entrar al Panel para descubrirlo (ver
 * agendate_ideas_originales_gap_analysis en memoria del proyecto).
 */

function buildLabels(startTime: Date, timezone: string) {
  const dt = DateTime.fromJSDate(startTime).setZone(timezone).setLocale("es");
  return { dateLabel: dt.toFormat("cccc d 'de' LLLL"), timeLabel: dt.toFormat("HH:mm") };
}

/**
 * Registra el resultado de un aviso. `audience` indica a quién iba: al cliente o al profesional.
 * Se guarda como prefijo del detalle ("[cliente] ..."), para que el Panel pueda decir cuál falló.
 */
async function logNotification(
  bookingId: string,
  channel: "WHATSAPP" | "EMAIL" | "TEAMS",
  result: { status: "SENT" | "FAILED" | "SKIPPED"; error?: string; reason?: string },
  audience?: "cliente" | "profesional"
) {
  const detail = result.status === "FAILED" ? result.error : result.status === "SKIPPED" ? result.reason : null;
  await prisma.notificationLog.create({
    data: {
      bookingId,
      channel,
      status: result.status,
      error: detail && audience ? `[${audience}] ${detail}` : detail,
    },
  });
}

/**
 * El link de la videollamada se le manda al cliente recién cuando el turno está confirmado:
 * mientras está pendiente, el turno todavía puede no concretarse.
 */
function meetingUrlForClient(booking: Booking): string | null {
  return booking.status === "CONFIRMED" ? booking.meetingUrl : null;
}

export async function notifyBookingConfirmed(booking: Booking, professional: Professional, opts: { pending?: boolean; skipOwner?: boolean } = {}) {
  const { dateLabel, timeLabel } = buildLabels(booking.startTime, professional.timezone);
  const cancelUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/cancelar/${booking.cancelToken}`;

  // Los tres canales son independientes entre sí (cada uno atrapa sus propios
  // errores y siempre resuelve con un resultado, nunca rechaza — ver
  // sendBookingConfirmationWhatsApp/Email/sendTeamsMessage). Se disparan en
  // paralelo en vez de uno detrás del otro para no sumar sus latencias (cada
  // llamada externa puede tardar 1-3 s) al tiempo que el cliente espera la
  // confirmación de su turno.
  const tasks: Promise<unknown>[] = [];
  // Resultado del email al cliente: sirve para decirle la verdad en la pantalla de confirmación.
  let clientEmailStatus: "SENT" | "FAILED" | "SKIPPED" | null = null;

  if (professional.notifyWhatsapp && opts.pending) {
    // La plantilla de WhatsApp aprobada dice "turno confirmado"; no sirve para uno pendiente.
    tasks.push(
      logNotification(booking.id, "WHATSAPP", { status: "SKIPPED", reason: "Turno pendiente de confirmación: no hay plantilla de WhatsApp para avisos de turnos pendientes." })
    );
  } else if (professional.notifyWhatsapp && booking.clientPhone) {
    tasks.push(
      sendBookingConfirmationWhatsApp({
        toPhone: booking.clientPhone,
        clientName: booking.clientName,
        professionalName: professional.name,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
        cancelUrl,
      }).then((result) => logNotification(booking.id, "WHATSAPP", result, "cliente"))
    );
  } else if (professional.notifyWhatsapp) {
    // El cliente no dejó WhatsApp (ahora es opcional) — no hay a quién
    // mandarle nada, pero dejamos registro para que no parezca un envío
    // fallido en el Panel.
    tasks.push(
      logNotification(booking.id, "WHATSAPP", { status: "SKIPPED", reason: "El cliente no dejó un teléfono de WhatsApp." })
    );
  }

  if (professional.notifyEmail && booking.clientEmail) {
    tasks.push(
      sendBookingConfirmationEmail({
        toEmail: booking.clientEmail,
        clientName: booking.clientName,
        professionalName: professional.name,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
        cancelUrl,
        pending: opts.pending,
        meetingUrl: meetingUrlForClient(booking),
      }).then((result) => {
        clientEmailStatus = result.status;
        return logNotification(booking.id, "EMAIL", result, "cliente");
      })
    );
  }

  // Al confirmar un turno ya existente, el profesional es quien lo confirma:
  // no hace falta volver a avisarle de un "nuevo turno".
  if (professional.notifyTeams && !opts.skipOwner) {
    tasks.push(
      sendTeamsMessage({
        webhookUrl: professional.teamsWebhookUrl,
        title: `Nuevo turno: ${booking.clientName}`,
        text: `${professional.serviceName} · ${dateLabel} a las ${timeLabel}.${booking.clientPhone ? ` Tel: ${booking.clientPhone}` : ""}`,
      }).then((result) => logNotification(booking.id, "TEAMS", result, "profesional"))
    );
  }

  if (professional.notifyEmail && !opts.skipOwner) {
    tasks.push(
      sendOwnerNewBookingEmail({
        pending: opts.pending,
        panelUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/admin/reservas?filter=PENDING`,
        toEmail: professional.email,
        professionalName: professional.name,
        clientName: booking.clientName,
        clientPhone: booking.clientPhone,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
      }).then((result) => logNotification(booking.id, "EMAIL", result, "profesional"))
    );
  }

  await Promise.allSettled(tasks);
  return { clientEmailStatus };
}

export async function notifyBookingRescheduled(booking: Booking, professional: Professional) {
  const { dateLabel, timeLabel } = buildLabels(booking.startTime, professional.timezone);
  const cancelUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/cancelar/${booking.cancelToken}`;

  const tasks: Promise<unknown>[] = [];

  if (professional.notifyWhatsapp && booking.clientPhone) {
    tasks.push(
      sendBookingConfirmationWhatsApp({
        toPhone: booking.clientPhone,
        clientName: booking.clientName,
        professionalName: professional.name,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
        cancelUrl,
      }).then((result) => logNotification(booking.id, "WHATSAPP", result, "cliente"))
    );
  } else if (professional.notifyWhatsapp) {
    tasks.push(
      logNotification(booking.id, "WHATSAPP", { status: "SKIPPED", reason: "El cliente no dejó un teléfono de WhatsApp." })
    );
  }

  if (professional.notifyEmail && booking.clientEmail) {
    tasks.push(
      sendBookingRescheduledEmail({
        toEmail: booking.clientEmail,
        clientName: booking.clientName,
        professionalName: professional.name,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
        cancelUrl,
        meetingUrl: meetingUrlForClient(booking),
      }).then((result) => logNotification(booking.id, "EMAIL", result, "cliente"))
    );
  }

  if (professional.notifyTeams) {
    tasks.push(
      sendTeamsMessage({
        webhookUrl: professional.teamsWebhookUrl,
        title: `Turno reprogramado: ${booking.clientName}`,
        text: `${professional.serviceName} · nueva fecha ${dateLabel} a las ${timeLabel}.`,
      }).then((result) => logNotification(booking.id, "TEAMS", result, "profesional"))
    );
  }

  if (professional.notifyEmail) {
    tasks.push(
      sendOwnerBookingRescheduledEmail({
        toEmail: professional.email,
        professionalName: professional.name,
        clientName: booking.clientName,
        clientPhone: booking.clientPhone,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
      }).then((result) => logNotification(booking.id, "EMAIL", result, "profesional"))
    );
  }

  await Promise.allSettled(tasks);
}

export async function notifyBookingCancelled(booking: Booking, professional: Professional) {
  const { dateLabel, timeLabel } = buildLabels(booking.startTime, professional.timezone);

  const tasks: Promise<unknown>[] = [];

  if (professional.notifyWhatsapp) {
    tasks.push(
      logNotification(booking.id, "WHATSAPP", {
        status: "SKIPPED",
        reason: "No hay plantilla de WhatsApp aprobada para cancelaciones todavía (ver docs/whatsapp-template.md).",
      })
    );
  }

  if (professional.notifyEmail && booking.clientEmail) {
    tasks.push(
      sendBookingCancelledEmail({
        toEmail: booking.clientEmail,
        clientName: booking.clientName,
        professionalName: professional.name,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
      }).then((result) => logNotification(booking.id, "EMAIL", result, "cliente"))
    );
  }

  if (professional.notifyTeams) {
    tasks.push(
      sendTeamsMessage({
        webhookUrl: professional.teamsWebhookUrl,
        title: `Turno cancelado: ${booking.clientName}`,
        text: `${professional.serviceName} · era el ${dateLabel} a las ${timeLabel}.`,
      }).then((result) => logNotification(booking.id, "TEAMS", result, "profesional"))
    );
  }

  if (professional.notifyEmail) {
    tasks.push(
      sendOwnerBookingCancelledEmail({
        toEmail: professional.email,
        professionalName: professional.name,
        clientName: booking.clientName,
        clientPhone: booking.clientPhone,
        serviceName: professional.serviceName,
        dateLabel,
        timeLabel,
      }).then((result) => logNotification(booking.id, "EMAIL", result, "profesional"))
    );
  }

  await Promise.allSettled(tasks);
}
