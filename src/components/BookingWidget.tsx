"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";

type FreeSlot = { startISO: string; endISO: string };
type AvailabilityResponse = {
  professional: { name: string; serviceName: string; durationMinutes: number; timezone: string };
  slots: FreeSlot[];
};

/**
 * Widget de reserva pensado para usuarios poco tecnológicos (hallazgo clave
 * de la investigación de mercado): pocos pasos, botones grandes, sin
 * necesidad de crear cuenta ni de entender zonas horarias o husos.
 */
export default function BookingWidget({ slug }: { slug: string }) {
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [step, setStep] = useState<"elegir" | "datos" | "confirmado">("elegir");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ clientName: "", clientPhone: "", clientEmail: "", notes: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/availability?slug=${encodeURIComponent(slug)}&days=10`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la disponibilidad.");
        return json as AvailabilityResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const slotsByDay = useMemo(() => {
    if (!data) return new Map<string, FreeSlot[]>();
    const map = new Map<string, FreeSlot[]>();
    for (const slot of data.slots) {
      const day = DateTime.fromISO(slot.startISO).setZone(data.professional.timezone).toISODate()!;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(slot);
    }
    return map;
  }, [data]);

  const days = useMemo(() => Array.from(slotsByDay.keys()).sort(), [slotsByDay]);

  useEffect(() => {
    if (!selectedDay && days.length > 0) setSelectedDay(days[0]);
  }, [days, selectedDay]);

  async function handleSubmit() {
    if (!selectedSlot || !data) return;
    setFormError(null);

    if (form.clientName.trim().length < 2) {
      setFormError("Ingresá tu nombre.");
      return;
    }
    if (form.clientPhone.trim().length < 8) {
      setFormError("Ingresá tu teléfono con código de país, ej. +598 9x xxx xxx.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          clientName: form.clientName,
          clientPhone: form.clientPhone,
          clientEmail: form.clientEmail || undefined,
          notes: form.notes || undefined,
          startISO: selectedSlot.startISO,
          endISO: selectedSlot.endISO,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "No se pudo confirmar la reserva.");
        setSubmitting(false);
        return;
      }
      setStep("confirmado");
    } catch {
      setFormError("Error de conexión. Intentá nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-center text-gray-500">Cargando horarios disponibles…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-center text-red-700">
        <p className="font-medium">No pudimos cargar la disponibilidad.</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!data || days.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-center text-amber-800">
        No hay horarios disponibles en los próximos días. Volvé a intentar más tarde.
      </div>
    );
  }

  if (step === "confirmado") {
    const dt = DateTime.fromISO(selectedSlot!.startISO).setZone(data.professional.timezone).setLocale("es");
    return (
      <div className="rounded-xl bg-green-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-2xl text-white">✓</div>
        <h2 className="text-xl font-semibold text-green-800">¡Turno confirmado!</h2>
        <p className="mt-1 text-green-700">
          {dt.toFormat("cccc d 'de' LLLL")} a las {dt.toFormat("HH:mm")}
        </p>
        <p className="mt-3 text-sm text-green-700">
          Te enviamos la confirmación por WhatsApp{form.clientEmail ? " y por email" : ""}.
        </p>
      </div>
    );
  }

  if (step === "datos" && selectedSlot) {
    const dt = DateTime.fromISO(selectedSlot.startISO).setZone(data.professional.timezone).setLocale("es");
    return (
      <div>
        <button onClick={() => setStep("elegir")} className="mb-4 text-sm text-brand-600 hover:underline">
          ← Elegir otro horario
        </button>
        <div className="mb-5 rounded-lg bg-brand-50 p-3 text-center text-brand-700">
          <p className="font-medium">
            {dt.toFormat("cccc d 'de' LLLL")} · {dt.toFormat("HH:mm")}
          </p>
          <p className="text-sm">{data.professional.serviceName} con {data.professional.name}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre y apellido *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              placeholder="Tu nombre"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none"
              value={form.clientPhone}
              onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
              placeholder="+598 9x xxx xxx"
            />
            <p className="mt-1 text-xs text-gray-500">Ahí te confirmamos el turno.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email (opcional)</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none"
              value={form.clientEmail}
              onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Comentario (opcional)</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-brand-600 py-3 text-base font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Confirmando…" : "Confirmar turno"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const dt = DateTime.fromISO(day).setLocale("es");
          const active = day === selectedDay;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
                active ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              <div className="font-medium">{dt.toFormat("ccc")}</div>
              <div>{dt.toFormat("d LLL")}</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(slotsByDay.get(selectedDay ?? days[0]) ?? []).map((slot) => {
          const dt = DateTime.fromISO(slot.startISO).setZone(data.professional.timezone);
          return (
            <button
              key={slot.startISO}
              onClick={() => {
                setSelectedSlot(slot);
                setStep("datos");
              }}
              className="rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition hover:border-brand-500 hover:bg-brand-50"
            >
              {dt.toFormat("HH:mm")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
