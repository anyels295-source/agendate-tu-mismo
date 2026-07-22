import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createBooking, BookingConflictError } from "@/lib/booking";

const bookingSchema = z.object({
  slug: z.string().min(1),
  clientName: z.string().min(2, "El nombre es obligatorio."),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().min(8, "Ingresá un teléfono válido con código de país, ej. +598 9x xxx xxx."),
  startISO: z.string().min(1),
  endISO: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bookingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const professional = await prisma.professional.findUnique({ where: { slug: parsed.data.slug } });
  if (!professional) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  try {
    const booking = await createBooking({
      professionalId: professional.id,
      clientName: parsed.data.clientName,
      clientEmail: parsed.data.clientEmail || undefined,
      clientPhone: parsed.data.clientPhone,
      startISO: parsed.data.startISO,
      endISO: parsed.data.endISO,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ bookingId: booking.id, status: booking.status });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Error creando reserva:", err);
    return NextResponse.json({ error: "No se pudo crear la reserva. Intentá nuevamente." }, { status: 500 });
  }
}
