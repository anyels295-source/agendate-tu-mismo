"use client";

import { useAutoDismiss } from "@/lib/useAutoDismiss";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { statusToast, type BookingStatusValue } from "@/lib/bookingStatusToast";
import RescheduleModal from "./RescheduleModal";
import ConfirmDialog from "./ConfirmDialog";
import NewBookingModal from "./NewBookingModal";
import { IconCalendarSmall, IconClock, IconWhatsapp, IconMail, IconNote, IconVideo, IconClose, IconSearch } from "./icons";
import { useEscapeKey } from "@/lib/useEscapeKey";

export type AgendaEvent = {
  id: string;
  clientName: string;
  /** Opcional: el cliente puede no haber dejado WhatsApp (el email es el contacto obligatorio). */
  phone: string | null;
  email: string | null;
  /** Link de la videollamada (Meet o Teams), si el turno tiene una. */
  meetingUrl: string | null;
  /** Inicio del turno (ISO): Completar/Ausente solo se habilitan una vez que empezó. */
  startISO: string;
  notes: string | null;
  serviceName: string;
  status: string;
  statusLabel: string;
  timeLabel: string;
  endTimeLabel: string;
  dateLabel: string;
  top: number;
  height: number;
};

type Day = {
  label: string;
  dateNum: number;
  dateISO: string;
  isToday: boolean;
  events: AgendaEvent[];
  /** Eventos de otros calendarios conectados (solo "ocupado"). */
  busy: { top: number; height: number; label: string }[];
};

const STATUS_STYLE: Record<string, { bg: string; border: string; bar: string; fg: string }> = {
  CONFIRMED: { bg: "#e4f6ec", border: "#a8e0bd", bar: "#1a7d45", fg: "#166b3b" },
  PENDING: { bg: "#fdf1dc", border: "#f0d199", bar: "#a4700f", fg: "#8a5d0b" },
  COMPLETED: { bg: "#e7effb", border: "#b8cef0", bar: "#215a8f", fg: "#1c4d7a" },
  NO_SHOW: { bg: "#fbe7e7", border: "#f3c6c2", bar: "#b6382f", fg: "#a5342b" },
  CANCELLED: { bg: "#eef1f7", border: "#d5dbe6", bar: "#8b95a8", fg: "#6b7280" },
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  CONFIRMED: { bg: "#e4f6ec", fg: "#1a7d45" },
  PENDING: { bg: "#fdf1dc", fg: "#a4700f" },
  COMPLETED: { bg: "#e7effb", fg: "#215a8f" },
  NO_SHOW: { bg: "#fbe7e7", fg: "#b6382f" },
  CANCELLED: { bg: "#eef1f7", fg: "#6b7280" },
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "Activos (sin canceladas)" },
  { value: "PENDING", label: "Pendiente" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "COMPLETED", label: "Completada" },
  { value: "NO_SHOW", label: "Ausente" },
  { value: "CANCELLED", label: "Cancelada" },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
}

