const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type WeeklyHours = Partial<Record<DayKey, [string, string][]>>;

const MAX_DAYS = 120;

/** Normalises a stored `workingHours` JSON value; anything malformed is dropped rather than guessed. */
export function parseWeeklyHours(value: unknown): WeeklyHours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: WeeklyHours = {};
  for (const day of DAY_KEYS) {
    const ranges = (value as Record<string, unknown>)[day];
    if (!Array.isArray(ranges)) continue;
    const valid = ranges.filter(
      (r): r is [string, string] =>
        Array.isArray(r) &&
        r.length === 2 &&
        /^\d{2}:\d{2}$/.test(String(r[0])) &&
        /^\d{2}:\d{2}$/.test(String(r[1])) &&
        String(r[0]) < String(r[1]),
    );
    if (valid.length) out[day] = valid.map(([a, b]) => [a, b]);
  }
  return out;
}

export function hasHours(hours: WeeklyHours): boolean {
  return Object.values(hours).some((r) => r && r.length > 0);
}

interface LocalParts {
  y: number;
  m: number;
  d: number;
  minutes: number;
  day: DayKey;
}

function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return {
    y,
    m,
    d,
    minutes: get('hour') * 60 + get('minute'),
    day: DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
  };
}

/** Offset (ms) the timezone's wall clock reads ahead of UTC at `date`. */
function offsetMs(date: Date, timezone: string): number {
  const p = localParts(date, timezone);
  const asIfUtc = Date.UTC(
    p.y,
    p.m - 1,
    p.d,
    Math.floor(p.minutes / 60),
    p.minutes % 60,
  );
  const truncated = Math.floor(date.getTime() / 60000) * 60000;
  return asIfUtc - truncated;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** True when `date` falls inside the weekly hours. No hours configured = always open (nothing is "out of hours"). */
export function isWithinHours(
  date: Date,
  hours: WeeklyHours,
  timezone: string,
): boolean {
  if (!hasHours(hours)) return true;
  const p = localParts(date, timezone);
  return (hours[p.day] ?? []).some(
    ([a, b]) => p.minutes >= toMinutes(a) && p.minutes < toMinutes(b),
  );
}

/**
 * Minutes between two instants counted on the working-hours clock — the clock stops outside the
 * configured hours. With no hours configured it is plain elapsed time. Looks back at most
 * `MAX_DAYS` local days, which is far past any reply target this is compared against.
 */
export function workingMinutesBetween(
  start: Date,
  end: Date,
  hours: WeeklyHours,
  timezone: string,
): number {
  if (end <= start) return 0;
  if (!hasHours(hours))
    return Math.round((end.getTime() - start.getTime()) / 60000);

  const startMs = Math.max(
    start.getTime(),
    end.getTime() - MAX_DAYS * 86400000,
  );
  const endMs = end.getTime();
  const first = localParts(new Date(startMs), timezone);
  let total = 0;
  for (let i = 0; i <= MAX_DAYS; i++) {
    const dayUtc = Date.UTC(first.y, first.m - 1, first.d + i);
    const dayDate = new Date(dayUtc);
    const dayKey = DAY_KEYS[dayDate.getUTCDay()];
    const offset = offsetMs(new Date(dayUtc + 12 * 3600000), timezone);
    if (dayUtc - offset > endMs) break;
    for (const [a, b] of hours[dayKey] ?? []) {
      const from = dayUtc + toMinutes(a) * 60000 - offset;
      const to = dayUtc + toMinutes(b) * 60000 - offset;
      const lo = Math.max(from, startMs);
      const hi = Math.min(to, endMs);
      if (hi > lo) total += hi - lo;
    }
  }
  return Math.round(total / 60000);
}

/** e.g. "Mon–Fri" grouping for the Settings screen: rows of days that share the exact same ranges. */
export function describeWeeklyHours(
  hours: WeeklyHours,
): { days: string; ranges: string | null }[] {
  const order: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const label: Record<DayKey, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
  };
  const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  const rows: { days: DayKey[]; key: string }[] = [];
  for (const day of order) {
    const key = JSON.stringify(hours[day] ?? []);
    const last = rows[rows.length - 1];
    if (last && last.key === key) last.days.push(day);
    else rows.push({ days: [day], key });
  }
  return rows.map((r) => {
    const ranges = hours[r.days[0]] ?? [];
    const days =
      r.days.length === 1
        ? label[r.days[0]]
        : `${label[r.days[0]]} to ${label[r.days[r.days.length - 1]]}`;
    return {
      days,
      ranges: ranges.length
        ? ranges.map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(', ')
        : null,
    };
  });
}
