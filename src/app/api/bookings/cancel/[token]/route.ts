import { NextRequest, NextResponse } from "next/server";
import { cancelBooking } from "@/lib/booking";
import { AppError } from "@/lib/errors";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const booking = await cancelBooking(token);
    return NextResponse.json({ status: booking.status });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error cancelando reserva:", err);
    return NextResponse.json({ error: "No se pudo cancelar la reserva. Intentá nuevamente." }, { status: 500 });
  }
}
