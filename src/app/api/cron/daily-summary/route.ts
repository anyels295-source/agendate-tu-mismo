import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { buildDailySummary } from "@/lib/dailySummary";
import { sendDailySummaryEmail } from "@/lib/notifications/email";

/**
 * Resumen diario automático por email (ver src/lib/dailySummary.ts).
 *
 * Pensado para dispararse una vez por día vía un cron externo (Vercel Cron,
 * ver vercel.json, o cualquier scheduler tipo n8n/cron-job.org apuntando acá
 * con el header correcto). No depende de que el profesional entre al Panel:
 * es la respuesta directa al pedido de "reportes"/"resúmenes" de las dos
 * ideas originales — ver agendate_ideas_originales_gap_analysis en memoria
 * del proyecto.
 *
 * Se protege con CRON_SECRET porque, a diferencia de los webhooks de
 * WhatsApp/OAuth, esta ruta no tiene ninguna firma que verificar del lado
 * del proveedor: cualquiera que la encuentre podría disparar el envío de
 * emails a todos los profesionales si no se exige un secreto compartido.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET no configurado todavía." }, { status: 501 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const professionals = await prisma.professional.findMany({ where: { active: true, notifyEmail: true } });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const now = DateTime.now();

  const results = await Promise.allSettled(
    professionals.map(async (professional) => {
      const summary = await buildDailySummary(professional, now);
      return sendDailySummaryEmail({
        toEmail: professional.email,
        professionalName: professional.name,
        dateLabel: summary.dateLabel,
        panelUrl: `${appUrl}/admin`,
        totalToday: summary.totalToday,
        bookingsToday: summary.bookingsToday,
        failedNotificationsYesterday: summary.failedNotificationsYesterday,
        bookingsThisWeekCount: summary.bookingsThisWeekCount,
        occupancyThisWeek: summary.occupancyThisWeek,
        cancelledThisMonthCount: summary.cancelledThisMonthCount,
      });
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled" && r.value.status === "SENT").length;
  const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.status === "FAILED")).length;

  return NextResponse.json({ ok: true, professionalsProcessed: professionals.length, sent, failed });
}
