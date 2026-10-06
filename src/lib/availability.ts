import { DateTime, Interval } from "luxon";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/calendar/tokenManager";
import { getGoogleFreeBusy } from "@/lib/calendar/google";
import { getOutlookFreeBusy } from "@/lib/calendar/outlook";
import type { BusyBlock, WorkingHours } from "@/lib/types";
import type { Professional, CalendarConnection } from "@prisma/client";

const WEEKDAY_KEYS: (keyof WorkingHours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Granularidad de los turnos: siempre empiezan en :00, :15, :30 o :45, sea cual sea la duración del servicio. */
const SLOT_STEP_MINUTES = 15;

/** Tope de fecha para los turnos que crea o reprograma el profesional desde el panel. */
const ADMIN_MAX_ADVANCE_YEARS = 2;

/** Lleva una hora al próximo múltiplo de SLOT_STEP_MINUTES (09:07 → 09:15; 09:15 queda igual). */
function alignToSlotGrid(dt: DateTime, timezone: string): DateTime {
  const local = dt.setZone(timezone);
  const hourStart = local.startOf("hour");
  const minutes = Math.ceil(local.diff(hourStart, "minutes").minutes / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  return hourStart.plus({ minutes });
}

function isOnSlotGrid(dt: DateTime, timezone: string): boolean {
  const local = dt.setZone(timezone);
  return local.minute % SLOT_STEP_MINUTES === 0 && local.second === 0 && local.millisecond === 0;
}

/**
 * Servicio de disponibilidad compartido: es el núcleo técnico que reutilizan
 * tanto la reserva pública (Agendate Tú Mismo) como, a futuro, Agente
 * AgendaFácil, evitando construir dos veces la lógica más costosa del
 * proyecto (fusionar calendarios y calcular huecos libres reales).
 */

async function fetchBusyBlocksForConnection(connection: CalendarConnection, timeMinISO: string, timeMaxISO: string): Promise<BusyBlock[]> {
  const accessToken = await getValidAccessToken(connection);

  if (connection.provider === "GOOGLE") {
    return getGoogleFreeBusy({
      accessToken,
      calendarId: connection.externalCalendarId,
      timeMinISO,
      timeMaxISO,
    });
  }

  return getOutlookFreeBusy({
    accessToken,
    calendarId: connection.externalCalendarId,
    timeMinISO,
    timeMaxISO,
    accountEmail: connection.accountEmail,
  });
}

/** Fusiona intervalos ocupados solapados/adyacentes en una sola lista ordenada. */
function mergeBusyBlocks(blocks: BusyBlock[]): Interval[] {
  const intervals = blocks
    .map((b) => Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end)))
    .filter((i) => i.isValid)
    .sort((a, b) => a.start!.toMillis() - b.start!.toMillis());

  const merged: Interval[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start!.toMillis() <= last.end!.toMillis()) {
      merged[merged.length - 1] = Interval.fromDateTimes(last.start!, DateTime.max(last.end!, interval.end!));
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

function getWorkingWindowsForDay(workingHours: WorkingHours, day: DateTime, timezone: string): Interval[] {
  const key = WEEKDAY_KEYS[day.weekday - 1];
  const ranges = workingHours[key] ?? [];
  return ranges.map((r) => {
    const [startH, startM] = r.start.split(":").map(Number);
    const [endH, endM] = r.end.split(":").map(Number);
    const start = day.setZone(timezone).set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
    const end = day.setZone(timezone).set({ hour: endH, minute: endM, second: 0, millisecond: 0 });
    return Interval.fromDateTimes(start, end);
  });
}

/** Resta los bloques ocupados de una ventana laboral, devolviendo los tramos libres restantes. */
function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  let free: Interval[] = [window];
  for (const b of busy) {
    free = free.flatMap((f) => f.difference(b));
  }
  return free;
}

export type FreeSlot = { startISO: string; endISO: string };

/**
 * Bloques ocupados de los calendarios conectados en un rango, para mostrarlos en
 * la Agenda. No lanza nunca: si un calendario falla (o tarda más de 6 segundos), se
 * muestra lo que se pudo y se devuelve failed = true para avisarlo.
 */
export async function getExternalBusyIntervals(
  connections: CalendarConnection[],
  fromISO: string,
  toISO: string
): Promise<{ intervals: Interval[]; failed: boolean }> {
  if (connections.length === 0) return { intervals: [], failed: false };
  const work = Promise.allSettled(connections.map((c) => fetchBusyBlocksForConnection(c, fromISO, toISO)));
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 6000));
  const outcome = await Promise.race([work, timeout]);
  if (outcome === "timeout") return { intervals: [], failed: true };
  const blocks = outcome.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return { intervals: mergeBusyBlocks(blocks), failed: outcome.some((r) => r.status === "rejected") };
}

