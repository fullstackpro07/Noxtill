/** All period arithmetic is UTC (spec §16: never trust local clocks for billing). */

export function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export interface Window {
  start: Date;
  end: Date;
}

/**
 * The usage window (credits reset, meters count) containing `now`. Allowances are monthly even
 * on yearly billing, so a yearly period is sliced into monthly windows anchored on its start.
 * A trial is one window: trial start → trial end (its 200 credits are total, not monthly).
 */
export function usageWindow(
  sub: {
    status: string;
    periodStart: Date;
    periodEnd: Date;
    trialEndsAt: Date | null;
  },
  now: Date,
): Window {
  if (sub.status === 'trialing') {
    return { start: sub.periodStart, end: sub.trialEndsAt ?? sub.periodEnd };
  }
  let start = sub.periodStart;
  let end = addMonthsUtc(start, 1);
  // Walk forward (bounded) to the window that contains now; also handles a stale period.
  for (let i = 0; i < 240 && end <= now; i++) {
    start = end;
    end = addMonthsUtc(start, 1);
  }
  return { start, end };
}

export function formatDateUtc(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
