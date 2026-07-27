"use client";

import { useEscapeKey } from "@/lib/useEscapeKey";

/** Diálogo de confirmación genérico para acciones destructivas o irreversibles (ej. cancelar un turno). */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Volver",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#16233d]/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[380px] rounded-[18px] bg-white p-6 shadow-[0_30px_70px_-20px_rgba(22,35,61,0.5)]"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="text-[16px] font-extrabold text-[#16233d]">{title}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5a6884]">{description}</p>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-[10px] border border-[#d6deeb] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#2a3856] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-[10px] px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
            style={{ background: danger ? "#b6382f" : "#215a8f" }}
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
