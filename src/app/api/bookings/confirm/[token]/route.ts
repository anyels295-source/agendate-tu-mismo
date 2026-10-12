import { NextRequest, NextResponse } from "next/server";
import { confirmBookingByClient } from "@/lib/booking";
import { AppError } from "@/lib/errors";
import { checkRateLimit, getClientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";

/** El cliente confirma su turno pendiente desde el link del email de pedido de confirmación. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = await checkRateLimit(RATE_LIMITS.confirm, getClientIp(req));
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const { token } = await params;
  try {
    const booking = await confirmBookingByClient(token);
    return NextResponse.json({ status: booking.status });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error confirmando reserva:", err);
    return NextResponse.json({ error: "No se pudo confirmar el turno. Intentá nuevamente." }, { status: 500 });
  }
}
