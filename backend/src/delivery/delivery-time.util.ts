/**
 * The instant a calendar day begins in a business's own timezone. "Today" on every delivery
 * screen means the business's today, not the server's, so a shop in Lahore sees its own day.
 */
export function startOfDayInZone(
  timeZone: string,
  now: Date = new Date(),
): Date {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const utcMidnight = new Date(`${local}T00:00:00Z`);
  const asLocal = new Date(utcMidnight.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(
    utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }),
  );
  return new Date(
    utcMidnight.getTime() - (asLocal.getTime() - asUtc.getTime()),
  );
}
