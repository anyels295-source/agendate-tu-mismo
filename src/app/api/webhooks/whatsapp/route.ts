import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook de WhatsApp Business Cloud API. Por ahora solo implementa la
 * verificación inicial que exige Meta al registrar el webhook (GET) y deja
 * un punto de extensión (POST) para una fase futura: permitir que el
 * cliente cancele o reprograme respondiendo directamente al WhatsApp de
 * confirmación (fuera del alcance del MVP v1, ver informe de riesgos).
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verificación fallida." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // TODO (fase 2): interpretar respuestas del cliente (ej. "CANCELAR") y
  // llamar a cancelBooking(). Por ahora solo se registra para diagnóstico.
  console.log("Webhook de WhatsApp recibido:", JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
