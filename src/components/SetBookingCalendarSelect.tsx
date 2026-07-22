"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SetBookingCalendarSelect({
  connectionId,
  checked,
}: {
  connectionId: string;
  checked: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    setSaving(true);
    await fetch("/api/admin/professional", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingCalendarId: connectionId }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={checked || saving}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        checked ? "bg-brand-600 text-white" : "border border-gray-300 text-gray-600 hover:border-brand-500"
      }`}
    >
      {checked ? "✓ Usado para reservas" : saving ? "Guardando…" : "Usar para reservas"}
    </button>
  );
}
