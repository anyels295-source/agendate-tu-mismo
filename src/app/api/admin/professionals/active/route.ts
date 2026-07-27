import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { setActiveProfessional } from "@/lib/professional";
import { AppError } from "@/lib/errors";

const schema = z.object({ professionalId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    const professional = await setActiveProfessional(parsed.data.professionalId);
    return NextResponse.json({ ok: true, professional });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error cambiando de profesional:", err);
    return NextResponse.json({ error: "No se pudo cambiar de profesional. Intentá nuevamente." }, { status: 500 });
  }
}
