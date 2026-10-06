"use client";

import { useAutoDismiss } from "@/lib/useAutoDismiss";
import { useEffect, useMemo, useState } from "react";
import { statusToast, type BookingStatusValue } from "@/lib/bookingStatusToast";
import { useRouter } from "next/navigation";
import RescheduleModal from "./RescheduleModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconSearch, IconDots, IconReprogramar, IconCheck, IconNoShow, IconClose } from "./icons";

export type BookingRow = {
  id: string;
  clientName: string;
  /** Opcional: el cliente puede no haber dejado WhatsApp (el email es el contacto obligatorio). */
  clientPhone: string | null;
  clientEmail: string | null;
  notes: string | null;
  /** Inicio del turno (ISO): Completar/Ausente solo se habilitan una vez que empezó. */
  startISO: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  status: string;
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  CONFIRMED: { label: "Confirmada", bg: "#e4f6ec", fg: "#1a7d45" },
  PENDING: { label: "Pendiente", bg: "#fdf1dc", fg: "#a4700f" },
  CANCELLED: { label: "Cancelada", bg: "#eef1f7", fg: "#6b7280" },
  COMPLETED: { label: "Completada", bg: "#e7effb", fg: "#215a8f" },
  NO_SHOW: { label: "Ausente", bg: "#fbe7e7", fg: "#b6382f" },
};

const AVATAR_PALETTE = [
  ["#dce6f1", "#1f3864"],
  ["#e4f6ec", "#1a7d45"],
  ["#fdf1dc", "#a4700f"],
  ["#f0e7fb", "#6b3fa0"],
  ["#e7effb", "#215a8f"],
];

const CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "CONFIRMED", label: "Confirmadas" },
  { key: "PENDING", label: "Pendientes" },
  { key: "toClose", label: "Por cerrar" },
  { key: "COMPLETED", label: "Completadas" },
  { key: "NO_SHOW", label: "Ausentes" },
  { key: "CANCELLED", label: "Canceladas" },
];

