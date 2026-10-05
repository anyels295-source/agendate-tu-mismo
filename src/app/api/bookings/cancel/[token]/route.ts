import { NextRequest, NextResponse } from "next/server";
import { cancelBooking } from "@/lib/booking";
import { AppError } from "@/lib/errors";
import { checkRateLimit, getClientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = await checkRateLimit(RATE_LIMITS.cancel, getClientIp(req));
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

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
