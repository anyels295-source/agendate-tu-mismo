import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";

/**
 * Desconectar un calendario (Google/Outlook) ya vinculado.
 *
 * Hasta ahora no existía forma de sacar una conexión rota (ej. un refresh
 * token vencido/revocado) — la única salida era editar la base de datos a
 * mano. Ver agendate_ideas_originales_gap_analysis en memoria del proyecto:
 * mejora pedida el 2026-08-20 al notar un token vencido sin poder reconectar
 * esa cuenta.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const professional = await getActiveProfessional();

  const connection = await prisma.calendarConnection.findFirst({
    where: { id, professionalId: professional.id },
  });
  if (!connection) {
    return NextResponse.json({ error: "Conexión no encontrada." }, { status: 404 });
  }

  // Si esta era la conexión elegida como "calendario de reservas", hay que
  // soltarla también en Professional — si no, bookingCalendarId quedaría
  // apuntando a una fila que ya no existe y las reservas nuevas fallarían
  // silenciosamente al intentar crear el evento.
  await prisma.$transaction([
    ...(professional.bookingCalendarId === id
      ? [prisma.professional.update({ where: { id: professional.id }, data: { bookingCalendarId: null } })]
      : []),
    prisma.calendarConnection.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
