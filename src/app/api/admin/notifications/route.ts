import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  notifyWhatsapp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifyTeams: z.boolean().optional(),
  teamsWebhookUrl: z
    .string()
    .url("Ingresá una URL válida.")
    .max(500)
    .refine((value) => {
      // Solo https y un nombre de dominio (no una IP ni localhost): evita que el servidor sea usado para llamar a direcciones internas.
      const url = new URL(value);
      const isIp = /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":");
      return url.protocol === "https:" && !isIp && url.hostname.includes(".") && url.hostname !== "localhost";
    }, "La URL del webhook de Teams debe ser https y de un dominio público.")
    .nullable()
    .optional()
    .or(z.literal("")),
});

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const professional = await getActiveProfessional();
  const { teamsWebhookUrl, ...rest } = parsed.data;

  const updated = await prisma.professional.update({
    where: { id: professional.id },
    data: {
      ...rest,
      ...(teamsWebhookUrl !== undefined ? { teamsWebhookUrl: teamsWebhookUrl || null } : {}),
    },
  });

  return NextResponse.json({ ok: true, professional: updated });
}
