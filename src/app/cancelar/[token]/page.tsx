"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function CancelarPage() {
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleCancel() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/bookings/cancel/${params.token}`, { method: "POST" });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {status === "done" ? (
        <>
          <h1 className="text-xl font-semibold text-gray-800">Turno cancelado</h1>
          <p className="mt-2 text-gray-600">Avisamos al profesional. El horario ya quedó libre para otras personas.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-gray-800">¿Cancelar este turno?</h1>
          <p className="mt-2 text-gray-600">Esta acción no se puede deshacer.</p>
          {status === "error" && <p className="mt-2 text-sm text-red-600">No pudimos cancelar el turno. Intentá de nuevo.</p>}
          <button
            onClick={handleCancel}
            disabled={status === "loading"}
            className="mt-5 rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {status === "loading" ? "Cancelando…" : "Sí, cancelar turno"}
          </button>
        </>
      )}
    </main>
  );
}
