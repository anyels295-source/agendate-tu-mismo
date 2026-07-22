import { prisma } from "@/lib/prisma";
import { getOrCreateActiveProfessional } from "@/lib/professional";
import SetBookingCalendarSelect from "@/components/SetBookingCalendarSelect";

export const dynamic = "force-dynamic";


const PROVIDER_LABEL: Record<string, string> = { GOOGLE: "Google Calendar", OUTLOOK: "Outlook / Microsoft 365" };

export default async function CalendariosPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const professional = await getOrCreateActiveProfessional();
  const connections = await prisma.calendarConnection.findMany({ where: { professionalId: professional.id } });

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-gray-800">Calendarios conectados</h1>
      <p className="mb-6 text-sm text-gray-500">
        Conectá los calendarios que quieras que se tengan en cuenta para calcular tu disponibilidad real.
        Elegí además en cuál se crean los turnos confirmados.
      </p>

      {connected && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {PROVIDER_LABEL[connected.toUpperCase()] ?? connected} conectado correctamente.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo conectar el calendario ({error}). Revisá las credenciales en .env y reintentá.
        </p>
      )}

      <div className="mb-6 flex gap-3">
        <a
          href={`/api/auth/google?professionalId=${professional.id}`}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
        >
          + Conectar Google Calendar
        </a>
        <a
          href={`/api/auth/outlook?professionalId=${professional.id}`}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
        >
          + Conectar Outlook
        </a>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2">Proveedor</th>
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-4 py-2">Calendario de reservas</th>
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Todavía no conectaste ningún calendario. Sin al menos uno, tu página de reserva no puede
                  calcular disponibilidad.
                </td>
              </tr>
            )}
            {connections.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{PROVIDER_LABEL[c.provider]}</td>
                <td className="px-4 py-2">{c.accountEmail}</td>
                <td className="px-4 py-2">
                  <SetBookingCalendarSelect
                    connectionId={c.id}
                    checked={professional.bookingCalendarId === c.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