/**
 * Agranda cada bloque ocupado con el "colchón entre turnos" configurado, hacia
 * adelante y hacia atrás: así, entre un evento del calendario y el turno
 * siguiente queda siempre ese margen. Los bordes del horario de atención no
 * llevan colchón, solo los eventos ocupados.
 */
export function expandBusyByBuffer(busy: Interval[], bufferMinutes: number): Interval[] {
  if (bufferMinutes <= 0) return busy;
  const expanded = busy.map((b) => Interval.fromDateTimes(b.start!.minus({ minutes: bufferMinutes }), b.end!.plus({ minutes: bufferMinutes })));
  // Al agrandarlos pueden tocarse: se vuelven a fusionar.
  const merged: Interval[] = [];
  for (const interval of expanded.sort((a, b) => a.start!.toMillis() - b.start!.toMillis())) {
    const last = merged[merged.length - 1];
    if (last && interval.start!.toMillis() <= last.end!.toMillis()) {
      merged[merged.length - 1] = Interval.fromDateTimes(last.start!, DateTime.max(last.end!, interval.end!));
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** Resta un intervalo (ej. el horario del propio turno que se reprograma) de una lista de bloques ocupados. */
function subtractInterval(busy: Interval[], own: { start: Date; end: Date } | undefined): Interval[] {
  if (!own) return busy;
  const ownInterval = Interval.fromDateTimes(DateTime.fromJSDate(own.start), DateTime.fromJSDate(own.end));
  return busy.flatMap((b) => b.difference(ownInterval));
}

/**
 * Valida en el servidor que un turno pedido sea realmente reservable, sin
 * confiar en lo que mande el navegador: dentro de un tramo del horario de
 * atención, no en el pasado y, para reservas públicas, respetando la
 * anticipación mínima y la máxima. Devuelve el motivo del rechazo, o null si
 * es válido. Desde el panel (origin "ADMIN") no se exige el aviso mínimo ni
 * se limita la anticipación máxima.
 */
export function checkSlotAllowed(params: {
  professional: Professional;
  start: DateTime;
  end: DateTime;
  origin: "PUBLIC" | "ADMIN";
}): string | null {
  const { professional, start, end, origin } = params;
  const timezone = professional.timezone;
  if (!start.isValid || !end.isValid || end <= start) return "Fecha u hora inválida.";
  if (!isOnSlotGrid(start, timezone)) return `Los turnos empiezan cada ${SLOT_STEP_MINUTES} minutos (ej. 09:00, 09:15, 09:30). Elegí un horario de la lista.`;

  const now = DateTime.now();
  if (origin === "PUBLIC") {
    if (start < now.plus({ hours: professional.minNoticeHours })) return "Falta la anticipación mínima para reservar ese horario.";
    // Mismo criterio que la lista de horarios: se puede reservar hasta el final del último día permitido.
    const lastAllowed = now.setZone(timezone).startOf("day").plus({ days: professional.maxAdvanceDays }).endOf("day");
    if (start > lastAllowed) return "Ese horario está más allá de la anticipación máxima permitida.";
  } else {
    if (start < now.minus({ minutes: 1 })) return "No se puede agendar un turno en el pasado.";
    // Sin tope, un error de tipeo en el año (ej. 20226) creaba un turno y un evento basura.
    if (start > now.plus({ years: ADMIN_MAX_ADVANCE_YEARS })) return `No se pueden agendar turnos a más de ${ADMIN_MAX_ADVANCE_YEARS} años.`;
  }

  const day = start.setZone(timezone).startOf("day");
  const windows = getWorkingWindowsForDay(professional.workingHours as unknown as WorkingHours, day, timezone);
  const requested = Interval.fromDateTimes(start, end);
  if (!windows.some((w) => w.isValid && w.engulfs(requested))) return "Ese horario está fuera del horario de atención.";
  return null;
}

export async function getAvailableSlots(params: {
  professional: Professional;
  connections: CalendarConnection[];
  fromDate: DateTime; // en la timezone del profesional
  toDate: DateTime;
  /** Al reprogramar: el horario actual del propio turno no cuenta como ocupado. */
  excludeInterval?: { start: Date; end: Date };
}): Promise<FreeSlot[]> {
  const { professional, connections, fromDate, toDate, excludeInterval } = params;
  const timezone = professional.timezone;

  if (connections.length === 0) {
    return [];
  }

  const timeMinISO = fromDate.toUTC().toISO()!;
  const timeMaxISO = toDate.toUTC().toISO()!;

  const busyBlocksPerConnection = await Promise.all(
    connections.map((c) => fetchBusyBlocksForConnection(c, timeMinISO, timeMaxISO))
  );
  const bufferMin = professional.bufferMinutes;
  const allBusy = expandBusyByBuffer(subtractInterval(mergeBusyBlocks(busyBlocksPerConnection.flat()), excludeInterval), bufferMin);

  const workingHours = professional.workingHours as unknown as WorkingHours;
  const durationMin = professional.durationMinutes;

  const now = DateTime.now().setZone(timezone);
  const minStart = now.plus({ hours: professional.minNoticeHours });

  const slots: FreeSlot[] = [];
  let cursor = fromDate.setZone(timezone).startOf("day");
  const end = toDate.setZone(timezone).endOf("day");

  while (cursor <= end) {
    const windows = getWorkingWindowsForDay(workingHours, cursor, timezone);
    for (const window of windows) {
      const freeInWindow = subtractBusy(window, allBusy);
      for (const freeInterval of freeInWindow) {
        // El hueco libre puede empezar a cualquier minuto (ej. un evento externo que termina a las
        // 10:10): se arranca en el próximo :00/:15/:30/:45 para que la grilla del día no se corra.
        let slotStart = alignToSlotGrid(freeInterval.start!, timezone);
        while (slotStart.plus({ minutes: durationMin }) <= freeInterval.end!) {
          const slotEnd = slotStart.plus({ minutes: durationMin });
          if (slotStart >= minStart) {
            slots.push({ startISO: slotStart.toISO()!, endISO: slotEnd.toISO()! });
          }
          slotStart = slotStart.plus({ minutes: SLOT_STEP_MINUTES });
        }
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  return slots;
}

/** Verifica, justo antes de confirmar, que el slot elegido sigue libre (evita doble reserva por condición de carrera). */
export async function isSlotStillFree(params: {
  professional: Professional;
  connections: CalendarConnection[];
  startISO: string;
  endISO: string;
  excludeBookingId?: string;
  /** Al reprogramar: el horario actual del propio turno (su evento en el calendario) no cuenta como ocupado. */
  ignoreInterval?: { start: Date; end: Date };
}): Promise<boolean> {
  const { professional, connections, startISO, endISO, excludeBookingId, ignoreInterval } = params;
  const busyBlocksPerConnection = await Promise.all(
    connections.map((c) => fetchBusyBlocksForConnection(c, startISO, endISO))
  );
  const allBusy = expandBusyByBuffer(
    subtractInterval(mergeBusyBlocks(busyBlocksPerConnection.flat()), ignoreInterval),
    professional.bufferMinutes
  );
  const requested = Interval.fromDateTimes(DateTime.fromISO(startISO), DateTime.fromISO(endISO));
  const overlaps = allBusy.some((b) => b.overlaps(requested));
  if (overlaps) return false;

  // También chequear reservas PENDING/CONFIRMED ya registradas en nuestra base
  // (cubre la ventana entre que se creó el registro y que el evento aparece
  // reflejado en el freebusy del proveedor). Al reprogramar, se excluye la
  // propia reserva para no chocar contra su horario anterior.
  const conflicting = await prisma.booking.findFirst({
    where: {
      professionalId: professional.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      startTime: { lt: DateTime.fromISO(endISO).toJSDate() },
      endTime: { gt: DateTime.fromISO(startISO).toJSDate() },
    },
  });

  return !conflicting;
}
