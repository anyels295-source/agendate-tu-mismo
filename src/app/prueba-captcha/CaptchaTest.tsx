"use client";

import { useEffect, useState } from "react";
import TurnstileWidget, { TURNSTILE_SITE_KEY } from "@/components/TurnstileWidget";

/** Muestra el widget y anota, con la hora, cada cosa que informa Cloudflare. */
export default function CaptchaTest() {
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState<"esperando" | "ok" | "error">("esperando");
  const [browser, setBrowser] = useState("");
  useEffect(() => setBrowser(navigator.userAgent), []);
  const add = (line: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} · ${line}`]);

  return (
    <main className="mx-auto max-w-md px-5 py-10 text-center">
      <h1 className="text-xl font-bold text-brand-700">Prueba del CAPTCHA</h1>
      <p className="mt-1 text-sm text-gray-500">
        {TURNSTILE_SITE_KEY ? "Clave del sitio cargada." : "No hay clave del sitio en este entorno."}
      </p>
      <div className="mt-6">
        <TurnstileWidget
          onToken={(token) => {
            if (token) {
              setStatus("ok");
              add(`resuelto (token de ${token.length} caracteres)`);
            }
          }}
          onError={(code) => {
            if (code) {
              setStatus("error");
              add(code === "tiempo" ? "sin respuesta en 20 segundos" : `error de Cloudflare ${code}`);
            }
          }}
        />
      </div>
      <p
        className={`mt-6 text-3xl font-bold ${
          status === "ok" ? "text-green-600" : status === "error" ? "text-red-600" : "text-gray-400"
        }`}
      >
        {status === "ok" ? "Funciona" : status === "error" ? "No funciona" : "Verificando…"}
      </p>
      <ul className="mt-4 space-y-1 text-left text-sm text-gray-600">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-gray-400">{browser}</p>
    </main>
  );
}
