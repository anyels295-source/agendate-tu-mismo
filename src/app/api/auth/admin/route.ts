import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminCredentials, createAdminSession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ingresá email y contraseña." }, { status: 400 });
  }

  const valid = await verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!valid) {
    return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 });
  }

  await createAdminSession(parsed.data.email);
  return NextResponse.json({ ok: true });
}
