"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RescheduleModal from "./RescheduleModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconCalendarSmall, IconClock, IconWhatsapp, IconClose } from "./icons";
import { useEscapeKey } from "@/lib/useEscapeKey";

export type AgendaEvent = {
  id: string;
  clientName: string;
  phone: string;
  serviceName: string;
  status: string;
  statusLabel: string;
  timeLabel: string;
  endTimeLabel: string;
  dateLabel: string;
  top: number;
  height: number;
};

type Day = { label: string; dateNum: number; isToday: boolean; events: AgendaEvent[] };

const STATUS_STYLE: Record<string, { bg: string; border: string; bar: string; fg: string }> = {
  CONFIRMED: { bg: "#e4f6ec", border: "#a8e0bd", bar: "#1a7d45", fg: "#166b3b" },
  PENDING: { bg: "#fdf1dc", border: "#f0d199", bar: "#a4700f", fg: "#8a5d0b" },
  COMPLETED: { bg: "#e7effb", border: "#b8cef0", bar: "#215a8f", fg: "#1c4d7a" },
  NO_SHOW: { bg: "#fbe7e7", border: "#f3c6c2", bar: "#b6382f", fg: "#a5342b" },
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  CONFIRMED: { bg: "#e4f6ec", fg: "#1a7d45" },
  PENDING: { bg: "#fdf1dc", fg: "#a4700f" },
  COMPLETED: { bg: "#e7effb", fg: "#215a8f" },
  NO_SHOW: { bg: "#fbe7e7", fg: "#b6382f" },
};

