export type BookingStatusValue = "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

/** Texto del aviso que se muestra después de cambiar el estado de un turno desde el panel. */
export function statusToast(status: BookingStatusValue, previous?: string): string {
  switch (status) {
    case "COMPLETED":
      return "Turno marcado como completado.";
    case "NO_SHOW":
      return "Turno marcado como ausente.";
    case "CONFIRMED":
      return previous === "PENDING" ? "Turno confirmado. Se avisó al cliente." : "Turno vuelto a Confirmada.";
    case "PENDING":
      return "Turno vuelto a Pendiente.";
    case "CANCELLED":
      return "Turno cancelado.";
  }
}
