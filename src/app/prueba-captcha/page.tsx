import { notFound } from "next/navigation";
import CaptchaTest from "./CaptchaTest";

export const metadata = { title: "Prueba del CAPTCHA" };
// Se decide en cada pedido (no al compilar), para leer VERCEL_ENV del despliegue.
export const dynamic = "force-dynamic";

/**
 * Página de diagnóstico del CAPTCHA (Cloudflare Turnstile): muestra solo el widget
 * y si se resolvió o qué código de error dio. Nunca existe en producción.
 */
export default function PruebaCaptchaPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <CaptchaTest />;
}
