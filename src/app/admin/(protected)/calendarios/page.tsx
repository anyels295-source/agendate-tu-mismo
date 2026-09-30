import { prisma } from "@/lib/prisma";
import { getOrCreateActiveProfessional } from "@/lib/professional";
import CalendarManager from "@/components/admin/CalendarManager";

export const dynamic = "force-dynamic";

export default async function CalendariosPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const professional = await getOrCreateActiveProfessional();
  const connections = await prisma.calendarConnection.findMany({ where: { professionalId: professional.id } });

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <h1 className="m-0 mb-1.5 text-[26px] font-extrabold tracking-tight text-[var(--ink)]">Calendarios conectados</h1>
      <p className="mb-6 max-w-[600px] text-[14px] leading-relaxed text-[var(--muted-nav)]">
        Conectá los calendarios que quieras que se tengan en cuenta para calcular tu disponibilidad real. Elegí
        además en cuál se crean los turnos confirmados.
      </p>

      <CalendarManager
        professionalId={professional.id}
        connections={connections.map((c) => ({ id: c.id, provider: c.provider, accountEmail: c.accountEmail }))}
        bookingCalendarId={professional.bookingCalendarId}
        initialConnected={connected}
        initialError={error}
      />
    </div>
  );
}
