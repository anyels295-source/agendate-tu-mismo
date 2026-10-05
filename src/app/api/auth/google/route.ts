import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { signOAuthState } from "@/lib/oauthState";
import { getProfessionalsForOwner } from "@/lib/professional";
import { getGoogleAuthUrl } from "@/lib/calendar/google";

/** Inicia el flujo de conexión de Google Calendar para el profesional indicado. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const searchParams = new URL(req.url).searchParams;
  const professionalId = searchParams.get("professionalId");
  if (!professionalId) {
    return NextResponse.json({ error: "Falta professionalId." }, { status: 400 });
  }
  const popup = searchParams.get("popup") === "1";

  // Solo se puede conectar un calendario a un profesional que administre esta cuenta.
  const professionals = await getProfessionalsForOwner();
  if (!professionals.some((p) => p.id === professionalId)) {
    return NextResponse.json({ error: "Ese profesional no pertenece a esta cuenta." }, { status: 403 });
  }

  const state = await signOAuthState(professionalId, { popup });
  const authUrl = getGoogleAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
