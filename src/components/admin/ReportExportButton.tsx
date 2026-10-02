"use client";

export type ReportRow = {
  dateLabel: string;
  timeLabel: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  statusLabel: string;
};

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

/**
 * Exporta el reporte completo del período elegido (sin el tope de 200 filas
 * que tiene el "Exportar" de Reservas) — ver agendate_ideas_originales_gap_analysis,
 * gap #5.
 */
export default function ReportExportButton({ rows, rangeLabel }: { rows: ReportRow[]; rangeLabel: string }) {
  function exportCsv() {
    const header = ["Fecha", "Hora", "Cliente", "Teléfono", "Servicio", "Estado"].map(csvField).join(",");
    const body = rows
      .map((r) =>
        [r.dateLabel, r.timeLabel, csvText(r.clientName), r.clientPhone ?? "", csvText(r.serviceName), r.statusLabel].map(csvField).join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF", `${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeRange = rangeLabel.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").replace(/[^\w-]+/g, "-");
    a.download = `reporte-agendate-${safeRange}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={exportCsv}
      disabled={rows.length === 0}
      title={rows.length === 0 ? "No hay turnos en este período para exportar." : "Exportar este reporte a CSV"}
      className="rounded-[10px] border border-[var(--line-btn)] bg-[var(--surface)] px-[15px] py-[9px] text-[13px] font-semibold text-[var(--ink2)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      Exportar CSV
    </button>
  );
}