/** Turno que ya empezó y sigue pendiente o confirmado: falta cerrarlo (completado o ausente). */
function isToClose(r: { status: string; startISO: string }): boolean {
  return (r.status === "PENDING" || r.status === "CONFIRMED") && new Date(r.startISO).getTime() < Date.now();
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Evita que Excel/Sheets interprete como fórmula un texto cargado por un cliente (=, +, -, @ al inicio). */
function csvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Exporta exactamente las filas visibles (ya filtradas por búsqueda/estado), nunca el listado completo sin filtrar. */
function exportCsv(rows: BookingRow[]) {
  const header = ["Fecha", "Hora", "Cliente", "Email", "Teléfono", "Servicio", "Estado", "Notas"].map(csvField).join(",");
  const body = rows
    .map((r) =>
      [r.dateLabel, r.timeLabel, csvText(r.clientName), csvText(r.clientEmail ?? ""), r.clientPhone ?? "", csvText(r.serviceName), STATUS_META[r.status]?.label ?? r.status, csvText(r.notes ?? "")]
        .map(csvField)
        .join(",")
    )
    .join("\n");
  // El BOM UTF-8 hace que Excel respete los acentos.
  const blob = new Blob(["\uFEFF", `${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reservas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BookingsTable({
  rows,
  professionalSlug,
  initialFilter,
  initialQuery,
  limited = false,
}: {
  rows: BookingRow[];
  professionalSlug: string;
  initialFilter?: string;
  initialQuery?: string;
  /** El listado se cortó en las 200 reservas más recientes. */
  limited?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState((initialQuery ?? "").slice(0, 100));
  const [filter, setFilter] = useState(CHIPS.some((c) => c.key === initialFilter) ? (initialFilter as string) : "all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Estado anterior del último turno modificado, para ofrecer "Deshacer" en el aviso.
  const [undo, setUndo] = useState<{ id: string; status: string } | null>(null);
  useAutoDismiss(toast, setToast, undo ? 9000 : 6000);
  useEffect(() => {
    if (!toast) setUndo(null);
  }, [toast]);
  const toCloseCount = rows.filter(isToClose).length;

  // Búsqueda y filtro quedan en la URL (sin navegar), para poder recargar o compartir la vista.
  function syncUrl(nextQ: string, nextFilter: string) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ);
    if (nextFilter !== "all") params.set("filter", nextFilter);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = normalizeText(q.trim());
    const queryDigits = q.replace(/\D/g, "");
    return rows.filter((r) => {
      const okFilter = filter === "all" ? true : filter === "toClose" ? isToClose(r) : r.status === filter;
      // Sin acentos ni mayúsculas para el nombre, y solo dígitos para el teléfono.
      const okQuery =
        !query ||
        normalizeText(r.clientName).includes(query) ||
        (queryDigits.length >= 3 && (r.clientPhone ?? "").replace(/\D/g, "").includes(queryDigits));
      return okFilter && okQuery;
    });
  }, [rows, q, filter]);

  async function updateStatus(id: string, status: BookingStatusValue, opts: { undo?: boolean } = {}) {
    const previous = rows.find((r) => r.id === id)?.status;
    setBusyId(id);
    setMenuId(null);
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (res.ok) {
      if (opts.undo) {
        setUndo(null);
        setToast("Cambio deshecho.");
      } else {
        setToast(statusToast(status, previous, (await res.json().catch(() => ({}))).emailSent));
        setUndo(status !== "CANCELLED" && previous && previous !== status ? { id, status: previous } : null);
      }
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setToast(json.error ?? "No se pudo actualizar el turno.");
    }
  }

  const rescheduling = rows.find((r) => r.id === rescheduleId);
  const cancelling = rows.find((r) => r.id === confirmCancelId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="absolute left-[13px] top-1/2 -translate-y-1/2 text-[var(--muted-nav)]" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              syncUrl(e.target.value, filter);
            }}
            placeholder="Buscar por nombre o teléfono…"
            className="w-full rounded-[11px] border border-[var(--line-in)] bg-[var(--surface)] py-[10px] pl-[38px] pr-9 text-[14px]"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                syncUrl("", filter);
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted-nav)] hover:bg-[var(--page)]"
            >
              <IconClose />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {CHIPS.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                aria-pressed={active}
                onClick={() => {
                  setFilter(c.key);
                  syncUrl(q, c.key);
                }}
                className="rounded-full border px-[13px] py-2 text-[12.5px] font-semibold"
                style={{
                  borderColor: active ? "var(--brand)" : "var(--line-in)",
                  background: active ? "var(--brand)" : "var(--surface)",
                  color: active ? "#fff" : "#5a6884",
                }}
              >
                {c.key === "toClose" && toCloseCount > 0 ? `Por cerrar (${toCloseCount})` : c.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? "No hay reservas para exportar con este filtro." : "Exportar las reservas visibles a CSV"}
          className="rounded-[10px] border border-[var(--line-btn)] bg-[var(--surface)] px-[15px] py-[9px] text-[13px] font-semibold text-[var(--ink2)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Exportar
        </button>
      </div>

      <div className="overflow-visible rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-[minmax(70px,.9fr)_minmax(0,1.5fr)_auto_32px] gap-x-2 sm:grid-cols-[minmax(96px,1.3fr)_minmax(120px,1.4fr)_minmax(104px,1.1fr)_minmax(88px,.9fr)_40px] sm:gap-x-4 rounded-t-[15px] bg-[var(--subtle)] p-[13px_12px] sm:p-[13px_20px] text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted-nav)]">
          <span>Fecha</span>
          <span>Cliente</span>
          <span className="hidden sm:block">Teléfono</span>
          <span>Estado</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-11 text-center text-[14px] text-[var(--muted-nav)]">
            {rows.length === 0
              ? "Todavía no hay reservas. Compartí tu link de reserva para empezar."
              : "No hay reservas que coincidan con el filtro."}
          </div>
        )}

        {limited && (
          <div className="border-t border-[var(--line3)] bg-[var(--subtle)] px-5 py-2.5 text-[12.5px] text-[var(--muted-nav)]">
            Se muestran las 200 reservas más recientes. Para ver períodos anteriores, usá Reportes.
          </div>
        )}
        {filtered.map((b, i) => {
          const meta = STATUS_META[b.status] ?? STATUS_META.PENDING;
          const canAct = b.status === "PENDING" || b.status === "CONFIRMED";
          const canFix = b.status === "COMPLETED" || b.status === "NO_SHOW";
          const [avBg, avFg] = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
          return (
            <div
              key={b.id}
              className="grid grid-cols-[minmax(70px,.9fr)_minmax(0,1.5fr)_auto_32px] gap-x-2 sm:grid-cols-[minmax(96px,1.3fr)_minmax(120px,1.4fr)_minmax(104px,1.1fr)_minmax(88px,.9fr)_40px] sm:gap-x-4 items-center border-t border-[var(--line3)] p-[14px_12px] text-[13.5px] sm:p-[14px_20px]"
            >
              <div className="min-w-0">
                <div className="font-bold text-[var(--ink2)]">{b.dateLabel}</div>
                <div className="text-[12px] text-[var(--muted-nav)]">{b.timeLabel}</div>
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
                  style={{ background: avBg, color: avFg }}
                >
                  {initialsOf(b.clientName)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[var(--ink2)]">{b.clientName}</div>
                  <div className="truncate text-[12px] font-semibold text-[var(--brand)]">{b.serviceName}</div>
                  <div className="truncate text-[12px] text-[var(--muted-nav)] sm:hidden">{b.clientPhone ?? "Sin WhatsApp"}</div>
                  {b.notes && (
                    <div className="truncate text-[12px] italic text-[var(--muted-nav)]" title={b.notes}>
                      Nota: {b.notes}
                    </div>
                  )}
                </div>
              </div>
              <div className="hidden min-w-0 truncate text-[#5a6884] sm:block" title={b.clientPhone ?? undefined}>{b.clientPhone ?? "—"}</div>
              <div>
                <span
                  className="inline-block whitespace-nowrap rounded-full px-[10px] py-1 text-[11.5px] font-bold"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  {meta.label}
                </span>
              </div>
              <div className="relative text-right">
                {canFix && (
                  <>
                    <button
                      disabled={busyId === b.id}
                      onClick={() => setMenuId(menuId === b.id ? null : b.id)}
                      aria-label={`Más acciones para el turno de ${b.clientName}`}
                      aria-haspopup="menu"
                      aria-expanded={menuId === b.id}
                      className="rounded-md p-1 text-[var(--muted-nav)] hover:bg-[var(--page)]"
                    >
                      <IconDots />
                    </button>
                    {menuId === b.id && (
                      <div className="absolute right-0 top-9 z-30 w-[196px] rounded-[13px] border border-[var(--line)] bg-[var(--surface)] p-1.5 text-left shadow-[0_16px_36px_-12px_rgba(31,56,100,0.35)]">
                        <button
                          onClick={() => updateStatus(b.id, "CONFIRMED")}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[var(--ink2)] hover:bg-[var(--page)]"
                        >
                          <IconCheck className="text-[#1a7d45]" />
                          Volver a Confirmada
                        </button>
                        <button
                          onClick={() => updateStatus(b.id, b.status === "COMPLETED" ? "NO_SHOW" : "COMPLETED")}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[var(--ink2)] hover:bg-[var(--page)]"
                        >
                          <IconNoShow className="text-[#a4700f]" />
                          {b.status === "COMPLETED" ? "Cambiar a ausente" : "Cambiar a completada"}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {canAct && (
                  <>
                    <button
                      disabled={busyId === b.id}
                      onClick={() => setMenuId(menuId === b.id ? null : b.id)}
                      aria-label={`Más acciones para el turno de ${b.clientName}`}
                      aria-haspopup="menu"
                      aria-expanded={menuId === b.id}
                      className="rounded-md p-1 text-[var(--muted-nav)] hover:bg-[var(--page)]"
                    >
                      <IconDots />
                    </button>
                    {menuId === b.id && (
                      <div className="absolute right-0 top-9 z-30 w-[196px] rounded-[13px] border border-[var(--line)] bg-[var(--surface)] p-1.5 text-left shadow-[0_16px_36px_-12px_rgba(31,56,100,0.35)]">
                        <button
                          onClick={() => {
                            setMenuId(null);
                            setRescheduleId(b.id);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[var(--ink2)] hover:bg-[var(--page)]"
                        >
                          <IconReprogramar className="text-[var(--brand)]" />
                          Reprogramar
                        </button>
                        {b.status === "PENDING" && (
                          <button
                            onClick={() => updateStatus(b.id, "CONFIRMED")}
                            className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[var(--ink2)] hover:bg-[var(--page)]"
                          >
                            <IconCheck className="text-[#1a7d45]" />
                            Confirmar turno
                          </button>
                        )}
                        <button
                          onClick={() => updateStatus(b.id, "COMPLETED")}
                          disabled={new Date(b.startISO).getTime() > Date.now()}
                          title={new Date(b.startISO).getTime() > Date.now() ? "Disponible cuando empiece el turno" : undefined}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[var(--ink2)] hover:bg-[var(--page)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <IconCheck className="text-[#1a7d45]" />
                          Marcar completada
                        </button>
                        <button
                          onClick={() => updateStatus(b.id, "NO_SHOW")}
                          disabled={new Date(b.startISO).getTime() > Date.now()}
                          title={new Date(b.startISO).getTime() > Date.now() ? "Disponible cuando empiece el turno" : undefined}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[var(--ink2)] hover:bg-[var(--page)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <IconNoShow className="text-[#a4700f]" />
                          Marcar ausente
                        </button>
                        <div className="my-1 h-px bg-[var(--line2)]" />
                        <button
                          onClick={() => {
                            setMenuId(null);
                            setConfirmCancelId(b.id);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-[#b6382f] hover:bg-[#fbecea]"
                        >
                          <IconClose className="text-[#b6382f]" />
                          Cancelar turno
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rescheduling && (
        <RescheduleModal
          bookingId={rescheduling.id}
          clientName={rescheduling.clientName}
          clientPhone={rescheduling.clientPhone}
          clientEmail={rescheduling.clientEmail}
          professionalSlug={professionalSlug}
          onClose={() => setRescheduleId(null)}
          onDone={(message) => {
            setRescheduleId(null);
            setToast(message);
            router.refresh();
          }}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title="¿Cancelar este turno?"
          description={`Se cancelará el turno de ${cancelling.clientName}, se eliminará el evento del calendario real y se avisará al cliente por los canales habilitados. Esta acción no se puede deshacer.`}
          confirmLabel="Cancelar turno"
          danger
          busy={busyId === cancelling.id}
          onClose={() => setConfirmCancelId(null)}
          onConfirm={() => {
            setConfirmCancelId(null);
            updateStatus(cancelling.id, "CANCELLED");
          }}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-[28px] left-1/2 z-40 flex max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-[13px] bg-[var(--ink)] px-[18px] py-[13px] text-white shadow-[0_18px_40px_-14px_rgba(22,35,61,0.6)]">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#25d366]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
          <span className="text-[13.5px] font-semibold leading-tight">{toast}</span>
          {undo && (
            <button
              onClick={() => updateStatus(undo.id, undo.status as BookingStatusValue, { undo: true })}
              className="shrink-0 rounded-md bg-white/15 px-2.5 py-1 text-[12.5px] font-bold text-white hover:bg-white/25"
            >
              Deshacer
            </button>
          )}
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="shrink-0 text-[var(--muted-nav)] hover:text-white">
            <IconClose />
          </button>
        </div>
      )}
    </div>
  );
}
