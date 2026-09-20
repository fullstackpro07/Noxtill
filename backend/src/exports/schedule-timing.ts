/**
 * When a scheduled report/export actually runs. The daily job (`scheduled-exports.scheduler.ts`)
 * fires at 06:00 server time, so 06:00 is the real delivery time of every schedule — it is shown as
 * such, not as a per-schedule choice that does not exist.
 */
export const SCHEDULE_RUN_HOUR = 6;

export interface ScheduleTimingInput {
  frequency: 'weekly' | 'monthly';
  active: boolean;
  /** 0 (Sunday) – 6 (Saturday), weekly schedules. */
  dayOfWeek: number | null;
  /** 1 – 28, monthly schedules. */
  dayOfMonth: number | null;
  lastRunAt: Date | null;
  createdAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LEGACY_DUE_DAYS = { weekly: 7, monthly: 28 } as const;

function atRunHour(d: Date): Date {
  const x = new Date(d);
  x.setHours(SCHEDULE_RUN_HOUR, 0, 0, 0);
  return x;
}

/** The most recent moment (<= now) this schedule was supposed to fire, for day-anchored schedules. */
function latestOccurrence(s: ScheduleTimingInput, now: Date): Date | null {
  if (s.frequency === 'weekly' && s.dayOfWeek !== null) {
    const d = atRunHour(now);
    const back = (d.getDay() - s.dayOfWeek + 7) % 7;
    d.setDate(d.getDate() - back);
    if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
    return d;
  }
  if (s.frequency === 'monthly' && s.dayOfMonth !== null) {
    const d = atRunHour(now);
    d.setDate(s.dayOfMonth);
    if (d.getTime() > now.getTime()) {
      d.setMonth(d.getMonth() - 1);
      d.setDate(s.dayOfMonth);
    }
    return d;
  }
  return null;
}

/** Whether the daily job should run this schedule now. A missed day is caught up, not skipped. */
export function isScheduleDue(s: ScheduleTimingInput, now: Date): boolean {
  if (!s.active) return false;
  const occurrence = latestOccurrence(s, now);
  if (occurrence) {
    if (occurrence.getTime() < s.createdAt.getTime()) return false;
    return !s.lastRunAt || s.lastRunAt.getTime() < occurrence.getTime();
  }
  const daysSince = s.lastRunAt
    ? (now.getTime() - s.lastRunAt.getTime()) / DAY_MS
    : Infinity;
  return daysSince >= LEGACY_DUE_DAYS[s.frequency];
}

/** The next moment this schedule will run, or null when it is paused. */
export function computeNextRun(
  s: ScheduleTimingInput,
  now: Date = new Date(),
): Date | null {
  if (!s.active) return null;

  if (s.frequency === 'weekly' && s.dayOfWeek !== null) {
    const d = atRunHour(now);
    d.setDate(d.getDate() + ((s.dayOfWeek - d.getDay() + 7) % 7));
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
    return d;
  }
  if (s.frequency === 'monthly' && s.dayOfMonth !== null) {
    const d = atRunHour(now);
    d.setDate(s.dayOfMonth);
    if (d.getTime() <= now.getTime()) {
      d.setMonth(d.getMonth() + 1);
      d.setDate(s.dayOfMonth);
    }
    return d;
  }

  const base = s.lastRunAt ?? s.createdAt;
  const due = new Date(base.getTime() + LEGACY_DUE_DAYS[s.frequency] * DAY_MS);
  const from = due.getTime() > now.getTime() ? due : now;
  const next = atRunHour(from);
  if (next.getTime() < from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}
