"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { IconClose, IconCheck } from "./icons";
import { useEscapeKey } from "@/lib/useEscapeKey";

type FreeSlot = { startISO: string; endISO: string };
type AvailabilityResponse = {
  professional: { timezone: string };
  slots: FreeSlot[];
};

type ChannelKey = "whatsapp" | "email" | "telegram" | "teams";
const CHANNEL_META: Record<ChannelKey, { label: string; dot: string; disabled?: boolean }> = {
  whatsapp: { label: "WhatsApp", dot: "#25d366" },
  email: { label: "Email", dot: "var(--brand)" },
  telegram: { label: "Telegram", dot: "#2aabee", disabled: true },
  teams: { label: "Teams", dot: "#5b5fc7" },
};

export default function RescheduleModal({
  bookingId,
  clientName,
  professionalSlug,
  onClose,
  onDone,
}: {
  bookingId: string;
  clientName: string;
  professionalSlug: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  useEscapeKey(onClose);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [notify, setNotify] = useState<Record<ChannelKey, boolean>>({ whatsapp: true, email: true, telegram: false, teams: false });
  const [telegramNotice, setTelegramNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability?slug=${encodeURIComponent(professionalSlug)}&days=10&admin=1&excludeBookingId=${encodeURIComponent(bookingId)}${fromDate ? `&from=${fromDate}` : ""}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la disponibilidad.");
        return json as AvailabilityResponse;
      })
      .then((json) => !cancelled && setData(json))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [professionalSlug, bookingId, fromDate]);

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
    if (!selectedDay && days.length > 0) setSelectedDay(days[0]);
  }, [days, selectedDay]);

  function toggleChannel(k: ChannelKey) {
    if (CHANNEL_META[k].disabled) {
      setTelegramNotice(true);
      setTimeout(() => setTelegramNotice(false), 2500);
      return;
    }
    setNotify((p) => ({ ...p, [k]: !p[k] }));
  }

  function channelSummary(): string {
    const active = (Object.keys(notify) as ChannelKey[]).filter((k) => notify[k]).map((k) => CHANNEL_META[k].label);
    if (active.length === 0) return "sin notificación";
    if (active.length === 1) return active[0];
    return active.slice(0, -1).join(", ") + " y " + active[active.length - 1];
  }

  const previewDt = selectedSlot ? DateTime.fromISO(selectedSlot.startISO).setZone(data?.professional.timezone).setLocale("es") : null;
  const preview = previewDt
    ? `Hola ${clientName}. Tu turno se reprogramó para el ${previewDt.toFormat("cccc d 'de' LLLL")} a las ${previewDt.toFormat("HH:mm")}. Si no te queda bien, respondé este mensaje y lo resolvemos.`
    : `Hola ${clientName}. Tu turno se reprogramó para la nueva fecha. Si no te queda bien, respondé este mensaje y lo resolvemos.`;

  async function apply() {
    if (!selectedSlot) return;
    setSaving(true);
    try {
      const channels = (Object.keys(notify) as ChannelKey[])
        .filter((k) => notify[k] && k !== "telegram")
        .map((k) => k.toUpperCase());
      const res = await fetch(`/api/admin/bookings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startISO: selectedSlot.startISO, endISO: selectedSlot.endISO, channels }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo reprogramar el turno.");
        setSaving(false);
        return;
      }
      const dt = DateTime.fromISO(selectedSlot.startISO).setZone(data?.professional.timezone).setLocale("es");
      onDone(`${clientName} reprogramado a ${dt.toFormat("d LLL yyyy")} · ${dt.toFormat("HH:mm")} · avisamos por ${channelSummary()}`);
    } catch {
      setError("Error de conexión. Intentá nuevamente.");
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
        aria-label="Reprogramar turno"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[18px] font-extrabold text-[var(--ink)]">Reprogramar turno</div>
            <div className="mt-0.5 text-[13px] text-[var(--muted-nav)]">{clientName}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--page)] text-[var(--muted-nav)]">
            <IconClose />
          </button>
        </div>

        {loading && <p className="text-sm text-[var(--muted-nav)]">Cargando horarios disponibles…</p>}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="rs-from" className="text-[12.5px] font-semibold text-[var(--muted-nav)]">Buscar desde</label>
          <input
            id="rs-from"
            type="date"
            min={DateTime.now().toISODate() ?? undefined}
            value={fromDate ?? ""}
            onChange={(e) => setFromDate(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null)}
            className="rounded-[10px] border-[1.5px] border-[var(--line-in)] px-2.5 py-1.5 text-[13px] text-[var(--ink2)]"
          />
          {fromDate && (
            <button type="button" onClick={() => setFromDate(null)} className="text-[12.5px] font-semibold text-[var(--brand)]">
              Desde hoy
            </button>
          )}
        </div>

        {!loading && data && days.length === 0 && !error && (
          <p className="mb-3 text-[13px] text-[var(--muted-nav)]">No hay horarios libres en esos días. Probá con otra fecha.</p>
        )}

        {!loading && data && days.length > 0 && (
          <>
            <div className="mb-4 text-[13px] font-semibold text-[var(--ink3)]">Nuevo día</div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1.5">
              {days.map((day) => {
                const dt = DateTime.fromISO(day).setLocale("es");
                const active = day === selectedDay;
                return (
                  <button
                    key={day}
                    aria-pressed={active}
                    aria-label={dt.toFormat("cccc d 'de' LLLL")}
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

            <div className="mb-2.5 text-[13px] font-semibold text-[var(--ink3)]">Nuevo horario</div>
            <div className="mb-5 grid grid-cols-4 gap-2">
              {(slotsByDay.get(selectedDay ?? days[0]) ?? []).map((slot) => {
                const dt = DateTime.fromISO(slot.startISO).setZone(data.professional.timezone);
                const active = selectedSlot?.startISO === slot.startISO;
                return (
                  <button
                    key={slot.startISO}
                    aria-pressed={active}
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
              <div className="mb-0.5 text-[13px] font-semibold text-[var(--ink3)]">Avisar al cliente por</div>
              <div className="mb-2.5 text-[12px] text-[var(--muted-nav)]">Se envía automáticamente al confirmar el cambio.</div>
              <div className="mb-3.5 flex flex-wrap gap-2">
                {(Object.keys(CHANNEL_META) as ChannelKey[]).map((k) => {
                  const meta = CHANNEL_META[k];
                  const on = notify[k];
                  return (
                    <button
                      key={k}
                      aria-pressed={meta.disabled ? undefined : on}
                      aria-disabled={meta.disabled || undefined}
                      title={meta.disabled ? "Próximamente" : undefined}
                      onClick={() => toggleChannel(k)}
                      className="inline-flex items-center gap-[7px] rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold"
                      style={{
                        borderColor: on ? "var(--brand)" : "var(--line-in)",
                        background: on ? "var(--brand-soft)" : "var(--surface)",
                        color: meta.disabled ? "var(--muted-nav)" : on ? "var(--brand-dk)" : "var(--muted-nav)",
                        opacity: meta.disabled ? 0.7 : 1,
                      }}
                    >
                      <span className="h-[9px] w-[9px] rounded-full" style={{ background: meta.dot }} />
                      {meta.label}
                      {meta.disabled ? <span className="text-[10px]">(pronto)</span> : on && <IconCheck className="text-[var(--brand)]" />}
                    </button>
                  );
                })}
              </div>
              {telegramNotice && <p className="mb-3 text-[12px] text-[#a4700f]">Telegram va a estar disponible próximamente.</p>}
              <div className="rounded-xl border border-[var(--line2)] bg-[var(--subtle)] p-[12px_14px]">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted-nav)]">Vista previa del mensaje</div>
                <div className="text-[13px] leading-relaxed text-[#3a4a68]">{preview}</div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5">
              <button onClick={onClose} className="rounded-[11px] border border-[var(--line-btn)] bg-[var(--surface)] px-[18px] py-[11px] text-[14px] font-semibold text-[var(--ink2)]">
                Cancelar
              </button>
              <button
                onClick={apply}
                disabled={!selectedSlot || saving}
                className="rounded-[11px] px-5 py-[11px] text-[14px] font-bold text-white"
                style={{ background: selectedSlot ? "var(--brand)" : "#b8c6dd" }}
              >
                {saving ? "Reprogramando…" : "Confirmar nuevo horario"}
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
