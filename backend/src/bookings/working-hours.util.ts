const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];
type DayRanges = [string, string][];
export type WorkingHours = Partial<Record<DayKey, DayRanges>>;

interface BusyInterval {
  start: Date;
  end: Date;
}

/**
 * Converts a "wall clock" date+time in a given IANA timezone to the
 * corresponding UTC instant. Looks up the timezone's offset via
 * `Intl.DateTimeFormat.formatToParts` (same primitive LocaleService uses)
 * rather than `new Date(someString)`, whose parse of an ambiguous string
 * falls back to the *host's own* local timezone — that would silently
 * misbehave on any machine not already running in UTC.
 */
function zonedTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(asUtc));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
  );
  const offset = asIfUtc - asUtc; // how far ahead of UTC the timezone's wall clock reads
  return new Date(asUtc - offset);
}

function dayKeyFor(dateStr: string): DayKey {
  const [year, month, day] = dateStr.split('-').map(Number);
  return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/**
 * Generates candidate appointment start times (as UTC Dates) for one calendar
 * day, stepped by the service's own duration within each configured working
 * range, excluding slots that overlap an existing appointment or that have
 * already passed (relative to `now`).
 */
export function computeAvailableSlots(params: {
  workingHours: WorkingHours;
  timezone: string;
  date: string; // YYYY-MM-DD, interpreted in `timezone`
  durationMin: number;
  busyIntervals: BusyInterval[];
  now?: Date;
}): Date[] {
  const { workingHours, timezone, date, durationMin, busyIntervals } = params;
  const now = params.now ?? new Date();
  const ranges = workingHours[dayKeyFor(date)] ?? [];
  const stepMs = durationMin * 60 * 1000;

  const slots: Date[] = [];
  for (const [rangeStart, rangeEnd] of ranges) {
    let cursor = zonedTimeToUtc(date, rangeStart, timezone);
    const rangeEndUtc = zonedTimeToUtc(date, rangeEnd, timezone);

    while (cursor.getTime() + stepMs <= rangeEndUtc.getTime()) {
      const slotEnd = new Date(cursor.getTime() + stepMs);
      const isPast = cursor.getTime() < now.getTime();
      const overlaps = busyIntervals.some(
        (busy) =>
          cursor.getTime() < busy.end.getTime() &&
          slotEnd.getTime() > busy.start.getTime(),
      );
      if (!isPast && !overlaps) {
        slots.push(new Date(cursor));
      }
      cursor = slotEnd;
    }
  }

  return slots;
}
