import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Endpoint público: lista de servicios activos de un profesional, para que su página de reserva ofrezca elegir uno. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Falta el parámetro 'slug'." }, { status: 400 });
  }

  const professional = await prisma.professional.findUnique({ where: { slug } });
  if (!professional) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  const services = await prisma.service.findMany({
    where: { professionalId: professional.id, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, durationMinutes: true, price: true },
  });

  return NextResponse.json({ services });
}
