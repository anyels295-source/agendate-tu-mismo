import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { rescheduleBooking, RescheduleConflictError } from "@/lib/booking";
import { AppError } from "@/lib/errors";
import { checkDateRange } from "@/lib/validation";

const schema = z
  .object({
    startISO: z.string().min(1),
    endISO: z.string().min(1),
    channels: z.array(z.enum(["WHATSAPP", "EMAIL", "TEAMS"])).optional(),
  })
  .superRefine(checkDateRange);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const professional = await getActiveProfessional();

  try {
    const booking = await rescheduleBooking({
      professionalId: professional.id,
      bookingId: id,
      startISO: parsed.data.startISO,
      endISO: parsed.data.endISO,
      channels: parsed.data.channels,
    });
    return NextResponse.json({ ok: true, booking });
  } catch (err) {
    if (err instanceof RescheduleConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error reprogramando reserva:", err);
    return NextResponse.json({ error: "No se pudo reprogramar el turno. Intentá nuevamente." }, { status: 500 });
  }
}
