"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

/**
 * Página a la que lleva el botón "Confirmar mi turno" del email de pedido de confirmación.
 * Confirma recién al tocar el botón, no al abrir la página: los antivirus de correo abren
 * los links de los emails, y si abrir bastara, confirmarían turnos que nadie pidió.
 */
export default function ConfirmarPage() {
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/bookings/confirm/${params.token}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No pudimos confirmar el turno. Intentá de nuevo.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
      setStatus("error");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {status === "done" ? (
        <>
          <h1 className="text-xl font-semibold text-gray-800">Turno confirmado</h1>
          <p className="mt-2 text-gray-600">¡Listo! Te mandamos un email con la confirmación. Te esperamos.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-gray-800">¿Confirmás tu turno?</h1>
          <p className="mt-2 text-gray-600">La fecha y la hora están en el email que te mandamos.</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={status === "loading"}
            className="mt-5 rounded-lg bg-[#1c7a43] px-5 py-2.5 font-medium text-white transition hover:bg-[#166236] disabled:opacity-60"
          >
            {status === "loading" ? "Confirmando…" : "Sí, confirmo mi turno"}
          </button>
        </>
      )}
    </main>
  );
}
