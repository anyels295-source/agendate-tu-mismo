"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateWorkingHours } from "@/lib/validation";
import { DateTime } from "luxon";
import type { WorkingHours } from "@/lib/types";
import { TIMEZONES } from "@/lib/timezones";
import { THEMES } from "@/lib/themes";

const DAY_LABEL: Record<keyof WorkingHours, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};
const DAY_KEYS: (keyof WorkingHours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type Props = {
  initial: {
    name: string;
    slug: string;
    serviceName: string;
    durationMinutes: number;
    bufferMinutes: number;
    minNoticeHours: number;
    workingHours: WorkingHours;
    timezone: string;
    photoUrl: string | null;
    theme: string;
    videoCallEnabled: boolean;
  };
  /** Si ya hay servicios cargados, el nombre/duración "legados" del perfil no se muestran. */
  hasServices?: boolean;
};

const inputClass = "w-full rounded-[10px] border border-[var(--line-in)] px-3 py-2.5 text-[14px]";
const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-[var(--muted-nav)]";
const cardClass = "mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-[22px_24px]";

// Tamaño máximo (en px, en el lado más largo) al que se reescala la foto en
// el cliente antes de subirla. No hay almacenamiento de archivos en este MVP:
// se guarda como data URL en la propia fila, así que conviene mantenerla chica.
const PHOTO_MAX_SIZE = 320;
const PHOTO_QUALITY = 0.82;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "P";
}

