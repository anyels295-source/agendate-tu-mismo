"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import { PRICE_PATTERN, PRICE_ERROR_MESSAGE, SERVICE_DURATION_ERROR_MESSAGE } from "@/lib/validation";

export type ServiceRow = {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
  active: boolean;
};

function ServiceEditRow({ service, onRemove }: { service: ServiceRow; onRemove: (id: string) => void }) {
  const router = useRouter();
  // "Último valor confirmado por el servidor" — se usa para revertir si un PATCH falla,
  // ya que el padre no vuelve a sincronizar `initial` en cada refresh.
  const [saved, setSaved] = useState({ name: service.name, durationMinutes: service.durationMinutes, price: service.price ?? "" });
  const [name, setName] = useState(saved.name);
  const [dur, setDur] = useState(saved.durationMinutes);
  const [price, setPrice] = useState(saved.price);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>, revert: () => void) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "No se pudo guardar el cambio.");
        revert();
        return;
      }
      setSaved((s) => ({ ...s, ...patch }) as typeof s);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
      revert();
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_38px] items-center gap-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== saved.name && save({ name }, () => setName(saved.name))}
        className="w-full rounded-[10px] border border-[var(--line-in)] px-3 py-2 text-[14px] font-semibold text-[var(--ink2)]"
      />
      <div className="relative">
        <input
          type="number"
          value={dur}
          onChange={(e) => setDur(Number(e.target.value))}
          min={5}
          max={480}
          onBlur={() => {
            if (dur === saved.durationMinutes) return;
            if (!Number.isInteger(dur) || dur < 5 || dur > 480) {
              setError(SERVICE_DURATION_ERROR_MESSAGE);
              setDur(saved.durationMinutes);
              return;
            }
            save({ durationMinutes: dur }, () => setDur(saved.durationMinutes));
          }}
          className="w-full rounded-[10px] border border-[var(--line-in)] px-3 py-2 pr-9 text-[14px]"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--muted-nav)]">min</span>
      </div>
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={() => {
          if (price === saved.price) return;
          if (price.trim() && !PRICE_PATTERN.test(price.trim())) {
            setError(PRICE_ERROR_MESSAGE);
            setPrice(saved.price);
            return;
          }
          save({ price: price.trim() || null }, () => setPrice(saved.price));
        }}
        placeholder="$0"
        className="w-full rounded-[10px] border border-[var(--line-in)] px-3 py-2 text-[14px]"
      />
      <button
        onClick={() => onRemove(service.id)}
        title="Quitar"
        aria-label={`Quitar el servicio ${service.name}`}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-[var(--page)] text-[#b6382f]"
      >
        <IconTrash />
      </button>
      {error && <p className="col-span-4 -mt-1 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}

export default function ServiciosManager({ initial }: { initial: ServiceRow[] }) {
  const router = useRouter();
  const [services, setServices] = useState(initial);
  const [form, setForm] = useState({ name: "", durationMinutes: 30, price: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  async function addService() {
    if (!form.name.trim()) {
      setError("Ingresá un nombre para el servicio.");
      return;
    }
    const duration = Number(form.durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      setError(SERVICE_DURATION_ERROR_MESSAGE);
      return;
    }
    if (form.price.trim() && !PRICE_PATTERN.test(form.price.trim())) {
      setError(PRICE_ERROR_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        durationMinutes: Number(form.durationMinutes),
        price: form.price.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo crear el servicio.");
      return;
    }
    setServices((s) => [...s, json.service]);
    setForm({ name: "", durationMinutes: 30, price: "" });
    router.refresh();
  }

  async function removeService(id: string) {
    const removed = services.find((sv) => sv.id === id);
    setServices((s) => s.filter((sv) => sv.id !== id));
    try {
      const res = await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "No se pudo quitar el servicio.");
        if (removed) setServices((s) => [...s, removed]);
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
      if (removed) setServices((s) => [...s, removed]);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-[22px_24px]">
      <div className="mb-4">
        <div className="text-[15px] font-bold text-[var(--ink3)]">Servicios</div>
        <div className="text-[12.5px] text-[var(--muted-nav)]">Cada servicio puede tener su propia duración y precio.</div>
      </div>

      <div className="flex flex-col gap-2.5">
        {services.length === 0 && <p className="text-[13.5px] text-[var(--muted-nav)]">Todavía no cargaste ningún servicio.</p>}
        {services.map((sv) => (
          <ServiceEditRow key={sv.id} service={sv} onRemove={setPendingRemoveId} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_100px_100px_auto]">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre del servicio"
          className="rounded-[10px] border border-[var(--line-in)] px-3 py-2 text-[14px]"
        />
        <input
          type="number"
          value={form.durationMinutes}
          onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
          placeholder="Minutos"
          className="rounded-[10px] border border-[var(--line-in)] px-3 py-2 text-[14px]"
        />
        <input
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          placeholder="Precio (opc.)"
          className="rounded-[10px] border border-[var(--line-in)] px-3 py-2 text-[14px]"
        />
        <button
          onClick={addService}
          disabled={saving}
          className="rounded-[9px] border border-[var(--brand)] bg-[var(--brand-soft)] px-[13px] py-2 text-[12.5px] font-semibold text-[var(--brand)] disabled:opacity-60"
        >
          {saving ? "Agregando…" : "+ Agregar"}
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

      {pendingRemoveId && (
        <ConfirmDialog
          title="¿Quitar este servicio?"
          description={`Se quitará "${services.find((sv) => sv.id === pendingRemoveId)?.name ?? "el servicio"}" de las opciones de reserva. Los turnos ya agendados con este servicio no se modifican.`}
          confirmLabel="Quitar servicio"
          danger
          onClose={() => setPendingRemoveId(null)}
          onConfirm={() => {
            const id = pendingRemoveId;
            setPendingRemoveId(null);
            removeService(id);
          }}
        />
      )}
    </section>
  );
}
