"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck } from "./icons";

type ChannelKey = "notifyWhatsapp" | "notifyEmail" | "notifyTeams";
const CHANNELS: { key: ChannelKey; label: string; dot: string }[] = [
  { key: "notifyWhatsapp", label: "WhatsApp", dot: "#25d366" },
  { key: "notifyEmail", label: "Email", dot: "var(--brand)" },
  { key: "notifyTeams", label: "Teams", dot: "#5b5fc7" },
];

export default function NotificationsForm({
  initial,
}: {
  initial: { notifyWhatsapp: boolean; notifyEmail: boolean; notifyTeams: boolean; teamsWebhookUrl: string | null };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [reminderOn, setReminderOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-[22px_24px]">
      <div className="mb-1 text-[15px] font-bold text-[var(--ink3)]">Notificaciones y recordatorios</div>
      <div className="mb-4 text-[12.5px] text-[var(--muted-nav)]">Canales por defecto para confirmaciones, reprogramaciones y cancelaciones.</div>

      <div className="mb-[18px] flex flex-wrap gap-2">
        {CHANNELS.map((c) => {
          const on = form[c.key];
          return (
            <button
              key={c.key}
              onClick={() => setForm({ ...form, [c.key]: !on })}
              className="inline-flex items-center gap-[7px] rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold"
              style={{ borderColor: on ? "var(--brand)" : "var(--line-in)", background: on ? "var(--brand-soft)" : "var(--surface)", color: on ? "var(--brand-dk)" : "var(--muted-nav)" }}
            >
              <span className="h-[9px] w-[9px] rounded-full" style={{ background: c.dot }} />
              {c.label}
              {on && <IconCheck className="text-[var(--brand)]" />}
            </button>
          );
        })}
        <span
          className="inline-flex items-center gap-[7px] rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold opacity-70"
          style={{ borderColor: "var(--line-in)", background: "var(--subtle)", color: "var(--muted-nav)" }}
        >
          <span className="h-[9px] w-[9px] rounded-full" style={{ background: "#2aabee" }} />
          Telegram <span className="text-[10px]">(pronto)</span>
        </span>
      </div>

      {form.notifyTeams && (
        <div className="mb-[18px]">
          <label htmlFor="nf-teamsWebhook" className="mb-1.5 block text-[12.5px] font-semibold text-[var(--muted-nav)]">Webhook de Microsoft Teams</label>
          <input
            id="nf-teamsWebhook"
            value={form.teamsWebhookUrl ?? ""}
            onChange={(e) => setForm({ ...form, teamsWebhookUrl: e.target.value })}
            placeholder="https://…webhook.office.com/…"
            className="w-full rounded-[10px] border border-[var(--line-in)] px-3 py-2.5 text-[14px]"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3.5 rounded-xl border border-[var(--line2)] bg-[var(--subtle)] p-[14px_16px]">
        <div>
          <div className="text-[13.5px] font-bold text-[var(--ink2)]">Recordatorio automático</div>
          <div className="text-[12.5px] text-[var(--muted-nav)]">Enviar un aviso 24 h antes del turno.</div>
        </div>
        <button
          onClick={() => setReminderOn((v) => !v)}
          className="relative h-[22px] w-[38px] shrink-0 rounded-full"
          style={{ background: reminderOn ? "var(--brand)" : "var(--line-btn)" }}
        >
          <span
            className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
            style={{ left: reminderOn ? 18 : 2 }}
          />
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3.5">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-[11px] bg-[var(--brand)] px-[22px] py-[11px] text-[14px] font-bold text-white disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        <span className="text-[13px] text-[var(--muted-nav)]">
          {saved ? "Guardado ✓" : "Los cambios se aplican al instante en tu página pública."}
        </span>
      </div>
    </section>
  );
}
