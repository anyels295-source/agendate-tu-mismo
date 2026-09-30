import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { createBooking, BookingConflictError } from "@/lib/booking";
import { AppError } from "@/lib/errors";
import { checkDateRange } from "@/lib/validation";

/** Alta manual de un turno desde el panel (botón "+ Nueva reserva" en Reservas). */
const bookingSchema = z
  .object({
    serviceId: z.string().min(1).optional(),
    clientName: z.string().min(2, "El nombre es obligatorio."),
    clientEmail: z.string().min(1, "El email es obligatorio.").email("Ingresá un email válido."),
    clientPhone: z
      .string()
      .min(8, "Si dejás un WhatsApp, ingresá uno válido con código de país, ej. +598 9x xxx xxx.")
      .optional()
      .or(z.literal("")),
    startISO: z.string().min(1),
    endISO: z.string().min(1),
    notes: z.string().max(500).optional(),
  })
  .superRefine(checkDateRange);

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bookingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const professional = await getActiveProfessional();

  try {
    const booking = await createBooking({
      professionalId: professional.id,
      serviceId: parsed.data.serviceId,
      clientName: parsed.data.clientName,
      clientEmail: parsed.data.clientEmail,
      clientPhone: parsed.data.clientPhone || undefined,
      startISO: parsed.data.startISO,
      endISO: parsed.data.endISO,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ bookingId: booking.id, status: booking.status });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Error inesperado (Prisma, red, etc.): nunca reenviar el mensaje real al cliente.
    console.error("Error creando reserva manual:", err);
    return NextResponse.json({ error: "No se pudo crear la reserva. Intentá nuevamente." }, { status: 500 });
  }
}
