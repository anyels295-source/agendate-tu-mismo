import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOAuthState } from "@/lib/oauthState";
import { exchangeGoogleCode } from "@/lib/calendar/google";
import { encryptToken } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin/calendarios?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/calendarios?error=faltan_parametros", req.url));
  }

  try {
    const { professionalId } = await verifyOAuthState(state);
    const tokens = await exchangeGoogleCode(code);

    await prisma.calendarConnection.upsert({
      where: {
        professionalId_provider_accountEmail: {
          professionalId,
          provider: "GOOGLE",
          accountEmail: tokens.email,
        },
      },
      update: {
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
      create: {
        professionalId,
        provider: "GOOGLE",
        accountEmail: tokens.email,
        externalCalendarId: "primary",
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });

    return NextResponse.redirect(new URL("/admin/calendarios?connected=google", req.url));
  } catch (err) {
    console.error("Error en callback de Google:", err);
    return NextResponse.redirect(new URL("/admin/calendarios?error=google_callback_failed", req.url));
  }
}
