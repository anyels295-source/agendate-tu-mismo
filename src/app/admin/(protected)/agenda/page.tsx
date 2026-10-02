import Link from "next/link";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/professional";
import type { WorkingHours } from "@/lib/types";
import AgendaWeekGrid, { type AgendaEvent } from "@/components/admin/AgendaWeekGrid";
import AgendaDateJump from "@/components/admin/AgendaDateJump";
import NewBookingButton from "@/components/admin/NewBookingButton";
import { IconChevronLeft, IconChevronRight } from "@/components/admin/icons";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAY_KEYS: (keyof WorkingHours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  NO_SHOW: "Ausente",
  CANCELLED: "Cancelada",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string; date?: string }>;
}) {
  const { offset: offsetParam, date: dateParam } = await searchParams;

  const professional = await getActiveProfessional();
  const tz = professional.timezone;
  const now = DateTime.now().setZone(tz);
  const currentWeekStart = now.startOf("week");

  // Se puede navegar tanto con las flechas prev/next (?offset=) como
  // saltando directamente a una fecha con el selector de calendario
  // (?date=YYYY-MM-DD). Cualquiera de las dos formas termina resolviéndose
  // a un único "offset" en semanas, así los links de flechas/"Hoy" siguen
  // funcionando sin importar cómo se llegó a la vista actual.
  let startOfWeek = currentWeekStart;
  if (dateParam) {
    const parsed = DateTime.fromISO(dateParam, { zone: tz });
    if (parsed.isValid) startOfWeek = parsed.startOf("week");
  } else {
    const offsetNum = Number(offsetParam ?? "0") || 0;
    startOfWeek = currentWeekStart.plus({ weeks: offsetNum });
  }
  const offset = Math.round(startOfWeek.diff(currentWeekStart, "weeks").weeks);
  const endOfWeek = startOfWeek.plus({ days: 7 });

  const bookings = await prisma.booking.findMany({
    where: {
      professionalId: professional.id,
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"] },
      startTime: { gte: startOfWeek.toJSDate(), lt: endOfWeek.toJSDate() },
    },
    include: { service: true },
    orderBy: { startTime: "asc" },
  });

  const workingHours = professional.workingHours as unknown as WorkingHours;
  let gridStartHour = 8;
  let gridEndHour = 20;
  for (const key of WEEKDAY_KEYS) {
    for (const range of workingHours[key] ?? []) {
      const [sh] = range.start.split(":").map(Number);
      const [eh, em] = range.end.split(":").map(Number);
      gridStartHour = Math.min(gridStartHour, sh);
      gridEndHour = Math.max(gridEndHour, em > 0 ? eh + 1 : eh);
    }
  }
  const ROW = 56;

  const days = Array.from({ length: 7 }).map((_, i) => {
    const day = startOfWeek.plus({ days: i });
    const dayBookings = bookings.filter((b) => DateTime.fromJSDate(b.startTime).setZone(tz).hasSame(day, "day"));

    const events: AgendaEvent[] = dayBookings.map((b) => {
      const start = DateTime.fromJSDate(b.startTime).setZone(tz);
      const end = DateTime.fromJSDate(b.endTime).setZone(tz);
      const startMinutesFromGrid = (start.hour - gridStartHour) * 60 + start.minute;
      const durationMinutes = end.diff(start, "minutes").minutes;
      return {
        id: b.id,
        clientName: b.clientName,
        phone: b.clientPhone,
        email: b.clientEmail,
        startISO: b.startTime.toISOString(),
        notes: b.notes,
        serviceName: b.service?.name ?? professional.serviceName,
        status: b.status,
        statusLabel: STATUS_LABEL[b.status] ?? b.status,
        timeLabel: start.toFormat("HH:mm"),
        endTimeLabel: end.toFormat("HH:mm"),
        dateLabel: start.setLocale("es").toFormat("cccc d 'de' LLLL"),
        top: Math.max(startMinutesFromGrid, 0) * (ROW / 60),
        height: Math.max((durationMinutes * ROW) / 60 - 4, 24),
      };
    });

    return {
      label: DAY_LABELS[i],
      dateNum: day.day,
      dateISO: day.toISODate()!,
      isToday: day.hasSame(now, "day"),
      events,
    };
  });

  const timeLabels = Array.from({ length: gridEndHour - gridStartHour + 1 }).map((_, i) =>
    `${String(gridStartHour + i).padStart(2, "0")}:00`
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-[18px] pb-11 md:px-9 md:py-[30px]">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight text-[var(--ink)]">Agenda</h1>
          <div className="mt-[3px] text-[13.5px] font-semibold text-[var(--muted-nav)]">
            {startOfWeek.setLocale("es").toFormat("d LLL")} – {endOfWeek.minus({ days: 1 }).setLocale("es").toFormat("d LLL yyyy")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NewBookingButton professionalSlug={professional.slug} />
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/agenda?offset=${offset - 1}`}
              aria-label="Semana anterior"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--line-btn)] bg-[var(--surface)] text-[var(--ink4)]"
            >
              <IconChevronLeft />
            </Link>
            <Link
              href="/admin/agenda"
              className="rounded-[10px] border border-[var(--line-btn)] bg-[var(--surface)] px-[15px] py-2 text-[13px] font-semibold text-[var(--ink2)]"
            >
              Hoy
            </Link>
            <Link
              href={`/admin/agenda?offset=${offset + 1}`}
              aria-label="Semana siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--line-btn)] bg-[var(--surface)] text-[var(--ink4)]"
            >
              <IconChevronRight />
            </Link>
            <AgendaDateJump currentDate={startOfWeek.toISODate()!} />
          </div>
        </div>
      </div>

      <AgendaWeekGrid days={days} timeLabels={timeLabels} rowHeight={ROW} professionalSlug={professional.slug} />
    </div>
  );
}

export const metadata = { title: "Agenda" };
