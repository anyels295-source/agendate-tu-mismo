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

  const googleConn = connections.find((c) => c.provider === "GOOGLE");
  const outlookConn = connections.find((c) => c.provider === "OUTLOOK");

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <h1 className="m-0 mb-1.5 text-[26px] font-extrabold tracking-tight text-[#16233d]">Calendarios conectados</h1>
      <p className="mb-6 max-w-[600px] text-[14px] leading-relaxed text-[#6b7890]">
        Conectá los calendarios que quieras que se tengan en cuenta para calcular tu disponibilidad real. Elegí
        además en cuál se crean los turnos confirmados.
      </p>

      {connected && (
        <p className="mb-4 rounded-[11px] bg-[#e4f6ec] px-3.5 py-2.5 text-[13.5px] text-[#1a7d45]">
          {PROVIDER_LABEL[connected.toUpperCase()] ?? connected} conectado correctamente.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-[11px] bg-[#fbe7e7] px-3.5 py-2.5 text-[13.5px] text-[#b6382f]">
          No se pudo conectar el calendario ({error}). Revisá las credenciales en .env y reintentá.
        </p>
      )}

      <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <ProviderCard
          letter="G"
          name="Google Calendar"
          connected={!!googleConn}
          connectedLabel={googleConn?.accountEmail}
          connectUrl={`/api/auth/google?professionalId=${professional.id}`}
        />
        <ProviderCard
          letter="O"
          name="Outlook / Microsoft 365"
          connected={!!outlookConn}
          connectedLabel={outlookConn?.accountEmail}
          connectUrl={`/api/auth/outlook?professionalId=${professional.id}`}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e7ecf4] bg-white">
        <div className="grid grid-cols-3 bg-[#f7f9fc] p-[13px_20px] text-[11.5px] font-bold uppercase tracking-wide text-[#6b7280]">
          <span>Proveedor</span>
          <span>Cuenta</span>
          <span>Calendario de reservas</span>
        </div>
        {connections.length === 0 && (
          <div className="px-5 py-11 text-center text-[14px] text-[#6b7280]">
            Todavía no conectaste ningún calendario. Sin al menos uno, tu página de reserva no puede calcular
            disponibilidad.
          </div>
        )}
        {connections.map((c) => (
          <div key={c.id} className="grid grid-cols-3 items-center border-t border-[#f4f6fa] p-[15px_20px] text-[13.5px]">
            <div className="font-semibold text-[#2a3856]">{PROVIDER_LABEL[c.provider]}</div>
            <div className="text-[#5a6884]">{c.accountEmail}</div>
            <div>
              <SetBookingCalendarSelect connectionId={c.id} checked={professional.bookingCalendarId === c.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  letter,
  name,
  connected,
  connectedLabel,
  connectUrl,
}: {
  letter: string;
  name: string;
  connected: boolean;
  connectedLabel?: string;
  connectUrl: string;
}) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-2xl p-5"
      style={{
        background: "#fff",
        border: connected ? "1px solid #e7ecf4" : "1px dashed #cdd7e6",
      }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] font-extrabold"
        style={{ background: connected ? "#eef4fb" : "#f2f5fa", color: connected ? "#2e74b5" : "#6b7280" }}
      >
        {letter}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold text-[#22314f]">{name}</div>
        {connected ? (
          <div className="flex items-center gap-[5px] text-[12.5px] font-semibold text-[#3aa55f]">
            <span className="h-[7px] w-[7px] rounded-full bg-[#3aa55f]" />
            {connectedLabel ?? "Conectado"}
          </div>
        ) : (
          <div className="text-[12.5px] text-[#6b7280]">Sin conectar</div>
        )}
      </div>
      {!connected && (
        <a href={connectUrl} className="shrink-0 rounded-[9px] border border-[#215a8f] px-[13px] py-[7px] text-[12.5px] font-semibold text-[#215a8f]">
          Conectar
        </a>
      )}
    </div>
  );
}
