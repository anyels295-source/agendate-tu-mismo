import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOAuthState, tryVerifyOAuthState } from "@/lib/oauthState";
import { renderOAuthPopupClosePage } from "@/lib/oauthPopup";
import { exchangeOutlookCode } from "@/lib/calendar/outlook";
import { encryptToken } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const parsedState = await tryVerifyOAuthState(state);
    if (parsedState?.popup) {
      return renderOAuthPopupClosePage({
        ok: false,
        provider: "outlook",
        message: `Microsoft no pudo completar la conexión (${error}). Revisá las credenciales configuradas y volvé a intentar.`,
      });
    }
    return NextResponse.redirect(new URL(`/admin/calendarios?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    const parsedState = await tryVerifyOAuthState(state);
    if (parsedState?.popup) {
      return renderOAuthPopupClosePage({ ok: false, provider: "outlook", message: "Faltaron parámetros en la respuesta de Microsoft." });
    }
    return NextResponse.redirect(new URL("/admin/calendarios?error=faltan_parametros", req.url));
  }

  try {
    const { professionalId, popup } = await verifyOAuthState(state);
    const tokens = await exchangeOutlookCode(code);

    await prisma.calendarConnection.upsert({
      where: {
        professionalId_provider_accountEmail: {
          professionalId,
          provider: "OUTLOOK",
          accountEmail: tokens.email,
        },
      },
      update: {
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        isActive: true,
      },
      create: {
        professionalId,
        provider: "OUTLOOK",
        accountEmail: tokens.email,
        externalCalendarId: "primary",
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });

    if (popup) {
      return renderOAuthPopupClosePage({
        ok: true,
        provider: "outlook",
        message: `Outlook / Microsoft 365 (${tokens.email}) quedó conectado. Ya podés cerrar esta ventana.`,
      });
    }
    return NextResponse.redirect(new URL("/admin/calendarios?connected=outlook", req.url));
  } catch (err) {
    console.error("Error en callback de Outlook:", err);
    const parsedState = await tryVerifyOAuthState(state);
    if (parsedState?.popup) {
      return renderOAuthPopupClosePage({
        ok: false,
        provider: "outlook",
        message: "No se pudo completar la conexión con Microsoft. Probá de nuevo en unos segundos.",
      });
    }
    return NextResponse.redirect(new URL("/admin/calendarios?error=outlook_callback_failed", req.url));
  }
}
