import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/availability";
import { CalendarTokenExpiredError } from "@/lib/calendar/tokenManager";
import { getAdminSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const fromParam = searchParams.get("from"); // YYYY-MM-DD, opcional
  const daysParam = Number(searchParams.get("days") ?? "7");
  const serviceId = searchParams.get("serviceId");
  // El profesional, desde el panel, puede agendar sin respetar el aviso mínimo
  // (sí respeta el horario de atención y los calendarios ocupados).
  const ignoreMinNotice = searchParams.get("admin") === "1" && !!(await getAdminSession());

  if (!slug) {
    return NextResponse.json({ error: "Falta el parámetro 'slug'." }, { status: 400 });
  }

  const professional = await prisma.professional.findUnique({
    where: { slug },
    include: {
      calendarConnections: {
        where: { isActive: true },
      },
    },
  });

  if (!professional || !professional.active) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  if (professional.calendarConnections.length === 0) {
    return NextResponse.json({ error: "Este profesional todavía no tiene calendarios conectados." }, { status: 409 });
  }

  let serviceName = professional.serviceName;
  let durationMinutes = professional.durationMinutes;
  if (serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, professionalId: professional.id, active: true },
    });
    if (!service) {
      return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
    }
    serviceName = service.name;
    durationMinutes = service.durationMinutes;
  }

  const fromDate = fromParam
    ? DateTime.fromISO(fromParam, { zone: professional.timezone })
    : DateTime.now().setZone(professional.timezone);
  const maxToDate = fromDate.plus({ days: professional.maxAdvanceDays });
  const requestedToDate = fromDate.plus({ days: Math.min(daysParam, 14) });
  const toDate = requestedToDate > maxToDate ? maxToDate : requestedToDate;

  try {
    const slots = await getAvailableSlots({
      professional: { ...professional, durationMinutes, ...(ignoreMinNotice ? { minNoticeHours: 0 } : {}) },
      connections: professional.calendarConnections,
      fromDate,
      toDate,
    });

    return NextResponse.json({
      professional: {
        name: professional.name,
        serviceName,
        durationMinutes,
        timezone: professional.timezone,
      },
      slots,
    });
  } catch (err) {
    if (err instanceof CalendarTokenExpiredError) {
      console.warn("Token de calendario expirado:", err.message);
      return NextResponse.json(
        {
          error: "calendar_token_expired",
          message: "La conexión con Google Calendar expiró o fue revocada. El profesional debe reconectar su calendario desde el panel de administración.",
        },
        { status: 409 }
      );
    }
    console.error("Error calculando disponibilidad:", err);
    return NextResponse.json({ error: "No se pudo calcular la disponibilidad en este momento." }, { status: 502 });
  }
}
