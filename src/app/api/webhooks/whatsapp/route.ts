import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook de WhatsApp Business Cloud API. Por ahora solo implementa la
 * verificación inicial que exige Meta al registrar el webhook (GET) y deja
 * un punto de extensión (POST) para una fase futura: permitir que el
 * cliente cancele o reprograme respondiendo directamente al WhatsApp de
 * confirmación (fuera del alcance del MVP v1, ver informe de riesgos).
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expectedToken && token && safeEqual(token, expectedToken) && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verificación fallida." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  // Meta firma cada aviso con la clave secreta de la app (HMAC SHA-256 del cuerpo en el
  // encabezado X-Hub-Signature-256). Sin esa firma cualquiera podría mandar avisos falsos.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 501 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  if (!safeEqual(signature, expected)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  // TODO (fase 2): interpretar respuestas del cliente (ej. "CANCELAR") y llamar a
  // cancelBooking(). Por ahora solo se confirma la recepción, sin registrar el contenido
  // (puede incluir teléfonos y mensajes de clientes).
  return NextResponse.json({ ok: true });
}
