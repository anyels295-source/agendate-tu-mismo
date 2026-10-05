import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getOrCreateActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";
import { validateWorkingHours, isValidTimezone } from "@/lib/validation";

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
  .partial()
  .superRefine((workingHours, ctx) => {
    const message = validateWorkingHours(workingHours);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

const patchSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(80, "El nombre es demasiado largo.").optional(),
  slug: z
    .string()
    .min(2, "El link de reserva necesita al menos 2 caracteres.")
    .regex(/^[a-z0-9-]+$/, "El link de reserva solo puede tener minúsculas, números y guiones.")
    .optional(),
  serviceName: z.string().trim().min(1, "El nombre del servicio es obligatorio.").max(80, "El nombre del servicio es demasiado largo.").optional(),
  durationMinutes: z.number().int("La duración debe ser un número entero.").min(5, "La duración debe estar entre 5 y 480 minutos.").max(480, "La duración debe estar entre 5 y 480 minutos.").optional(),
  bufferMinutes: z.number().int("El colchón debe ser un número entero.").min(0, "El colchón debe estar entre 0 y 120 minutos.").max(120, "El colchón debe estar entre 0 y 120 minutos.").optional(),
  minNoticeHours: z.number().int("La anticipación debe ser un número entero.").min(0, "La anticipación debe estar entre 0 y 168 horas.").max(168, "La anticipación debe estar entre 0 y 168 horas.").optional(),
  maxAdvanceDays: z.number().int("Los días de anticipación máxima deben ser un número entero.").min(1, "La anticipación máxima debe estar entre 1 y 365 días.").max(365, "La anticipación máxima debe estar entre 1 y 365 días.").optional(),
  timezone: z.string().refine(isValidTimezone, "La zona horaria no es válida.").optional(),
  bookingCalendarId: z.string().optional(),
  workingHours: workingHoursSchema.optional(),
  // Data URL base64 (ya comprimida en el cliente antes de subir). El límite
  // es un resguardo por si algo llega sin comprimir; en uso normal una foto
  // 320x320 JPEG pesa muchísimo menos que esto.
  photoUrl: z.string().max(400_000).nullable().optional(),
  theme: z.enum(["claro", "arena", "bosque", "noche"]).optional(),
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
