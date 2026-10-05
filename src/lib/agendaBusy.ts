import { DateTime, Interval } from "luxon";

export type DayBusyBlock = { top: number; height: number; label: string };

/**
 * Bloques "ocupado" de un día de la Agenda, para mostrar los eventos de los otros
 * calendarios conectados. Recibe los intervalos ocupados de los calendarios y los
 * turnos de la propia app: estos últimos se restan (ya se dibujan como turnos), así
 * que solo queda lo que viene de afuera. Devuelve la posición y altura en píxeles.
 */
export function buildDayBusyBlocks(params: {
  day: DateTime;
  gridStartHour: number;
  gridEndHour: number;
  rowHeight: number;
  external: Interval[];
  own: Interval[];
}): DayBusyBlock[] {
  const { day, gridStartHour, gridEndHour, rowHeight, external, own } = params;
  const gridStart = day.startOf("day").plus({ hours: gridStartHour });
  const gridEnd = day.startOf("day").plus({ hours: gridEndHour + 1 });
  const visible = Interval.fromDateTimes(gridStart, gridEnd);

  const blocks: DayBusyBlock[] = [];
  for (const interval of external) {
    // Se le quitan los turnos de la app: lo que sobra es de otros calendarios.
    const remaining = own.reduce<Interval[]>((acc, mine) => acc.flatMap((part) => part.difference(mine)), [interval]);
    for (const part of remaining) {
      const clipped = part.intersection(visible);
      if (!clipped || clipped.length("minutes") < 5) continue;
      const start = clipped.start!.setZone(day.zoneName!);
      const end = clipped.end!.setZone(day.zoneName!);
      const startMinutes = start.diff(gridStart, "minutes").minutes;
      const minutes = clipped.length("minutes");
      blocks.push({
        top: startMinutes * (rowHeight / 60),
        height: Math.max((minutes * rowHeight) / 60 - 2, 10),
        label: `${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`,
      });
    }
  }
  return blocks;
}
