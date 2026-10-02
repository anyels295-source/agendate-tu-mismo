"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { normalizePhone, PHONE_ERROR_MESSAGE } from "@/lib/validation";
import { TIMEZONES, timezoneLabel } from "@/lib/timezones";

type FreeSlot = { startISO: string; endISO: string };
type AvailabilityResponse = {
  professional: { name: string; serviceName: string; durationMinutes: number; timezone: string };
  slots: FreeSlot[];
};
type ServiceOption = { id: string; name: string; durationMinutes: number; price: string | null };

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Widget de reserva pensado para usuarios poco tecnológicos (hallazgo clave
 * de la investigación de mercado): pocos pasos, botones grandes, sin
 * necesidad de crear cuenta ni de entender zonas horarias o husos.
 */
export default function BookingWidget({ slug, professionalName }: { slug: string; professionalName: string }) {
  const [services, setServices] = useState<ServiceOption[] | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [step, setStep] = useState<"elegir" | "datos" | "confirmado">("elegir");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ clientName: "", clientPhone: "", clientEmail: "", notes: "" });
  const [formError, setFormError] = useState<string | null>(null);
  // Zona horaria elegida por el cliente para ver los horarios en su hora
  // local (por defecto, la del negocio). No afecta lo que se guarda: los
  // slots siguen viajando como ISO/UTC, esto es solo de visualización.
  const [clientTz, setClientTz] = useState<string | null>(null);
  // Cambiarlo fuerza a volver a pedir los horarios libres al servidor.
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (step === "datos") setNotice(null);
  }, [step]);

  useEffect(() => {
    fetch(`/api/services?slug=${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((json) => {
        const list: ServiceOption[] = json.services ?? [];
        setServices(list);
        if (list.length > 0) setSelectedServiceId(list[0].id);
      })
      .catch(() => setServices([]));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ slug, days: "10" });
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
        // Solo la primera vez: arrancamos mostrando la zona horaria del
        // negocio. Si el cliente ya eligió la suya, no se la pisamos al
        // cambiar de servicio.
        setClientTz((prev) => prev ?? json.professional.timezone);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, selectedServiceId, reloadKey]);

  const displayTz = clientTz ?? data?.professional.timezone ?? "UTC";

  const slotsByDay = useMemo(() => {
    if (!data) return new Map<string, FreeSlot[]>();
    const map = new Map<string, FreeSlot[]>();
    for (const slot of data.slots) {
      const day = DateTime.fromISO(slot.startISO).setZone(displayTz).toISODate()!;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(slot);
    }
    return map;
  }, [data, displayTz]);

  // Lista de zonas para el selector del cliente: la curada + la del negocio
  // si por algún motivo no está en la lista curada, para no ocultarla.
  const clientTzOptions = useMemo(() => {
    const businessTz = data?.professional.timezone;
    if (!businessTz || TIMEZONES.some((t) => t.id === businessTz)) return TIMEZONES;
    return [...TIMEZONES, { id: businessTz, label: businessTz }];
  }, [data?.professional.timezone]);

  const days = useMemo(() => Array.from(slotsByDay.keys()).sort().slice(0, 6), [slotsByDay]);

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail.trim())) {
      setFormError("Ingresá un email válido.");
      return;
    }
    // El WhatsApp es opcional, pero si lo escribió, que sea algo razonable.
    const normalizedPhone = form.clientPhone.trim() ? normalizePhone(form.clientPhone) : null;
    if (form.clientPhone.trim() && !normalizedPhone) {
      setFormError(PHONE_ERROR_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceId: selectedServiceId ?? undefined,
          clientName: form.clientName,
          clientPhone: normalizedPhone ?? undefined,
          clientEmail: form.clientEmail.trim(),
          notes: form.notes || undefined,
          startISO: selectedSlot.startISO,
          endISO: selectedSlot.endISO,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        // Alguien tomó el horario mientras se completaba el formulario:
        // volvemos a la lista con los horarios actualizados.
        setNotice("Ese horario ya no está disponible. Elegí otro de la lista.");
        setSelectedSlot(null);
        setStep("elegir");
        setReloadKey((k) => k + 1);
        setSubmitting(false);
        return;
      }
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

  const curService = services?.find((s) => s.id === selectedServiceId);
  const serviceName = curService?.name ?? data?.professional.serviceName ?? "Servicio";
  const durationMinutes = curService?.durationMinutes ?? data?.professional.durationMinutes ?? 30;

  const stepOrder = ["elegir", "datos", "confirmado"];
  const curIdx = stepOrder.indexOf(step);
  const stepLabels: [string, string][] = [
    ["elegir", "Horario"],
    ["datos", "Tus datos"],
    ["confirmado", "Listo"],
  ];

  return (
    <div className="w-full max-w-[430px]">
      <div className="mb-4 flex items-center justify-center gap-[7px] text-[12.5px] font-semibold text-[#6b7280]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        Reservá tu turno
      </div>

      <div className="overflow-hidden rounded-[24px] border border-[#eaeef5] bg-white shadow-[0_20px_50px_-20px_rgba(31,56,100,0.35)]">
        <div
          className="p-[26px_26px_20px] text-center text-white"
          style={{ background: "linear-gradient(160deg,#1f3864,#2e74b5)" }}
        >
          <div className="mx-auto mb-3 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white/[.18] text-[22px] font-extrabold">
            {initialsOf(professionalName)}
          </div>
          <div className="text-[20px] font-extrabold tracking-tight">{professionalName}</div>
          <div className="mt-0.5 text-[13.5px] opacity-85">
            {serviceName} · {durationMinutes} min
          </div>
        </div>

        <div className="p-[22px_22px_26px]">
          <div className="mb-5 flex items-center gap-1.5">
            {stepLabels.map(([key, label], i) => (
              <div key={key} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="h-1 w-full rounded-[3px]" style={{ background: i <= curIdx ? "#215a8f" : "#dfe6f0" }} />
                <span className="text-[10.5px] font-bold" style={{ color: i <= curIdx ? "#1f3864" : "#6b7280" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {loading && step === "elegir" && <p className="text-center text-[#6b7280]">Cargando horarios disponibles…</p>}

          {error && (
            <div className="rounded-lg bg-[#fbe7e7] p-4 text-center text-[#b6382f]">
              <p className="font-semibold">No pudimos cargar la disponibilidad.</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && data && days.length === 0 && step === "elegir" && (
            <div className="rounded-lg bg-[#fdf1dc] p-4 text-center text-[#8a5d0b]">
              No hay horarios disponibles en los próximos días. Volvé a intentar más tarde.
            </div>
          )}

          {notice && step === "elegir" && (
            <div role="alert" className="mb-3 rounded-lg bg-[#fdf1dc] p-3 text-center text-[13px] font-semibold text-[#8a5d0b]">
              {notice}
            </div>
          )}

          {!loading && !error && data && days.length > 0 && step === "elegir" && (
            <>
              {services && services.length > 1 && (
                <>
                  <div className="mb-[11px] text-[13.5px] font-bold text-[#22314f]">Elegí el servicio</div>
                  <div className="mb-[18px] flex flex-wrap gap-2">
                    {services.map((sv) => {
                      const active = sv.id === selectedServiceId;
                      return (
                        <button
                          key={sv.id}
                          onClick={() => setSelectedServiceId(sv.id)}
                          className="rounded-[11px] border-[1.5px] px-[13px] py-[9px] text-[13px] font-bold"
                          style={{ borderColor: active ? "#215a8f" : "#e0e6f0", background: active ? "#eef4fb" : "#fff", color: active ? "#1f3864" : "#5a6884" }}
                        >
                          {sv.name} · {sv.durationMinutes}m
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="mb-[18px]">
                <label htmlFor="bw-clientTz" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-[#22314f]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-[#215a8f]"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
                  Tu zona horaria
                </label>
                <select
                  id="bw-clientTz"
                  value={displayTz}
                  onChange={(e) => setClientTz(e.target.value)}
                  className="w-full rounded-[10px] border-[1.5px] border-[#e0e6f0] bg-white px-[11px] py-[9px] text-[13.5px] font-semibold text-[#2a3856]"
                >
                  {clientTzOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div
                  className="mt-1.5 text-[11.5px] font-semibold"
                  style={{ color: displayTz === data.professional.timezone ? "#6b7280" : "#215a8f" }}
                >
                  {displayTz === data.professional.timezone
                    ? "Misma zona horaria que el negocio."
                    : `Horarios convertidos desde ${timezoneLabel(data.professional.timezone)} a tu hora local.`}
                </div>
              </div>

              <div className="mb-[11px] text-[13.5px] font-bold text-[#22314f]">Elegí el día</div>
              <div className="mb-[18px] flex gap-2 overflow-x-auto pb-1.5">
                {days.map((day) => {
                  const dt = DateTime.fromISO(day).setLocale("es");
                  const active = day === selectedDay;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className="shrink-0 rounded-[13px] border-[1.5px] py-2.5 text-center"
                      style={{ width: 62, borderColor: active ? "#215a8f" : "#e0e6f0", background: active ? "#215a8f" : "#fff", color: active ? "#fff" : "#2a3856" }}
                    >
                      <div className="text-[11px] font-bold opacity-75">{dt.toFormat("ccc")}</div>
                      <div className="text-[17px] font-extrabold leading-tight">{dt.toFormat("d")}</div>
                      <div className="text-[10px] font-semibold opacity-75">{dt.toFormat("LLL")}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mb-[11px] text-[13.5px] font-bold text-[#22314f]">Horarios disponibles</div>
              <div className="grid grid-cols-3 gap-[9px]">
                {(slotsByDay.get(selectedDay ?? days[0]) ?? []).map((slot) => {
                  const dt = DateTime.fromISO(slot.startISO).setZone(displayTz);
                  return (
                    <button
                      key={slot.startISO}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStep("datos");
                      }}
                      className="rounded-[11px] border-[1.5px] border-[#e0e6f0] bg-white py-[11px] text-[14px] font-bold text-[#2a3856] hover:border-[#2e74b5] hover:bg-[#eef4fb] hover:text-[#1f3864]"
                    >
                      {dt.toFormat("HH:mm")}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "datos" && selectedSlot && data && (
            <div>
              <button onClick={() => setStep("elegir")} className="mb-3.5 text-[13px] font-semibold text-[#215a8f]">
                ← Elegir otro horario
              </button>
              <div className="mb-[18px] rounded-[13px] bg-[#eef4fb] p-3.5 text-center">
                <div className="text-[14.5px] font-extrabold text-[#1f3864]">
                  {DateTime.fromISO(selectedSlot.startISO).setZone(displayTz).setLocale("es").toFormat("cccc d 'de' LLLL")} ·{" "}
                  {DateTime.fromISO(selectedSlot.startISO).setZone(displayTz).toFormat("HH:mm")}
                </div>
                <div className="mt-0.5 text-[12.5px] text-[#4a5878]">
                  {serviceName} con {professionalName}
                </div>
              </div>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label htmlFor="bw-clientName" className="mb-1.5 block text-[12.5px] font-semibold text-[#6b7890]">Nombre y apellido *</label>
                  <input
                    id="bw-clientName"
                    className="w-full rounded-[11px] border-[1.5px] border-[#e0e6f0] px-[13px] py-[11px] text-[15px]"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label htmlFor="bw-clientEmail" className="mb-1.5 block text-[12.5px] font-semibold text-[#6b7890]">Email *</label>
                  <input
                    id="bw-clientEmail"
                    type="email"
                    className="w-full rounded-[11px] border-[1.5px] border-[#e0e6f0] px-[13px] py-[11px] text-[15px]"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    placeholder="tu@email.com"
                  />
                  <p className="mt-1 text-[11.5px] text-[#6b7280]">Ahí te confirmamos el turno.</p>
                </div>
                <div>
                  <label htmlFor="bw-clientPhone" className="mb-1.5 block text-[12.5px] font-semibold text-[#6b7890]">WhatsApp (opcional)</label>
                  <input
                    id="bw-clientPhone"
                    className="w-full rounded-[11px] border-[1.5px] border-[#e0e6f0] px-[13px] py-[11px] text-[15px]"
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    placeholder="+598 9x xxx xxx"
                  />
                  <p className="mt-1 text-[11.5px] text-[#6b7280]">Si lo dejás, también te avisamos por ahí.</p>
                </div>

                {formError && <p className="text-[13px] text-red-600">{formError}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="mt-1 w-full rounded-[12px] bg-[#215a8f] py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
                >
                  {submitting ? "Confirmando…" : "Confirmar turno"}
                </button>
              </div>
            </div>
          )}

          {step === "confirmado" && selectedSlot && data && (
            <div className="p-[14px_6px_8px] text-center">
              <div className="mx-auto mb-4 flex h-[66px] w-[66px] items-center justify-center rounded-full bg-[#e4f6ec]">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#22a05a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <div className="text-[20px] font-extrabold text-[#1a7d45]">¡Turno agendado!</div>
              <div className="mt-1.5 text-[14.5px] font-semibold text-[#3a8560]">
                {DateTime.fromISO(selectedSlot.startISO).setZone(displayTz).setLocale("es").toFormat("cccc d 'de' LLLL")} a las{" "}
                {DateTime.fromISO(selectedSlot.startISO).setZone(displayTz).toFormat("HH:mm")}
              </div>
              <div className="mt-3.5 text-[13px] leading-relaxed text-[#6b7890]">
                Te enviamos el detalle por email. El turno queda pendiente de confirmación y te avisaremos cuando se confirme.
                <br />
                Podés cancelar desde ese mismo mensaje.
              </div>
              <div className="mt-3 text-[13px] font-semibold text-[#2a3856]">
                Si no vas a reservar más turnos, ya podés cerrar esta ventana.
              </div>
              <button
                onClick={() => {
                  setStep("elegir");
                  setSelectedSlot(null);
                  setReloadKey((k) => k + 1);
                }}
                className="mt-5 rounded-[11px] border border-[#d6deeb] bg-white px-[18px] py-2.5 text-[13.5px] font-semibold text-[#2a3856]"
              >
                Reservar otro turno
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
