import { z } from "zod";

/**
 * Normaliza un teléfono a formato E.164 (+<código de país><número>). Acepta
 * espacios, guiones y paréntesis, y el prefijo internacional "00". Devuelve
 * `null` si no tiene código de país o no tiene entre 8 y 15 dígitos. Es la
 * misma regla para el formulario público, el del panel y la API.
 */
export function normalizePhone(input: string): string | null {
  let value = input.replace(/[\s().-]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export const PHONE_ERROR_MESSAGE = "Si dejás un WhatsApp, ingresá uno válido con código de país, ej. +598 9x xxx xxx.";
export const CLIENT_NAME_MAX_LENGTH = 80;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_LABELS: Record<string, string> = {
  mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves", fri: "Viernes", sat: "Sábado", sun: "Domingo",
};

/**
 * Valida el horario de atención: horas con formato HH:mm, fin posterior al inicio
 * y tramos del mismo día sin superponerse. Devuelve el mensaje de error, o null si está bien.
 * Lo usan la pantalla de Configuración (aviso inmediato) y la API (validación real).
 */
export function validateWorkingHours(workingHours: Partial<Record<string, { start: string; end: string }[]>>): string | null {
  const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  for (const [day, ranges] of Object.entries(workingHours)) {
    if (!ranges) continue;
    const label = DAY_LABELS[day] ?? day;
    const parsed: [number, number][] = [];
    for (const range of ranges) {
      if (!TIME_PATTERN.test(range.start) || !TIME_PATTERN.test(range.end)) return `${label}: hay una hora inválida.`;
      const start = toMinutes(range.start);
      const end = toMinutes(range.end);
      if (end <= start) return `${label}: la hora de fin tiene que ser posterior a la de inicio.`;
      parsed.push([start, end]);
    }
    parsed.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i][0] < parsed[i - 1][1]) return `${label}: hay tramos horarios que se superponen.`;
    }
  }
  return null;
}

/** Comprueba que sea una zona horaria IANA válida (por ejemplo, America/Montevideo). */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("es", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Precio de un servicio: un número con símbolo/código de moneda opcional ("39", "$ 39,50", "39 UYU"). */
export const PRICE_ERROR_MESSAGE = "El precio debe ser un número, por ejemplo 39, $ 39,50 o 39 UYU.";
export const PRICE_PATTERN = /^[^\d]{0,4}\s*\d+([.,]\d{1,2})?\s*[^\d]{0,4}$/;
export const priceSchema = z.string().trim().max(50).regex(PRICE_PATTERN, PRICE_ERROR_MESSAGE);
export const SERVICE_DURATION_ERROR_MESSAGE = "La duración debe estar entre 5 y 480 minutos.";

/** Teléfono opcional: vacío → undefined; si viene, se normaliza o se rechaza. */
export const optionalPhoneSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || !value.trim()) return undefined;
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_ERROR_MESSAGE });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Para usar dentro de un `.superRefine()` de un esquema que tenga
 * `startISO`/`endISO`: valida que ambas sean fechas parseables y que el fin
 * sea estrictamente posterior al inicio. Sin esto, un request directo a la
 * API (sin pasar por la UI, que siempre ofrece slots ya válidos) podía crear
 * un turno con fin anterior o igual al inicio, o con una fecha inválida.
 */
export function checkDateRange(data: { startISO: string; endISO: string }, ctx: z.RefinementCtx) {
  const start = new Date(data.startISO);
  const end = new Date(data.endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha u hora inválida.", path: ["startISO"] });
    return;
  }
  if (end.getTime() <= start.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La hora de fin debe ser posterior a la de inicio.",
      path: ["endISO"],
    });
  }
}
