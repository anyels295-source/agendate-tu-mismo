import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminCredentials, createAdminSession } from "@/lib/auth";
import { checkRateLimit, getClientIp, tooManyRequests, RATE_LIMITS } from "@/lib/rateLimit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ipLimit = await checkRateLimit(RATE_LIMITS.loginIp, getClientIp(req));
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

  const json = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ingresá email y contraseña." }, { status: 400 });
  }

  // Además del límite por IP, se limita por email: frena ataques repartidos entre muchas IP.
  const emailLimit = await checkRateLimit(RATE_LIMITS.loginEmail, parsed.data.email.toLowerCase());
  if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterSeconds);

  const valid = await verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!valid) {
    return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
  }

  await createAdminSession(parsed.data.email);
  return NextResponse.json({ ok: true });
}
