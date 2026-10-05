import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/professional";
import { DateTime } from "luxon";
import BookingsTable, { type BookingRow } from "@/components/admin/BookingsTable";
import NewBookingButton from "@/components/admin/NewBookingButton";
import ShareWhatsAppButton from "@/components/admin/ShareWhatsAppButton";

export const dynamic = "force-dynamic";

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { filter, q } = await searchParams;
  const professional = await getActiveProfessional();

  const bookings = await prisma.booking.findMany({
    where: { professionalId: professional.id },
    include: { service: true },
    orderBy: { startTime: "desc" },
    take: 200,
  });

  const rows: BookingRow[] = bookings.map((b) => {
    const dt = DateTime.fromJSDate(b.startTime).setZone(professional.timezone).setLocale("es");
    return {
      id: b.id,
      clientName: b.clientName,
      clientPhone: b.clientPhone,
      clientEmail: b.clientEmail,
      notes: b.notes,
      startISO: b.startTime.toISOString(),
      serviceName: b.service?.name ?? professional.serviceName,
      dateLabel: dt.toFormat("d LLL yyyy"),
      timeLabel: dt.toFormat("HH:mm"),
      status: b.status,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[var(--ink)]">Reservas</h1>
        <div className="flex flex-wrap gap-2.5">
          <ShareWhatsAppButton
            url={`${process.env.APP_URL ?? "http://localhost:3000"}/reservar/${professional.slug}`}
            professionalName={professional.name}
            className="flex items-center gap-1.5 rounded-[10px] bg-[#25d366] px-[15px] py-[9px] text-[13px] font-semibold text-white"
          />
          <NewBookingButton professionalSlug={professional.slug} />
        </div>
      </div>

      <BookingsTable rows={rows} professionalSlug={professional.slug} initialFilter={filter} initialQuery={q} limited={bookings.length >= 200} />
    </div>
  );
}

export const metadata = { title: "Reservas" };
