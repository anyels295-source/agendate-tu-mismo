"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NewBookingModal from "./NewBookingModal";
import { IconClose } from "./icons";

/** Botón "+ Nueva reserva" de la página Reservas: abre el alta manual de un turno. */
export default function NewBookingButton({ professionalSlug }: { professionalSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-[10px] bg-[var(--brand)] px-[15px] py-[9px] text-[13px] font-semibold text-white"
      >
        + Nueva reserva
      </button>

      {open && (
        <NewBookingModal
          professionalSlug={professionalSlug}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            setToast(message);
            router.refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-[28px] left-1/2 z-40 flex max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-[13px] bg-[var(--ink)] px-[18px] py-[13px] text-white shadow-[0_18px_40px_-14px_rgba(22,35,61,0.6)]">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#25d366]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          <span className="text-[13.5px] font-semibold leading-tight">{toast}</span>
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="shrink-0 text-[var(--muted-nav)] hover:text-white">
            <IconClose />
          </button>
        </div>
      )}
    </>
  );
}
