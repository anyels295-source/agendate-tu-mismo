import { DateTime, Interval } from "luxon";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/calendar/tokenManager";
import { getGoogleFreeBusy } from "@/lib/calendar/google";
import { getOutlookFreeBusy } from "@/lib/calendar/outlook";
import type { BusyBlock, WorkingHours } from "@/lib/types";
import type { Professional, CalendarConnection } from "@prisma/client";

const WEEKDAY_KEYS: (keyof WorkingHours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
  const mergedBusy = mergeBusyBlocks(busyBlocksPerConnection.flat());
  const ownInterval = excludeInterval
    ? Interval.fromDateTimes(DateTime.fromJSDate(excludeInterval.start), DateTime.fromJSDate(excludeInterval.end))
    : null;
  const allBusy = ownInterval ? mergedBusy.flatMap((b) => b.difference(ownInterval)) : mergedBusy;

  const workingHours = professional.workingHours as unknown as WorkingHours;
  const durationMin = professional.durationMinutes;
  const bufferMin = professional.bufferMinutes;
  const stepMin = 15; // granularidad de los slots ofrecidos, independiente de la duración del servicio

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
        let slotStart = freeInterval.start!;
        while (slotStart.plus({ minutes: durationMin }) <= freeInterval.end!) {
          const slotEnd = slotStart.plus({ minutes: durationMin });
          const slotEndWithBuffer = slotEnd.plus({ minutes: bufferMin });
          if (slotStart >= minStart && slotEndWithBuffer <= freeInterval.end!.plus({ minutes: bufferMin })) {
            slots.push({ startISO: slotStart.toISO()!, endISO: slotEnd.toISO()! });
          }
          slotStart = slotStart.plus({ minutes: stepMin });
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
}): Promise<boolean> {
  const { professional, connections, startISO, endISO, excludeBookingId } = params;
  const busyBlocksPerConnection = await Promise.all(
    connections.map((c) => fetchBusyBlocksForConnection(c, startISO, endISO))
  );
  const allBusy = mergeBusyBlocks(busyBlocksPerConnection.flat());
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
