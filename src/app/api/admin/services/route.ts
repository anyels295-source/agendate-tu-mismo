import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";
import { priceSchema, SERVICE_DURATION_ERROR_MESSAGE } from "@/lib/validation";

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(80, "El nombre es demasiado largo."),
  durationMinutes: z.number().int(SERVICE_DURATION_ERROR_MESSAGE).min(5, SERVICE_DURATION_ERROR_MESSAGE).max(480, SERVICE_DURATION_ERROR_MESSAGE).default(30),
  price: priceSchema.optional(),
});

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const professional = await getActiveProfessional();
  const services = await prisma.service.findMany({
    where: { professionalId: professional.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ services });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const professional = await getActiveProfessional();
  const count = await prisma.service.count({ where: { professionalId: professional.id } });

  const service = await prisma.service.create({
    data: {
      professionalId: professional.id,
      name: parsed.data.name,
      durationMinutes: parsed.data.durationMinutes,
      price: parsed.data.price,
      order: count,
    },
  });

  return NextResponse.json({ ok: true, service });
}
