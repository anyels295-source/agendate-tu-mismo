import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  price: z.string().max(50).nullable().optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

async function assertOwnership(id: string) {
  const professional = await getActiveProfessional();
  const service = await prisma.service.findFirst({ where: { id, professionalId: professional.id } });
  if (!service) return null;
  return service;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await params;
  const existing = await assertOwnership(id);
  if (!existing) {
    return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const service = await prisma.service.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true, service });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await params;
  const existing = await assertOwnership(id);
  if (!existing) {
    return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });
  }

  // No borramos en duro para no romper reservas históricas que lo referencian
  // (Booking.serviceId queda en SET NULL); simplemente lo desactivamos si tiene
  // reservas asociadas, o lo eliminamos si nunca se usó.
  const bookingCount = await prisma.booking.count({ where: { serviceId: id } });
  if (bookingCount > 0) {
    await prisma.service.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true, deactivated: true });
  }

  await prisma.service.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}
