import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getOrCreateActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";

const dayRange = z.object({ start: z.string(), end: z.string() });
const workingHoursSchema = z
  .object({
    mon: z.array(dayRange),
    tue: z.array(dayRange),
    wed: z.array(dayRange),
    thu: z.array(dayRange),
    fri: z.array(dayRange),
    sat: z.array(dayRange),
    sun: z.array(dayRange),
  })
  .partial();

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  serviceName: z.string().min(1).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  minNoticeHours: z.number().int().min(0).max(168).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  timezone: z.string().optional(),
  bookingCalendarId: z.string().optional(),
  workingHours: workingHoursSchema.optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const professional = await getOrCreateActiveProfessional();

  if (parsed.data.bookingCalendarId) {
    const belongsToProfessional = await prisma.calendarConnection.findFirst({
      where: { id: parsed.data.bookingCalendarId, professionalId: professional.id },
    });
    if (!belongsToProfessional) {
      return NextResponse.json({ error: "Esa conexión de calendario no existe." }, { status: 400 });
    }
  }

  const updated = await prisma.professional.update({
    where: { id: professional.id },
    data: {
      ...parsed.data,
      workingHours: parsed.data.workingHours
        ? { ...(professional.workingHours as object), ...parsed.data.workingHours }
        : undefined,
    },
  });

  return NextResponse.json({ ok: true, professional: updated });
}