const AVATAR_PALETTE = [
  ["#dce6f1", "#1f3864"],
  ["#e4f6ec", "#1a7d45"],
  ["#fdf1dc", "#a4700f"],
  ["#f0e7fb", "#6b3fa0"],
  ["#e7effb", "#215a8f"],
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type LaidOutEvent = AgendaEvent & { columnIndex: number; columnCount: number };

/**
 * Distribuye turnos que se superponen en el tiempo en columnas paralelas
 * (como Google Calendar), en vez de dibujarlos todos con el ancho completo
 * uno encima del otro. Usa `top`/`height` (ya calculados en minutos→píxeles
 * por la página que arma `days`) para detectar solapamiento, agrupando en
 * "clusters" de turnos que se tocan entre sí de forma transitiva.
 */
function layoutOverlappingEvents(events: AgendaEvent[]): LaidOutEvent[] {
  const sorted = [...events].sort((a, b) => a.top - b.top || a.height - b.height);

  type Cluster = { columnEnds: number[]; clusterEnd: number };
  const clusters: Cluster[] = [];
  const columnByEventId = new Map<string, number>();
  const clusterByEventId = new Map<string, Cluster>();

  for (const ev of sorted) {
    const start = ev.top;
    const end = ev.top + ev.height;
    let cluster = clusters[clusters.length - 1];
    if (!cluster || start >= cluster.clusterEnd) {
      cluster = { columnEnds: [], clusterEnd: end };
      clusters.push(cluster);
    }
    let columnIndex = cluster.columnEnds.findIndex((colEnd) => colEnd <= start);
    if (columnIndex === -1) {
      columnIndex = cluster.columnEnds.length;
      cluster.columnEnds.push(end);
    } else {
      cluster.columnEnds[columnIndex] = end;
    }
    cluster.clusterEnd = Math.max(cluster.clusterEnd, end);
    columnByEventId.set(ev.id, columnIndex);
    clusterByEventId.set(ev.id, cluster);
  }

  return sorted.map((ev) => ({
    ...ev,
    columnIndex: columnByEventId.get(ev.id) ?? 0,
    columnCount: clusterByEventId.get(ev.id)?.columnEnds.length ?? 1,
  }));
}

export default function AgendaWeekGrid({
  days: allDays,
  timeLabels,
  rowHeight,
  professionalSlug,
  hasConnections,
  busyFailed,
}: {
  days: Day[];
  timeLabels: string[];
  rowHeight: number;
  professionalSlug: string;
  hasConnections: boolean;
  busyFailed: boolean;
}) {
  const router = useRouter();
  // Mostrar u ocultar los eventos de otros calendarios en la grilla.
  const [showBusy, setShowBusy] = useState(true);
  const [detail, setDetail] = useState<AgendaEvent | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [newBookingDay, setNewBookingDay] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Estado anterior del último turno modificado, para ofrecer "Deshacer" en el aviso.
  const [undo, setUndo] = useState<{ id: string; status: string } | null>(null);
  useAutoDismiss(toast, setToast, undo ? 9000 : 6000);
  useEffect(() => {
    if (!toast) setUndo(null);
  }, [toast]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Los turnos cancelados liberan el horario (puede haber otro turno en el
  // mismo hueco), así que solo se muestran cuando se filtra por "Cancelada".
  const days = allDays.map((d) => ({
    ...d,
    events: d.events.filter((ev) => (statusFilter === "CANCELLED" ? ev.status === "CANCELLED" : ev.status !== "CANCELLED")),
  }));

  // Búsqueda/filtro de turnos dentro de la semana visible: en vez de saltar
  // a otra semana o esconder turnos, resalta los que coinciden y atenúa el
  // resto — así se puede ubicar rápido a un cliente sin perder de vista el
  // resto de la agenda de esa semana. Ver agendate_ideas_originales_gap_analysis
  // en memoria del proyecto — mejora pedida el 2026-08-20.
  const normalizedQuery = normalize(query.trim());
  const hasFilter = normalizedQuery.length > 0 || statusFilter !== "ALL";
  function matchesFilter(ev: AgendaEvent): boolean {
    if (statusFilter !== "ALL" && ev.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const haystack = normalize(`${ev.clientName} ${ev.phone ?? ""}`);
    return haystack.includes(normalizedQuery);
  }
  const matchCount = hasFilter ? days.reduce((sum, d) => sum + d.events.filter(matchesFilter).length, 0) : 0;

  // El reschedule modal y el diálogo de confirmación manejan su propio Escape;
  // este solo cierra el detalle cuando ninguno de esos dos está abierto encima.
  useEscapeKey(() => {
    if (showReschedule || confirmCancel || newBookingDay) return;
    if (detail) setDetail(null);
  });

  const gridHeight = timeLabels.length * rowHeight;

  function setStatus(status: BookingStatusValue) {
    if (!detail) return;
    changeStatus(detail.id, status, { previous: detail.status });
  }

  async function changeStatus(id: string, status: BookingStatusValue, opts: { previous?: string; undo?: boolean } = {}) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setBusy(false);
      if (res.ok) {
        setDetail(null);
        setConfirmCancel(false);
        if (opts.undo) {
          setUndo(null);
          setToast("Cambio deshecho.");
        } else {
          setToast(statusToast(status, opts.previous, (await res.json().catch(() => ({}))).emailSent));
          setUndo(status !== "CANCELLED" && opts.previous && opts.previous !== status ? { id, status: opts.previous } : null);
        }
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
    <div className="relative overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line2)] p-3">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-nav)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente o teléfono en esta semana…"
            aria-label="Buscar turnos por cliente o teléfono en la semana visible"
            className="w-full rounded-[10px] border border-[var(--line-in)] bg-[var(--surface)] py-2 pl-9 pr-3 text-[13.5px] text-[var(--ink2)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar turnos por estado"
          className="rounded-[10px] border border-[var(--line-in)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold text-[var(--ink2)]"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hasConnections && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted-nav)]">
            <input type="checkbox" checked={showBusy} onChange={(e) => setShowBusy(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--brand)]" />
            Mostrar otros calendarios
          </label>
        )}
        {hasConnections && showBusy && busyFailed && (
          <span role="status" className="text-[12px] font-semibold text-[#a4700f]">No se pudieron cargar algunos calendarios.</span>
        )}
        {hasFilter && (
          <span className="text-[12.5px] font-semibold text-[var(--muted-nav)]">
            {matchCount === 0
              ? "Ningún turno coincide esta semana"
              : `${matchCount} ${matchCount === 1 ? "turno coincide" : "turnos coinciden"} esta semana`}
          </span>
        )}
      </div>

      <div className="grid min-w-[680px] grid-cols-[62px_repeat(7,minmax(96px,1fr))] border-b border-[var(--line2)]">
        <div className="border-r border-[var(--line2)]" />
        {days.map((d) => (
          <div key={d.label} className="p-[11px_4px] text-center">
            <span className="sr-only">
              {new Date(`${d.dateISO}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
              {d.isToday ? " (hoy)" : ""}
            </span>
            <div
              aria-hidden="true"
              className="inline-flex flex-col items-center gap-px rounded-[10px] px-[11px] py-[5px]"
              style={{ background: d.isToday ? "var(--brand)" : "transparent" }}
            >
              <span
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: d.isToday ? "rgba(255,255,255,.7)" : "var(--muted-nav)" }}
              >
                {d.label}
              </span>
              <span className="text-[16px] font-extrabold" style={{ color: d.isToday ? "#fff" : "var(--ink2)" }}>
                {d.dateNum}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid min-w-[680px] grid-cols-[62px_repeat(7,minmax(96px,1fr))]" style={{ height: gridHeight }}>
        <div className="relative border-r border-[var(--line2)]">
          {timeLabels.map((t, i) => (
            <div key={t} className="absolute right-2 -translate-y-2 text-[11px] font-semibold text-[var(--muted-nav)]" style={{ top: i * rowHeight }}>
              {t}
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.label}
            className="relative border-r border-[var(--line3)] cursor-pointer transition-colors hover:bg-[var(--line3)]/30"
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              setNewBookingDay(d.dateISO);
            }}
            style={{
              background: `repeating-linear-gradient(var(--surface), var(--surface) ${rowHeight - 1}px, var(--line3) ${rowHeight - 1}px, var(--line3) ${rowHeight}px)`,
            }}
          >
            {showBusy &&
              d.busy.map((b, i) => (
                <div
                  key={`busy-${i}`}
                  aria-hidden="true"
                  title={`Ocupado en otro calendario · ${b.label}`}
                  className="pointer-events-none absolute left-[2px] right-[2px] overflow-hidden rounded-md border border-dashed border-[var(--line-btn)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--muted-nav)]"
                  style={{
                    top: b.top,
                    height: b.height,
                    background: "repeating-linear-gradient(135deg, var(--page), var(--page) 5px, var(--line3) 5px, var(--line3) 10px)",
                  }}
                >
                  {b.height >= 26 ? "Ocupado · otro calendario" : ""}
                </div>
              ))}
            {layoutOverlappingEvents(d.events).map((ev) => {
              const style = STATUS_STYLE[ev.status] ?? STATUS_STYLE.CONFIRMED;
              const widthPct = 100 / ev.columnCount;
              const isMatch = matchesFilter(ev);
              const dimmed = hasFilter && !isMatch;
              const highlighted = hasFilter && isMatch;
              return (
                <button
                  key={ev.id}
                  onClick={() => setDetail(ev)}
                  className="absolute flex flex-col justify-center gap-px overflow-hidden rounded-lg px-2 py-1 text-left leading-tight transition-opacity"
                  style={{
                    top: ev.top,
                    height: ev.height,
                    left: `calc(${ev.columnIndex * widthPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    borderLeft: `3px solid ${style.bar}`,
                    color: style.fg,
                    opacity: dimmed ? 0.28 : 1,
                    boxShadow: highlighted ? `0 0 0 2px ${style.bar}` : undefined,
                  }}
                >
                  <div className="truncate text-[12px] font-bold">{ev.timeLabel} · {ev.clientName}</div>
                  {ev.height > 34 && ev.columnCount === 1 && (
                    <div className="truncate text-[11px] opacity-75">{ev.serviceName}</div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {detail && badge && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--ink)]/45 p-5" onClick={() => setDetail(null)}>
          <div
            className="flex max-h-[90dvh] w-full max-w-[410px] flex-col overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[0_30px_70px_-20px_rgba(22,35,61,0.5)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle del turno de ${detail.clientName}`}
          >
            <div className="flex shrink-0 items-center gap-[13px] border-b border-[var(--line2)] bg-[var(--subtle)] p-[22px_22px_18px]">
              <div
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
                style={{ background: avBg, color: avFg }}
              >
                {initialsOf(detail.clientName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-extrabold text-[var(--ink)]">{detail.clientName}</div>
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--line2)] text-[var(--muted-nav)]"
              >
                <IconClose />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-[18px_22px_6px]">
              <div className="flex items-center gap-3 border-b border-[var(--line3)] py-2.5">
                <IconCalendarSmall className="shrink-0 text-[var(--muted-nav)]" />
                <div>
                  <div className="text-[11px] font-semibold text-[var(--muted-nav)]">Fecha y hora</div>
                  <div className="text-[14px] font-semibold text-[var(--ink2)]">
                    {detail.dateLabel} · {detail.timeLabel}–{detail.endTimeLabel}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 border-b border-[var(--line3)] py-2.5">
                <IconClock className="shrink-0 text-[var(--muted-nav)]" />
                <div>
                  <div className="text-[11px] font-semibold text-[var(--muted-nav)]">Servicio</div>
                  <div className="text-[14px] font-semibold text-[var(--ink2)]">{detail.serviceName}</div>
                </div>
              </div>
              {detail.meetingUrl && detail.meetingUrl.startsWith("https://") && (
                <div className="flex items-center gap-3 border-b border-[var(--line3)] py-2.5">
                  <IconVideo className="shrink-0 text-[var(--muted-nav)]" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--muted-nav)]">Videollamada</div>
                    <a
                      href={detail.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-[14px] font-semibold text-[var(--brand)] underline"
                    >
                      Unirse a la reunión
                    </a>
                  </div>
                </div>
              )}
              {detail.email && (
                <div className="flex items-center gap-3 border-b border-[var(--line3)] py-2.5">
                  <IconMail className="shrink-0 text-[var(--muted-nav)]" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--muted-nav)]">Email</div>
                    <div className="break-all text-[14px] font-semibold text-[var(--ink2)]">{detail.email}</div>
                  </div>
                </div>
              )}
              {detail.phone && (
                <div className="flex items-center gap-3 border-b border-[var(--line3)] py-2.5 last:border-b-0">
                  <IconWhatsapp className="shrink-0 text-[var(--muted-nav)]" />
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--muted-nav)]">WhatsApp</div>
                    <div className="text-[14px] font-semibold text-[var(--ink2)]">{detail.phone}</div>
                  </div>
                </div>
              )}
              {detail.notes && (
                <div className="flex items-start gap-3 py-2.5">
                  <IconNote className="mt-0.5 shrink-0 text-[var(--muted-nav)]" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--muted-nav)]">Notas</div>
                    <div className="whitespace-pre-wrap break-words text-[14px] font-semibold text-[var(--ink2)]">{detail.notes}</div>
                  </div>
                </div>
              )}
            </div>

            {(detail.status === "COMPLETED" || detail.status === "NO_SHOW") && (
              <div className="shrink-0 px-[22px] pb-[22px] pt-2">
                <button
                  disabled={busy}
                  onClick={() => setStatus("CONFIRMED")}
                  className="w-full rounded-[10px] border border-[var(--line-in)] py-2.5 text-[13.5px] font-semibold text-[var(--ink2)] disabled:opacity-50"
                >
                  Volver a Confirmada
                </button>
              </div>
            )}

            {(detail.status === "PENDING" || detail.status === "CONFIRMED") && (
              <>
                {detail.status === "PENDING" && (
                  <div className="shrink-0 px-[22px] pt-2">
                    <button
                      disabled={busy}
                      onClick={() => setStatus("CONFIRMED")}
                      className="w-full rounded-[10px] border-none bg-[#1a7d45] py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      Confirmar turno
                    </button>
                  </div>
                )}
                <div className="flex shrink-0 gap-2 px-[22px] pb-2 pt-2">
                  <button
                    disabled={busy || new Date(detail.startISO).getTime() > Date.now()}
                    title={new Date(detail.startISO).getTime() > Date.now() ? "Disponible cuando empiece el turno" : undefined}
                    onClick={() => setStatus("COMPLETED")}
                    className="flex-1 rounded-[10px] border border-[var(--line-in)] py-2 text-[12.5px] font-semibold text-[var(--ink2)] disabled:opacity-50"
                  >
                    Completar
                  </button>
                  <button
                    disabled={busy || new Date(detail.startISO).getTime() > Date.now()}
                    title={new Date(detail.startISO).getTime() > Date.now() ? "Disponible cuando empiece el turno" : undefined}
                    onClick={() => setStatus("NO_SHOW")}
                    className="flex-1 rounded-[10px] border border-[var(--line-in)] py-2 text-[12.5px] font-semibold text-[var(--ink2)] disabled:opacity-50"
                  >
                    Marcar ausente
                  </button>
                </div>
                <div className="flex shrink-0 gap-2.5 p-[4px_22px_22px]">
                  <button
                    disabled={busy}
                    onClick={() => setConfirmCancel(true)}
                    className="flex-1 rounded-[11px] border border-[#f0d0cc] bg-[var(--surface)] py-[11px] text-[14px] font-semibold text-[#b6382f] disabled:opacity-50"
                  >
                    Cancelar turno
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setShowReschedule(true)}
                    className="flex-1 rounded-[11px] border-none bg-[var(--brand)] py-[11px] text-[14px] font-bold text-white disabled:opacity-50"
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
          clientPhone={detail.phone}
          clientEmail={detail.email}
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

      {newBookingDay && (
        <NewBookingModal
          professionalSlug={professionalSlug}
          initialDateISO={newBookingDay}
          onClose={() => setNewBookingDay(null)}
          onDone={(message) => {
            setNewBookingDay(null);
            setToast(message);
            router.refresh();
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
              onClick={() => changeStatus(undo.id, undo.status as BookingStatusValue, { undo: true })}
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
