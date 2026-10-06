/**
 * Business-timezone helpers. Field Service plans days and hours on the business's wall clock
 * (a 09:30 visit is 09:30 where the business is), so every conversion goes through the timezone.
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      });
    } catch {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      });
    }
    fmtCache.set(tz, f);
  }
  return f;
}

export interface WallParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  /** 0 = Monday … 6 = Sunday */
  wd: number;
}

const WD: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export function wall(d: Date, tz: string): WallParts {
  const p = Object.fromEntries(
    fmt(tz)
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    s: Number(p.second),
    wd: WD[p.weekday] ?? 0,
  };
}

/** 'YYYY-MM-DD' of the business day d falls on. */
export function dayKey(d: Date, tz: string): string {
  const w = wall(d, tz);
  return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** Decimal hour of the day on the business clock (09:30 → 9.5). */
export function hourOf(d: Date, tz: string): number {
  const w = wall(d, tz);
  return w.h + w.mi / 60 + w.s / 3600;
}

/** Whole business days from today to d (0 = today, 1 = tomorrow, -1 = yesterday). */
export function dayOffset(d: Date, tz: string, now = new Date()): number {
  return Math.round(
    (Date.parse(dayKey(d, tz)) - Date.parse(dayKey(now, tz))) / 86400000,
  );
}

/** The 'YYYY-MM-DD' that is `offset` business days from today. */
export function keyPlus(offset: number, tz: string, now = new Date()): string {
  const base = Date.parse(dayKey(now, tz)) + offset * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

/** The instant at which the business clock reads `hour` on business day `key`. */
export function zoned(key: string, hour: number, tz: string): Date {
  const [y, mo, d] = key.split('-').map(Number);
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const w = wall(new Date(t), tz);
    const shown = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
    const diff = shown - guess;
    if (!diff) break;
    t -= diff;
  }
  return new Date(t);
}

/** `HH:MM` for a decimal hour. */
export function hh(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes → "2h 10m left" / "35m over" (fs-core.js mins). */
export function mins(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  const a = Math.abs(Math.round(m));
  const t =
    a >= 1440
      ? `${Math.floor(a / 1440)}d ${Math.floor((a % 1440) / 60)}h`
      : a >= 60
        ? `${Math.floor(a / 60)}h ${a % 60}m`
        : `${a}m`;
  return m < 0 ? `${t} over` : `${t} left`;
}

export function agoM(m: number): string {
  if (m < 60) return `${Math.max(0, Math.round(m))}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/** "Today" / "Tomorrow" / "Yesterday" / "Thu 02 Oct" for a business-day offset. */
export function dday(
  offset: number | null | undefined,
  tz: string,
  now = new Date(),
): string {
  if (offset == null) return '—';
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  const k = keyPlus(offset, tz, now);
  return new Date(`${k}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Is the business clock inside a "21:00–08:00" style window right now? */
export function inWindow(spec: string, d: Date, tz: string): boolean {
  const m = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(spec || '');
  if (!m) return false;
  const a = Number(m[1]) + Number(m[2]) / 60;
  const b = Number(m[3]) + Number(m[4]) / 60;
  const h = hourOf(d, tz);
  return a <= b ? h >= a && h < b : h >= a || h < b;
}