export default function ConfiguracionForm({ initial, hasServices = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Última versión guardada: sirve para saber si hay cambios sin guardar.
  const [savedForm, setSavedForm] = useState(initial);
  const [videoSaved, setVideoSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  // Si se intenta cerrar o recargar la página con cambios sin guardar, el navegador avisa.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** La videollamada se guarda al instante, sin esperar al botón de abajo (es un interruptor, no un dato a completar). */
  async function toggleVideoCall(enabled: boolean) {
    const previous = form.videoCallEnabled;
    setForm((f) => ({ ...f, videoCallEnabled: enabled }));
    setSaveError(null);
    setVideoSaved(false);
    try {
      const res = await fetch("/api/admin/professional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoCallEnabled: enabled }),
      });
      if (!res.ok) throw new Error("no se pudo guardar");
      setSavedForm((f) => ({ ...f, videoCallEnabled: enabled }));
      setVideoSaved(true);
      router.refresh();
    } catch {
      setForm((f) => ({ ...f, videoCallEnabled: previous }));
      setSaveError("No se pudo guardar el cambio de la videollamada. Intentá nuevamente.");
    }
  }
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Si el valor guardado no está en la lista curada (ej. se cargó por otra
  // vía), lo agregamos igual como opción para no cambiarlo de golpe al abrir
  // el selector.
  const tzOptions = useMemo(() => {
    if (TIMEZONES.some((t) => t.id === form.timezone)) return TIMEZONES;
    return [...TIMEZONES, { id: form.timezone, label: form.timezone }];
  }, [form.timezone]);

  const tzNow = useMemo(() => {
    try {
      return DateTime.now().setZone(form.timezone).setLocale("es").toFormat("HH:mm");
    } catch {
      return null;
    }
  }, [form.timezone]);

  function toggleDay(day: keyof WorkingHours, enabled: boolean) {
    setForm((f) => ({
      ...f,
      workingHours: { ...f.workingHours, [day]: enabled ? [{ start: "09:00", end: "18:00" }] : [] },
    }));
  }

  function updateRange(day: keyof WorkingHours, index: number, field: "start" | "end", value: string) {
    setForm((f) => {
      const ranges = f.workingHours[day].length ? [...f.workingHours[day]] : [{ start: "09:00", end: "18:00" }];
      ranges[index] = { ...ranges[index], [field]: value };
      return { ...f, workingHours: { ...f.workingHours, [day]: ranges } };
    });
  }

  function addRange(day: keyof WorkingHours) {
    setForm((f) => {
      const ranges = [...f.workingHours[day]];
      const last = ranges[ranges.length - 1];
      // El nuevo tramo arranca donde terminó el anterior y dura hasta 4 h (sin pasar de las 23:59).
      const [lh, lm] = (last?.end ?? "09:00").split(":").map(Number);
      const startMin = Math.min(lh * 60 + lm, 23 * 60);
      const endMin = Math.min(startMin + 4 * 60, 23 * 60 + 59);
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      ranges.push({ start: fmt(startMin), end: fmt(endMin) });
      return { ...f, workingHours: { ...f.workingHours, [day]: ranges } };
    });
  }

  function removeRange(day: keyof WorkingHours, index: number) {
    setForm((f) => ({
      ...f,
      workingHours: { ...f.workingHours, [day]: f.workingHours[day].filter((_, i) => i !== index) },
    }));
  }

  function pickPhoto() {
    photoInputRef.current?.click();
  }

  function clearPhoto() {
    setForm((f) => ({ ...f, photoUrl: null }));
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > PHOTO_MAX_SIZE) {
            height = Math.round((height * PHOTO_MAX_SIZE) / width);
            width = PHOTO_MAX_SIZE;
          }
        } else if (height > PHOTO_MAX_SIZE) {
          width = Math.round((width * PHOTO_MAX_SIZE) / height);
          height = PHOTO_MAX_SIZE;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
        setForm((f) => ({ ...f, photoUrl: dataUrl }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Vista previa instantánea: el tema se aplica al vuelo sobre el wrapper
  // #agendate-shell (ver AdminShell) además de guardarse en el form para
  // persistirlo al guardar.
  function setTheme(key: string) {
    setForm((f) => ({ ...f, theme: key }));
    document.getElementById("agendate-shell")?.setAttribute("data-theme", key);
  }

  async function handleSave() {
    setSaved(false);
    setSaveError(null);

    // Aviso inmediato si el horario no es válido (la API lo vuelve a comprobar).
    const hoursError = validateWorkingHours(form.workingHours);
    if (hoursError) {
      setSaveError(hoursError);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/professional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSaveError(json.error ?? "No se pudieron guardar los cambios. Intentá nuevamente.");
        return;
      }
      setSavedForm(form);
      setSaved(true);
      router.refresh();
    } catch {
      setSaveError("No se pudo conectar con el servidor. Revisá tu conexión e intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className={cardClass}>
        <div className="mb-4 text-[15px] font-bold text-[var(--ink3)]">Foto de perfil</div>
        <div className="flex items-center gap-4">
          {form.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.photoUrl} alt="Foto de perfil" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[22px] font-bold text-[var(--brand)]">
              {initialsOf(form.name)}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pickPhoto}
                className="rounded-[10px] border border-[var(--line-in)] bg-[var(--surface)] px-3.5 py-2 text-[13px] font-semibold text-[var(--brand)]"
              >
                Subir foto
              </button>
              {form.photoUrl && (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="rounded-[10px] border border-[var(--line-in)] bg-[var(--surface)] px-3.5 py-2 text-[13px] font-semibold text-[var(--muted-nav)]"
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="text-[11.5px] text-[var(--muted-nav)]">JPG o PNG · mínimo 200×200 px</div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 text-[15px] font-bold text-[var(--ink3)]">Datos básicos</div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-name" className={labelClass}>Nombre</label>
            <input id="cf-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="cf-slug" className={labelClass}>Link de reserva (slug)</label>
            <input id="cf-slug" className={inputClass} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          {!hasServices && (
            <>
              <div>
                <label htmlFor="cf-serviceName" className={labelClass}>Nombre del servicio</label>
                <input id="cf-serviceName" className={inputClass} value={form.serviceName} onChange={(e) => setForm({ ...form, serviceName: e.target.value })} />
              </div>
              <div>
                <label htmlFor="cf-duration" className={labelClass}>Duración (minutos)</label>
                <input id="cf-duration" type="number" className={inputClass} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
              </div>
            </>
          )}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[11px] border border-[var(--line)] bg-[var(--subtle)] px-3.5 py-3 text-[13.5px] text-[var(--ink2)] sm:col-span-2">
            <input
              type="checkbox"
              checked={form.videoCallEnabled}
              onChange={(e) => toggleVideoCall(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span>
              <span className="font-semibold">Agregar una videollamada a cada reserva</span>
              <span className="block text-[12.5px] text-[var(--muted-nav)]">
                Se crea un link de Google Meet (o de Teams, si el calendario es de Outlook) junto con el evento, y se incluye en los emails al cliente.{" "}
                <span className="font-semibold text-[#1a7d45]">{videoSaved ? "Guardado ✓" : "Se guarda al instante."}</span>
              </span>
            </span>
          </label>
          <div>
            <label htmlFor="cf-buffer" className={labelClass}>Colchón entre turnos (min)</label>
            <input id="cf-buffer" type="number" className={inputClass} value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="cf-minNotice" className={labelClass}>Anticipación mínima (horas)</label>
            <input id="cf-minNotice" type="number" className={inputClass} value={form.minNoticeHours} onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })} />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-1 text-[15px] font-bold text-[var(--ink3)]">Zona horaria</div>
        <div className="mb-4 text-[12.5px] text-[var(--muted-nav)]">Los horarios se muestran a cada cliente en su hora local.</div>
        <div className="max-w-[320px]">
          <label htmlFor="cf-timezone" className={labelClass}>Zona horaria del negocio</label>
          <select
            id="cf-timezone"
            className={inputClass}
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          >
            {tzOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {tzNow && <div className="mt-1.5 text-[12px] text-[var(--muted-nav)]">Hora actual ahí: {tzNow}</div>}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-1 text-[15px] font-bold text-[var(--ink3)]">Apariencia</div>
        <div className="mb-4 text-[12.5px] text-[var(--muted-nav)]">Elegí los colores con los que ven tu página tanto vos como tus clientes.</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => {
            const isOn = form.theme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTheme(t.key)}
                className="rounded-[12px] border-2 p-2.5 text-left"
                style={{ borderColor: isOn ? "var(--brand)" : "var(--line-in)" }}
              >
                <div className="mb-2 flex h-8 overflow-hidden rounded-[8px] border border-[var(--line-in)]">
                  <span className="flex-1" style={{ background: t.swatches[0] }} />
                  <span className="flex-1" style={{ background: t.swatches[1] }} />
                  <span className="flex-1" style={{ background: t.swatches[2] }} />
                </div>
                <div className="text-[12.5px] font-semibold text-[var(--ink2)]">{t.label}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[15px] font-bold text-[var(--ink3)]">Horario de atención</div>
          <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--brand)]">
            Varios tramos por día
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {DAY_KEYS.map((day) => {
            const enabled = form.workingHours[day].length > 0;
            const ranges = form.workingHours[day].length ? form.workingHours[day] : [{ start: "09:00", end: "18:00" }];
            return (
              <div key={day} className="flex flex-wrap items-center gap-3.5 rounded-[11px] px-3 py-2.5" style={{ background: enabled ? "var(--subtle)" : "transparent" }}>
                <label className="flex w-[110px] shrink-0 items-center gap-2 text-[13.5px] font-semibold" style={{ color: enabled ? "var(--ink2)" : "var(--muted-nav)" }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => toggleDay(day, e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                  {DAY_LABEL[day]}
                </label>
                {enabled ? (
                  <div className="flex flex-col gap-2">
                    {ranges.map((range, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input type="time" aria-label={`${DAY_LABEL[day]}, tramo ${i + 1}: desde`} value={range.start} onChange={(e) => updateRange(day, i, "start", e.target.value)} className="rounded-lg border border-[var(--line-in)] px-2.5 py-1.5 text-[13px] text-[var(--ink2)]" />
                        <span className="text-[13px] text-[var(--muted-nav)]">a</span>
                        <input type="time" aria-label={`${DAY_LABEL[day]}, tramo ${i + 1}: hasta`} value={range.end} onChange={(e) => updateRange(day, i, "end", e.target.value)} className="rounded-lg border border-[var(--line-in)] px-2.5 py-1.5 text-[13px] text-[var(--ink2)]" />
                        {i > 0 && (
                          <button
                            type="button"
                            onClick={() => removeRange(day, i)}
                            aria-label={`Quitar el tramo ${i + 1} de ${DAY_LABEL[day]}`}
                            className="rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[var(--muted-nav)] hover:bg-[var(--page)]"
                          >
                            ✕
                          </button>
                        )}
                        {i === ranges.length - 1 && (
                          <button
                            type="button"
                            onClick={() => addRange(day)}
                            className="rounded-lg border border-dashed border-[var(--line-btn)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--brand)]"
                          >
                            + tramo
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[13px] text-[var(--muted-nav)]">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--page)]/95 px-4 py-3 backdrop-blur md:-mx-9 md:px-9">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[11px] bg-[var(--brand)] px-[22px] py-[11px] text-[14px] font-bold text-white disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {dirty && !saving && <span className="text-[13px] font-semibold text-[#a4700f]">Tenés cambios sin guardar</span>}
        {saved && !dirty && <span className="text-[13px] text-[#1a7d45]">Guardado ✓</span>}
        {saveError && <span role="alert" className="text-[13px] text-red-600">{saveError}</span>}
      </div>
    </>
  );
}
