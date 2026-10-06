export type BookingStatusValue = "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

/** Texto del aviso que se muestra después de cambiar el estado de un turno desde el panel. */
export function statusToast(status: BookingStatusValue, previous?: string, emailSent?: boolean): string {
  switch (status) {
    case "COMPLETED":
      return "Turno marcado como completado.";
    case "NO_SHOW":
      return "Turno marcado como ausente.";
    case "CONFIRMED":
      if (previous !== "PENDING") return "Turno vuelto a Confirmada.";
      if (emailSent === false) return "Turno confirmado. No se pudo avisar al cliente por email.";
      return emailSent ? "Turno confirmado. Se avisó al cliente por email." : "Turno confirmado.";
    case "PENDING":
      return "Turno vuelto a Pendiente.";
    case "CANCELLED":
      return "Turno cancelado.";
  }
}
