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
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <h2 className="mb-3 font-medium text-gray-800">Datos básicos</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">Nombre</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Link de reserva (slug)</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Nombre del servicio</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.serviceName}
              onChange={(e) => setForm({ ...form, serviceName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Duración (minutos)</label>
            <input
              type="number"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Colchón entre turnos (minutos)</label>
            <input
              type="number"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.bufferMinutes}
              onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Anticipación mínima (horas)</label>
            <input
              type="number"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={form.minNoticeHours}
              onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <h2 className="mb-3 font-medium text-gray-800">Horario de atención</h2>
        <div className="space-y-2">
          {DAY_KEYS.map((day) => {
            const enabled = form.workingHours[day].length > 0;
            const range = form.workingHours[day][0] ?? { start: "09:00", end: "18:00" };
            return (
              <div key={day} className="flex items-center gap-3">
                <label className="flex w-28 items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={enabled} onChange={(e) => toggleDay(day, e.target.checked)} />
                  {DAY_LABEL[day]}
                </label>
                {enabled && (
                  <>
                    <input
                      type="time"
                      value={range.start}
                      onChange={(e) => updateRange(day, "start", e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <span className="text-gray-400">a</span>
                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) => updateRange(day, "end", e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          MVP: un solo tramo por día. Para horarios partidos (ej. 9 a 13 y 14 a 18) se edita directamente en la base
          de datos por ahora — se agrega UI de múltiples tramos en la siguiente iteración.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado ✓</span>}
      </div>
    </div>
  );
}
