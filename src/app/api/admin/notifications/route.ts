import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/professional";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  notifyWhatsapp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifyTeams: z.boolean().optional(),
  teamsWebhookUrl: z.string().url().max(500).nullable().optional().or(z.literal("")),
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
