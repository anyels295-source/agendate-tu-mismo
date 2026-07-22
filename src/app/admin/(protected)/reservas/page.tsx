import { prisma } from "@/lib/prisma";
import { getOrCreateActiveProfessional } from "@/lib/professional";
import { DateTime } from "luxon";

export const dynamic = "force-dynamic";


const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Completada",
  NO_SHOW: "Ausente",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  COMPLETED: "bg-blue-100 text-blue-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

export default async function ReservasPage() {
  const professional = await getOrCreateActiveProfessional();

  const bookings = await prisma.booking.findMany({
    where: { professionalId: professional.id },
    orderBy: { startTime: "desc" },
    take: 100,
  });

  const now = DateTime.now();
  const startOfWeek = now.startOf("week");
  const startOfMonth = now.startOf("month");

  const confirmedOrCompleted = bookings.filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED");
  const thisWeek = confirmedOrCompleted.filter((b) => DateTime.fromJSDate(b.startTime) >= startOfWeek);
  const thisMonth = confirmedOrCompleted.filter((b) => DateTime.fromJSDate(b.startTime) >= startOfMonth);
  const cancelledThisMonth = bookings.filter(
    (b) => b.status === "CANCELLED" && DateTime.fromJSDate(b.createdAt) >= startOfMonth
  );

  const bookingUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reservar/${professional.slug}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-800">Reservas</h1>
        <a
          href={bookingUrl}
          target="_blank"
          className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          Copiar/abrir mi página de reserva: {bookingUrl}
        </a>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-2xl font-bold text-brand-700">{thisWeek.length}</p>
          <p className="text-sm text-gray-500">turnos esta semana</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-2xl font-bold text-brand-700">{thisMonth.length}</p>
          <p className="text-sm text-gray-500">turnos este mes</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-2xl font-bold text-gray-700">{cancelledThisMonth.length}</p>
          <p className="text-sm text-gray-500">cancelaciones este mes</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Todavía no hay reservas. Compartí tu link de reserva para empezar.
                </td>
              </tr>
            )}
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  {DateTime.fromJSDate(b.startTime).setZone(professional.timezone).setLocale("es").toFormat("d LLL yyyy HH:mm")}
                </td>
                <td className="px-4 py-2">{b.clientName}</td>
                <td className="px-4 py-2">{b.clientPhone}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status]}`}>
                    {STATUS_LABEL[b.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
