import { NextRequest, NextResponse } from "next/server";
import { cancelBooking } from "@/lib/booking";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const booking = await cancelBooking(token);
    return NextResponse.json({ status: booking.status });
  } catch (err) {
    console.error("Error cancelando reserva:", err);
    return NextResponse.json({ error: "No se pudo cancelar la reserva." }, { status: 500 });
  }
}
