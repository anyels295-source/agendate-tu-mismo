"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck } from "./icons";

type ChannelKey = "notifyWhatsapp" | "notifyEmail" | "notifyTeams";
const CHANNELS: { key: ChannelKey; label: string; dot: string }[] = [
  { key: "notifyWhatsapp", label: "WhatsApp", dot: "#25d366" },
  { key: "notifyEmail", label: "Email", dot: "#215a8f" },
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
    <section className="mb-4 rounded-2xl border border-[#e7ecf4] bg-white p-[22px_24px]">
      <div className="mb-1 text-[15px] font-bold text-[#22314f]">Notificaciones y recordatorios</div>
      <div className="mb-4 text-[12.5px] text-[#6b7280]">Canales por defecto para confirmaciones, reprogramaciones y cancelaciones.</div>

      <div className="mb-[18px] flex flex-wrap gap-2">
        {CHANNELS.map((c) => {
          const on = form[c.key];
          return (
            <button
              key={c.key}
              onClick={() => setForm({ ...form, [c.key]: !on })}
              className="inline-flex items-center gap-[7px] rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold"
              style={{ borderColor: on ? "#215a8f" : "#e0e6f0", background: on ? "#eef4fb" : "#fff", color: on ? "#1f3864" : "#6b7280" }}
            >
              <span className="h-[9px] w-[9px] rounded-full" style={{ background: c.dot }} />
              {c.label}
              {on && <IconCheck className="text-[#215a8f]" />}
            </button>
          );
        })}
        <span
          className="inline-flex items-center gap-[7px] rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold opacity-70"
          style={{ borderColor: "#e0e6f0", background: "#f7f9fc", color: "#6b7280" }}
        >
          <span className="h-[9px] w-[9px] rounded-full" style={{ background: "#2aabee" }} />
          Telegram <span className="text-[10px]">(pronto)</span>
        </span>
      </div>

      {form.notifyTeams && (
        <div className="mb-[18px]">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-[#6b7890]">Webhook de Microsoft Teams</label>
          <input
            value={form.teamsWebhookUrl ?? ""}
            onChange={(e) => setForm({ ...form, teamsWebhookUrl: e.target.value })}
            placeholder="https://…webhook.office.com/…"
            className="w-full rounded-[10px] border border-[#e0e6f0] px-3 py-2.5 text-[14px]"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3.5 rounded-xl border border-[#eef1f7] bg-[#f7f9fc] p-[14px_16px]">
        <div>
          <div className="text-[13.5px] font-bold text-[#2a3856]">Recordatorio automático</div>
          <div className="text-[12.5px] text-[#6b7280]">Enviar un aviso 24 h antes del turno.</div>
        </div>
        <button
          onClick={() => setReminderOn((v) => !v)}
          className="relative h-[22px] w-[38px] shrink-0 rounded-full"
          style={{ background: reminderOn ? "#215a8f" : "#cdd7e6" }}
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
          className="rounded-[11px] bg-[#215a8f] px-[22px] py-[11px] text-[14px] font-bold text-white disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        <span className="text-[13px] text-[#6b7280]">
          {saved ? "Guardado ✓" : "Los cambios se aplican al instante en tu página pública."}
        </span>
      </div>
    </section>
  );
}
