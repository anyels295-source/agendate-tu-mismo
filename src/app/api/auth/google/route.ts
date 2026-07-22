import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { signOAuthState } from "@/lib/oauthState";
import { getGoogleAuthUrl } from "@/lib/calendar/google";

/** Inicia el flujo de conexión de Google Calendar para el profesional indicado. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const professionalId = new URL(req.url).searchParams.get("professionalId");
  if (!professionalId) {
    return NextResponse.json({ error: "Falta professionalId." }, { status: 400 });
  }

  const state = await signOAuthState(professionalId);
  const authUrl = getGoogleAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
