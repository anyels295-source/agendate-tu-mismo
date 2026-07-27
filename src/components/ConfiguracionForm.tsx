"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkingHours } from "@/lib/types";

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
  };
};

const inputClass = "w-full rounded-[10px] border border-[#e0e6f0] px-3 py-2.5 text-[14px]";
const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-[#6b7890]";
const cardClass = "mb-4 rounded-2xl border border-[#e7ecf4] bg-white p-[22px_24px]";

export default function ConfiguracionForm({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleDay(day: keyof WorkingHours, enabled: boolean) {
    setForm((f) => ({
      ...f,
      workingHours: { ...f.workingHours, [day]: enabled ? [{ start: "09:00", end: "18:00" }] : [] },
    }));
  }

  function updateRange(day: keyof WorkingHours, field: "start" | "end", value: string) {
    setForm((f) => {
      const ranges = f.workingHours[day].length ? [...f.workingHours[day]] : [{ start: "09:00", end: "18:00" }];
      ranges[0] = { ...ranges[0], [field]: value };
      return { ...f, workingHours: { ...f.workingHours, [day]: ranges } };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/professional", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <>
      <section className={cardClass}>
        <div className="mb-4 text-[15px] font-bold text-[#22314f]">Datos básicos</div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Nombre</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Link de reserva (slug)</label>
            <input className={inputClass} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Nombre del servicio</label>
            <input className={inputClass} value={form.serviceName} onChange={(e) => setForm({ ...form, serviceName: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Duración (minutos)</label>
            <input type="number" className={inputClass} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>Colchón entre turnos (min)</label>
            <input type="number" className={inputClass} value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelClass}>Anticipación mínima (horas)</label>
            <input type="number" className={inputClass} value={form.minNoticeHours} onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })} />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[15px] font-bold text-[#22314f]">Horario de atención</div>
          <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11.5px] font-bold text-[#215a8f]">
            Varios tramos por día
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {DAY_KEYS.map((day) => {
            const enabled = form.workingHours[day].length > 0;
            const range = form.workingHours[day][0] ?? { start: "09:00", end: "18:00" };
            return (
              <div key={day} className="flex flex-wrap items-center gap-3.5 rounded-[11px] px-3 py-2.5" style={{ background: enabled ? "#f7f9fc" : "transparent" }}>
                <label className="flex w-[110px] shrink-0 items-center gap-2 text-[13.5px] font-semibold" style={{ color: enabled ? "#2a3856" : "#6b7280" }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => toggleDay(day, e.target.checked)} className="h-4 w-4 accent-[#215a8f]" />
                  {DAY_LABEL[day]}
                </label>
                {enabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="time" value={range.start} onChange={(e) => updateRange(day, "start", e.target.value)} className="rounded-lg border border-[#e0e6f0] px-2.5 py-1.5 text-[13px] text-[#2a3856]" />
                    <span className="text-[13px] text-[#6b7280]">a</span>
                    <input type="time" value={range.end} onChange={(e) => updateRange(day, "end", e.target.value)} className="rounded-lg border border-[#e0e6f0] px-2.5 py-1.5 text-[13px] text-[#2a3856]" />
                    <button
                      type="button"
                      title="Próximamente: agregar otro tramo horario en el mismo día"
                      className="rounded-lg border border-dashed border-[#cdd7e6] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#215a8f]"
                    >
                      + tramo
                    </button>
                  </div>
                ) : (
                  <span className="text-[13px] text-[#6b7280]">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[11px] bg-[#215a8f] px-[22px] py-[11px] text-[14px] font-bold text-white disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && <span className="text-[13px] text-[#1a7d45]">Guardado ✓</span>}
      </div>
    </>
  );
}
