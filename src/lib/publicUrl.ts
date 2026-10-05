import { headers } from "next/headers";

/**
 * Dirección base para mostrar y copiar el link público de reservas desde el panel.
 * En producción es la dirección configurada (APP_URL). En los entornos de prueba
 * (preview) es la del propio despliegue en el que se está trabajando, así el botón
 * "Página pública" abre lo que realmente se está probando.
 */
export async function getPublicBaseUrl(): Promise<string> {
  const configured = process.env.APP_URL ?? "http://localhost:3000";
  if (process.env.VERCEL_ENV === "production") return configured;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return configured;
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
