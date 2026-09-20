/** Minutes since local midnight for `d` in `timezone`. */
export function localMinutes(d: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Whether `when` falls inside the quiet window, which may run past midnight (e.g. 21:00 to 08:00). */
export function inQuietHours(when: Date, from: string, to: string, timezone: string): boolean {
  const now = localMinutes(when, timezone);
  const start = toMinutes(from);
  const end = toMinutes(to);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** The moment a marketing message may actually go: `when` itself, or the end of the quiet window. */
export function deferOutOfQuietHours(when: Date, from: string, to: string, timezone: string): Date {
  if (!inQuietHours(when, from, to, timezone)) return when;
  const now = localMinutes(when, timezone);
  const minutesUntilEnd = (toMinutes(to) - now + 1440) % 1440 || 1440;
  const truncated = new Date(when.getTime() - (when.getUTCSeconds() * 1000 + when.getUTCMilliseconds()));
  return new Date(truncated.getTime() + minutesUntilEnd * 60 * 1000);
}