const AVATAR_PALETTE = [
  ["#dce6f1", "#1f3864"],
  ["#e4f6ec", "#1a7d45"],
  ["#fdf1dc", "#a4700f"],
  ["#f0e7fb", "#6b3fa0"],
  ["#e7effb", "#215a8f"],
];

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function AgendaWeekGrid({
  days,
  timeLabels,
  rowHeight,
  professionalSlug,
}: {
  days: Day[];
  timeLabels: string[];
  rowHeight: number;
  professionalSlug: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AgendaEvent | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // El reschedule modal y el diálogo de confirmación manejan su propio Escape;
  // este solo cierra el detalle cuando ninguno de esos dos está abierto encima.
  useEscapeKey(() => {
    if (showReschedule || confirmCancel) return;
    if (detail) setDetail(null);
  });

  const gridHeight = timeLabels.length * rowHeight;

  async function setStatus(status: "COMPLETED" | "NO_SHOW" | "CANCELLED") {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/bookings/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setBusy(false);
      if (res.ok) {
        setDetail(null);
        setConfirmCancel(false);
        setToast("Turno actualizado.");
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setConfirmCancel(false);
        setToast(json.error ?? "No se pudo actualizar el turno.");
      }
    } catch {
      setBusy(false);
      setConfirmCancel(false);
      setToast("Error de conexión. Intentá nuevamente.");
    }
  }

  const badge = detail ? STATUS_BADGE[detail.status] ?? STATUS_BADGE.CONFIRMED : null;
  const [avBg, avFg] = AVATAR_PALETTE[0];

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-[#e7ecf4] bg-white">
      <div className="grid min-w-[680px] grid-cols-[62px_repeat(7,minmax(96px,1fr))] border-b border-[#eef1f7]">
        <div className="border-r border-[#eef1f7]" />
        {days.map((d) => (
          <div key={d.label} className="p-[11px_4px] text-center">
            <div
              className="inline-flex flex-col items-center gap-px rounded-[10px] px-[11px] py-[5px]"
              style={{ background: d.isToday ? "#215a8f" : "transparent" }}
            >
              <span
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: d.isToday ? "rgba(255,255,255,.7)" : "#6b7280" }}
              >
                {d.label}
              </span>
              <span className="text-[16px] font-extrabold" style={{ color: d.isToday ? "#fff" : "#2a3856" }}>
                {d.dateNum}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid min-w-[680px] grid-cols-[62px_repeat(7,minmax(96px,1fr))]" style={{ height: gridHeight }}>
        <div className="relative border-r border-[#eef1f7]">
          {timeLabels.map((t, i) => (
            <div key={t} className="absolute right-2 -translate-y-2 text-[11px] font-semibold text-[#6b7280]" style={{ top: i * rowHeight }}>
              {t}
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.label}
            className="relative border-r border-[#f4f6fa]"
            style={{
              background: `repeating-linear-gradient(#fff, #fff ${rowHeight - 1}px, #f4f6fa ${rowHeight - 1}px, #f4f6fa ${rowHeight}px)`,
            }}
          >
            {d.events.map((ev) => {
              const style = STATUS_STYLE[ev.status] ?? STATUS_STYLE.CONFIRMED;
              return (
                <button
                  key={ev.id}
                  onClick={() => setDetail(ev)}
                  className="absolute left-1 right-1 flex flex-col justify-center gap-px overflow-hidden rounded-lg px-2 py-1 text-left leading-tight"
                  style={{
                    top: ev.top,
                    height: ev.height,
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    borderLeft: `3px solid ${style.bar}`,
                    color: style.fg,
                  }}
                >
                  <div className="truncate text-[12px] font-bold">{ev.timeLabel} · {ev.clientName}</div>
                  {ev.height > 34 && <div className="truncate text-[11px] opacity-75">{ev.serviceName}</div>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {detail && badge && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#16233d]/45 p-5" onClick={() => setDetail(null)}>
          <div
            className="max-h-[92vh] w-full max-w-[410px] overflow-y-auto rounded-[20px] bg-white shadow-[0_30px_70px_-20px_rgba(22,35,61,0.5)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle del turno de ${detail.clientName}`}
          >
            <div className="flex items-center gap-[13px] border-b border-[#eef1f7] bg-[#f7f9fc] p-[22px_22px_18px]">
              <div
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
                style={{ background: avBg, color: avFg }}
              >
                {initialsOf(detail.clientName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-extrabold text-[#16233d]">{detail.clientName}</div>
                <span
                  className="mt-1 inline-block rounded-full px-[9px] py-[3px] text-[11px] font-bold"
                  style={{ background: badge.bg, color: badge.fg }}
                >
                  {detail.statusLabel}
                </span>
              </div>
              <button
                onClick={() => setDetail(null)}
                aria-label="Cerrar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#eef1f7] text-[#6b7280]"
              >
                <IconClose />
              </button>
            </div>

            <div className="flex flex-col gap-0.5 p-[18px_22px_6px]">
              <div className="flex items-center gap-3 border-b border-[#f4f6fa] py-2.5">
                <IconCalendarSmall className="shrink-0 text-[#6b7280]" />
                <div>
                  <div className="text-[11px] font-semibold text-[#6b7280]">Fecha y hora</div>
                  <div className="text-[14px] font-semibold text-[#2a3856]">
                    {detail.dateLabel} · {detail.timeLabel}–{detail.endTimeLabel}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 border-b border-[#f4f6fa] py-2.5">
                <IconClock className="shrink-0 text-[#6b7280]" />
                <div>
                  <div className="text-[11px] font-semibold text-[#6b7280]">Servicio</div>
                  <div className="text-[14px] font-semibold text-[#2a3856]">{detail.serviceName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 py-2.5">
                <IconWhatsapp className="shrink-0 text-[#6b7280]" />
                <div>
                  <div className="text-[11px] font-semibold text-[#6b7280]">WhatsApp</div>
                  <div className="text-[14px] font-semibold text-[#2a3856]">{detail.phone}</div>
                </div>
              </div>
            </div>

            {(detail.status === "PENDING" || detail.status === "CONFIRMED") && (
              <>
                <div className="flex gap-2 px-[22px] pb-2">
                  <button
                    disabled={busy}
                    onClick={() => setStatus("COMPLETED")}
                    className="flex-1 rounded-[10px] border border-[#e0e6f0] py-2 text-[12.5px] font-semibold text-[#2a3856] disabled:opacity-50"
                  >
                    Completar
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setStatus("NO_SHOW")}
                    className="flex-1 rounded-[10px] border border-[#e0e6f0] py-2 text-[12.5px] font-semibold text-[#2a3856] disabled:opacity-50"
                  >
                    Marcar ausente
                  </button>
                </div>
                <div className="flex gap-2.5 p-[4px_22px_22px]">
                  <button
                    disabled={busy}
                    onClick={() => setConfirmCancel(true)}
                    className="flex-1 rounded-[11px] border border-[#f0d0cc] bg-white py-[11px] text-[14px] font-semibold text-[#b6382f] disabled:opacity-50"
                  >
                    Cancelar turno
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setShowReschedule(true)}
                    className="flex-1 rounded-[11px] border-none bg-[#215a8f] py-[11px] text-[14px] font-bold text-white disabled:opacity-50"
                  >
                    Reprogramar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmCancel && detail && (
        <ConfirmDialog
          title="¿Cancelar este turno?"
          description={`Se cancelará el turno de ${detail.clientName}, se eliminará el evento del calendario real y se avisará al cliente por los canales habilitados. Esta acción no se puede deshacer.`}
          confirmLabel="Cancelar turno"
          danger
          busy={busy}
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => setStatus("CANCELLED")}
        />
      )}

      {showReschedule && detail && (
        <RescheduleModal
          bookingId={detail.id}
          clientName={detail.clientName}
          professionalSlug={professionalSlug}
          onClose={() => setShowReschedule(false)}
          onDone={(message) => {
            setShowReschedule(false);
            setDetail(null);
            setToast(message);
            router.refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-[28px] left-1/2 z-40 flex max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-[13px] bg-[#16233d] px-[18px] py-[13px] text-white shadow-[0_18px_40px_-14px_rgba(22,35,61,0.6)]">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#25d366]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          <span className="text-[13.5px] font-semibold leading-tight">{toast}</span>
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="shrink-0 text-[#6b7280] hover:text-white">
            <IconClose />
          </button>
        </div>
      )}
    </div>
  );
}
