export type BusyBlock = {
  start: string; // ISO 8601
  end: string; // ISO 8601
};

export type WorkingHoursDay = { start: string; end: string }[]; // ej. [{start:"09:00", end:"13:00"}]

export type WorkingHours = {
  mon: WorkingHoursDay;
  tue: WorkingHoursDay;
  wed: WorkingHoursDay;
  thu: WorkingHoursDay;
  fri: WorkingHoursDay;
  sat: WorkingHoursDay;
  sun: WorkingHoursDay;
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }],
  tue: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }],
  wed: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }],
  thu: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }],
  fri: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }],
  sat: [],
  sun: [],
};

export type CalendarConnectorTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

/** Contrato común que deben cumplir los conectores de Google y Outlook. */
export interface CalendarConnector {
  getFreeBusy(params: {
    accessToken: string;
    calendarId: string;
    timeMinISO: string;
    timeMaxISO: string;
  }): Promise<BusyBlock[]>;

  createEvent(params: {
    accessToken: string;
    calendarId: string;
    summary: string;
    description?: string;
    startISO: string;
    endISO: string;
    timezone: string;
    attendeeEmail?: string;
  }): Promise<{ eventId: string }>;

  deleteEvent(params: {
    accessToken: string;
    calendarId: string;
    eventId: string;
  }): Promise<void>;

  refreshAccessToken(refreshToken: string): Promise<CalendarConnectorTokens>;
}

export const WEEKDAY_KEYS: (keyof WorkingHours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function workingMinutesForWeek(workingHours: WorkingHours): number {
  return WEEKDAY_KEYS.reduce((total, key) => {
    const ranges = workingHours[key] ?? [];
    const dayMinutes = ranges.reduce((sum, r) => {
      const [sh, sm] = r.start.split(":").map(Number);
      const [eh, em] = r.end.split(":").map(Number);
      return sum + (eh * 60 + em - (sh * 60 + sm));
    }, 0);
    return total + dayMinutes;
  }, 0);
}
