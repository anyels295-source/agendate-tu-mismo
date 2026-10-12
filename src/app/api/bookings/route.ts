import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createBooking, BookingConflictError } from "@/lib/booking";
import { AppError } from "@/lib/errors";
import { checkDateRange, optionalPhoneSchema, CLIENT_NAME_MAX_LENGTH, validationErrorMessage } from "@/lib/validation";
import { checkRateLimit, getClientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/turnstile";

const bookingSchema = z
  .object({
    slug: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    clientName: z.string().trim().min(2, "El nombre es obligatorio.").max(CLIENT_NAME_MAX_LENGTH, "El nombre es demasiado largo."),
    // El email es el contacto obligatorio; WhatsApp quedó opcional — si el
    // cliente lo completa, además se le avisa por ahí. Ver
    // agendate_ideas_originales_gap_analysis en memoria del proyecto,
    // pedido el 2026-08-24.
    clientEmail: z.string().min(1, "El email es obligatorio.").email("Ingresá un email válido."),
    clientPhone: optionalPhoneSchema,
    startISO: z.string().min(1),
    endISO: z.string().min(1),
    notes: z.string().max(500).optional(),
    // Campo trampa (honeypot): las personas no lo ven, un bot sí lo rellena.
    website: z.string().max(500).optional(),
    // Token de Cloudflare Turnstile (CAPTCHA); solo se exige si está configurado.
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine(checkDateRange);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = await checkRateLimit(RATE_LIMITS.bookings, ip);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const json = await req.json().catch(() => null);
  const parsed = bookingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: validationErrorMessage(parsed.error) }, { status: 400 });
  }

  // Si el campo trampa llegó con texto, fue un bot: se responde como si todo hubiera
  // salido bien (para no darle pistas) pero no se crea nada.
  if (parsed.data.website) {
    return NextResponse.json({ bookingId: "descartada", status: "PENDING" });
  }

  if (isTurnstileEnabled() && !(await verifyTurnstileToken(parsed.data.turnstileToken, ip))) {
    return NextResponse.json(
      { error: "No pudimos verificar que seas una persona. Esperá unos segundos y volvé a tocar Confirmar turno." },
      { status: 400 }
    );
  }

  // Además del límite por IP, se limita cuántas reservas reciben un mismo email en el día, venga
  // de donde venga el pedido: impide usar el formulario para llenarle la casilla a alguien.
  const emailLimit = await checkRateLimit(RATE_LIMITS.bookingsPerEmail, parsed.data.clientEmail.trim().toLowerCase());
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Se hicieron demasiadas reservas con este email hoy. Probá de nuevo mañana o escribile al profesional." },
      { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } }
    );
  }

  const professional = await prisma.professional.findUnique({ where: { slug: parsed.data.slug } });
  if (!professional) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

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

    return NextResponse.json({ bookingId: booking.id, status: booking.status, emailSent: booking.clientEmailStatus === "SENT" });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error creando reserva:", err);
    return NextResponse.json({ error: "No se pudo crear la reserva. Intentá nuevamente." }, { status: 500 });
  }
}
