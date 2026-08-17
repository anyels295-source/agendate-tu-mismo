/**
 * Lista curada de zonas horarias para los selectores de Configuración (zona
 * horaria del negocio) y de la página pública de reserva (zona horaria del
 * cliente). Los labels muestran un offset de referencia a título informativo
 * nada más — el cálculo real de horarios siempre usa el id de zona IANA con
 * Luxon (`setZone`), que ya tiene en cuenta el horario de verano de cada
 * lugar en cada momento del año.
 */
export type TimezoneOption = { id: string; label: string };

export const TIMEZONES: TimezoneOption[] = [
  { id: "America/Montevideo", label: "Montevideo (GMT-3)" },
  { id: "America/Bogota", label: "Bogotá / Lima (GMT-5)" },
  { id: "America/Mexico_City", label: "Ciudad de México (GMT-6)" },
  { id: "America/New_York", label: "Nueva York (GMT-4/-5)" },
  { id: "Europe/Madrid", label: "Madrid (GMT+1/+2)" },
  { id: "Europe/London", label: "Londres (GMT+0/+1)" },
  { id: "Asia/Tokyo", label: "Tokio (GMT+9)" },
];

/** Devuelve el label curado de una zona, o el id crudo si no está en la lista (ej. datos previos). */
export function timezoneLabel(id: string): string {
  return TIMEZONES.find((t) => t.id === id)?.label ?? id;
}
