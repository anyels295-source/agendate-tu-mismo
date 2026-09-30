"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { IconClose } from "./icons";
import { useEscapeKey } from "@/lib/useEscapeKey";

type FreeSlot = { startISO: string; endISO: string };
type AvailabilityResponse = {
  professional: { timezone: string };
  slots: FreeSlot[];
};
type ServiceOption = { id: string; name: string; durationMinutes: number; price: string | null };

/**
 * Alta manual de un turno desde el panel (botón "+ Nueva reserva" en
 * Reservas). Reutiliza el mismo endpoint de disponibilidad que la página
 * pública y el widget de reserva, para no ofrecer nunca un horario que en
 * realidad ya está ocupado en el calendario real.
 */
export default function NewBookingModal({
  professionalSlug,
  initialDateISO,
  onClose,
  onDone,
}: {
  professionalSlug: string;
  initialDateISO?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  useEscapeKey(onClose);
  const [services, setServices] = useState<ServiceOption[] | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ clientName: "", clientPhone: "", clientEmail: "", notes: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/services?slug=${encodeURIComponent(professionalSlug)}`)
      .then((res) => res.json())
      .then((json) => {
        const list: ServiceOption[] = json.services ?? [];
        setServices(list);
        if (list.length > 0) setSelectedServiceId(list[0].id);
      })
      .catch(() => setServices([]));
  }, [professionalSlug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ slug: professionalSlug, days: "10" });
    if (selectedServiceId) query.set("serviceId", selectedServiceId);
    fetch(`/api/availability?${query.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la disponibilidad.");
        return json as AvailabilityResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
        setSelectedDay(null);
        setSelectedSlot(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [professionalSlug, selectedServiceId]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, FreeSlot[]>();
    if (!data) return map;
    for (const slot of data.slots) {
      const day = DateTime.fromISO(slot.startISO).setZone(data.professional.timezone).toISODate()!;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(slot);
    }
    return map;
  }, [data]);

  const days = useMemo(() => Array.from(slotsByDay.keys()).sort().slice(0, 6), [slotsByDay]);

  useEffect(() => {
    if (selectedDay) return;
    if (initialDateISO && days.includes(initialDateISO)) {
      setSelectedDay(initialDateISO);
    } else if (days.length > 0) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay, initialDateISO]);

  async function submit() {
    if (!selectedSlot || !data) return;
    setFormError(null);

    if (form.clientName.trim().length < 2) {
      setFormError("Ingresá el nombre del cliente.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail.trim())) {
      setFormError("Ingresá un email válido.");
      return;
    }
    // El WhatsApp es opcional, pero si se completa que sea algo razonable.
    if (form.clientPhone.trim() && form.clientPhone.trim().length < 8) {
      setFormError("Si ingresás WhatsApp, poné uno válido con código de país, ej. +598 9x xxx xxx.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedServiceId ?? undefined,
          clientName: form.clientName.trim(),
          clientPhone: form.clientPhone.trim() || undefined,
          clientEmail: form.clientEmail.trim(),
          notes: form.notes.trim() || undefined,
          startISO: selectedSlot.startISO,
          endISO: selectedSlot.endISO,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(json.error ?? "No se pudo crear la reserva.");
        setSaving(false);
        return;
      }
      const dt = DateTime.fromISO(selectedSlot.startISO).setZone(data.professional.timezone).setLocale("es");
      onDone(`Reserva creada para ${form.clientName.trim()} · ${dt.toFormat("d LLL yyyy")} · ${dt.toFormat("HH:mm")}`);
    } catch {
      setFormError("Error de conexión. Intentá nuevamente.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--ink)]/45 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-[20px] bg-[var(--surface)] p-6 shadow-[0_30px_70px_-20px_rgba(22,35,61,0.5)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nueva reserva"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[18px] font-extrabold text-[var(--ink)]">Nueva reserva</div>
            <div className="mt-0.5 text-[13px] text-[var(--muted-nav)]">Alta manual de un turno</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--page)] text-[var(--muted-nav)]">
            <IconClose />
          </button>
        </div>

        {loading && <p className="text-sm text-[var(--muted-nav)]">Cargando horarios disponibles…</p>}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {!loading && data && services && services.length > 1 && (
          <>
            <div className="mb-2.5 text-[13px] font-semibold text-[var(--ink3)]">Servicio</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {services.map((sv) => {
                const active = sv.id === selectedServiceId;
                return (
                  <button
                    key={sv.id}
                    onClick={() => setSelectedServiceId(sv.id)}
                    className="rounded-[11px] border-[1.5px] px-3 py-2 text-[13px] font-bold"
                    style={{
                      borderColor: active ? "var(--brand)" : "var(--line-in)",
                      background: active ? "var(--brand-soft)" : "var(--surface)",
                      color: active ? "var(--brand-dk)" : "#5a6884",
                    }}
                  >
                    {sv.name} · {sv.durationMinutes}m
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!loading && data && days.length > 0 && (
          <>
            <div className="mb-2.5 text-[13px] font-semibold text-[var(--ink3)]">Día</div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1.5">
              {days.map((day) => {
                const dt = DateTime.fromISO(day).setLocale("es");
                const active = day === selectedDay;
                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDay(day);
                      setSelectedSlot(null);
                    }}
                    className="shrink-0 rounded-xl border-[1.5px] px-0 py-[9px] text-center"
                    style={{
                      width: 60,
                      borderColor: active ? "var(--brand)" : "var(--line-in)",
                      background: active ? "var(--brand)" : "var(--surface)",
                      color: active ? "#fff" : "var(--ink2)",
                    }}
                  >
                    <div className="text-[10.5px] font-bold opacity-75">{dt.toFormat("ccc")}</div>
                    <div className="text-[16px] font-extrabold leading-tight">{dt.toFormat("d")}</div>
                    <div className="text-[9.5px] font-semibold opacity-75">{dt.toFormat("LLL")}</div>
                  </button>
                );
              })}
            </div>

            <div className="mb-2.5 text-[13px] font-semibold text-[var(--ink3)]">Horario</div>
            <div className="mb-5 grid grid-cols-4 gap-2">
              {(slotsByDay.get(selectedDay ?? days[0]) ?? []).map((slot) => {
                const dt = DateTime.fromISO(slot.startISO).setZone(data.professional.timezone);
                const active = selectedSlot?.startISO === slot.startISO;
                return (
                  <button
                    key={slot.startISO}
                    onClick={() => setSelectedSlot(slot)}
                    className="rounded-[10px] border-[1.5px] py-[9px] text-[13.5px] font-bold"
                    style={{
                      borderColor: active ? "var(--brand)" : "var(--line-in)",
                      background: active ? "var(--brand)" : "var(--surface)",
                      color: active ? "#fff" : "var(--ink2)",
                    }}
                  >
                    {dt.toFormat("HH:mm")}
                  </button>
                );
              })}
            </div>

            <div className="mb-4 border-t border-[var(--line2)] pt-4">
              <div className="mb-3 text-[13px] font-semibold text-[var(--ink3)]">Datos del cliente</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="nb-clientName" className="mb-1 block text-[12px] font-semibold text-[var(--muted-nav)]">Nombre y apellido *</label>
                  <input
                    id="nb-clientName"
                    className="w-full rounded-[10px] border-[1.5px] border-[var(--line-in)] px-3 py-2.5 text-[14px]"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div>
                  <label htmlFor="nb-clientEmail" className="mb-1 block text-[12px] font-semibold text-[var(--muted-nav)]">Email *</label>
                  <input
                    id="nb-clientEmail"
                    type="email"
                    className="w-full rounded-[10px] border-[1.5px] border-[var(--line-in)] px-3 py-2.5 text-[14px]"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    placeholder="cliente@email.com"
                  />
                </div>
                <div>
                  <label htmlFor="nb-clientPhone" className="mb-1 block text-[12px] font-semibold text-[var(--muted-nav)]">WhatsApp (opcional)</label>
                  <input
                    id="nb-clientPhone"
                    className="w-full rounded-[10px] border-[1.5px] border-[var(--line-in)] px-3 py-2.5 text-[14px]"
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    placeholder="+598 9x xxx xxx"
                  />
                </div>
                <div>
                  <label htmlFor="nb-notes" className="mb-1 block text-[12px] font-semibold text-[var(--muted-nav)]">Notas (opcional)</label>
                  <input
                    id="nb-notes"
                    className="w-full rounded-[10px] border-[1.5px] border-[var(--line-in)] px-3 py-2.5 text-[14px]"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Detalle interno"
                  />
                </div>
              </div>
              {formError && <p className="mt-3 text-[13px] text-red-600">{formError}</p>}
            </div>

            <div className="flex flex-wrap justify-end gap-2.5">
              <button onClick={onClose} className="rounded-[11px] border border-[var(--line-btn)] bg-[var(--surface)] px-[18px] py-[11px] text-[14px] font-semibold text-[var(--ink2)]">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={!selectedSlot || saving}
                className="rounded-[11px] px-5 py-[11px] text-[14px] font-bold text-white"
                style={{ background: selectedSlot ? "var(--brand)" : "#b8c6dd" }}
              >
                {saving ? "Creando…" : "Crear reserva"}
              </button>
            </div>
          </>
        )}

        {!loading && data && days.length === 0 && (
          <p className="text-sm text-amber-700">No hay horarios disponibles en los próximos días.</p>
        )}
      </div>
    </div>
  );
}
