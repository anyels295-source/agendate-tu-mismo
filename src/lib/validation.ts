import { z } from "zod";

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
