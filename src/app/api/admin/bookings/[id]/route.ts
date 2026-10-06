import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validationErrorMessage } from "@/lib/validation";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { adminSetBookingStatus } from "@/lib/booking";
import { AppError } from "@/lib/errors";

const patchSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: validationErrorMessage(parsed.error) }, { status: 400 });
  }

  const professional = await getActiveProfessional();

  try {
    const booking = await adminSetBookingStatus({
      professionalId: professional.id,
      bookingId: id,
      status: parsed.data.status,
    });
    // Solo al confirmar un turno pendiente se intenta avisar al cliente: se informa si el email salió.
    const clientEmailStatus = (booking as { clientEmailStatus?: string | null }).clientEmailStatus;
    return NextResponse.json({ ok: true, booking, emailSent: clientEmailStatus === undefined ? undefined : clientEmailStatus === "SENT" });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error actualizando estado de reserva:", err);
    return NextResponse.json({ error: "No se pudo actualizar la reserva. Intentá nuevamente." }, { status: 500 });
  }
}
