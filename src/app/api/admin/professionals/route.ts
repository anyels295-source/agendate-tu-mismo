import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validationErrorMessage } from "@/lib/validation";
import { getAdminSession } from "@/lib/auth";
import { getProfessionalsForOwner, createTeamProfessional } from "@/lib/professional";
import { AppError } from "@/lib/errors";

const createSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio."),
  email: z.string().email("Ingresá un email válido."),
});

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const professionals = await getProfessionalsForOwner();
  return NextResponse.json({ professionals });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: validationErrorMessage(parsed.error) }, { status: 400 });
  }

  try {
    const professional = await createTeamProfessional(parsed.data);
    return NextResponse.json({ ok: true, professional });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Error creando profesional:", err);
    return NextResponse.json({ error: "No se pudo crear el profesional. Intentá nuevamente." }, { status: 500 });
  }
}
