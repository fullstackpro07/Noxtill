import { CLOSED_STATUSES } from './helpdesk.constants';

/** Working calendar for "Standard hours" policies. `null` everywhere below means 24/7 wall clock. */
export interface Calendar {
  tz: string;
  /** Working weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  openMin: number;
  closeMin: number;
  holidays: Set<string>;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_DAYS = 400;

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
}

export function parseHolidays(text: string): string[] {
  return [
    ...new Set(
      (text || '')
        .split(/[\s,;]+/)
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
    ),
  ].sort();
}

/** Builds the calendar from Settings › Business Hours; null when it can't define any working time. */
export function calendarOf(hours: {
  tz: string;
  days: string[];
  open: string;
  close: string;
  holidays: string;
}): Calendar | null {
  const openMin = toMin(hours.open);
  const closeMin = toMin(hours.close);
  const days = (hours.days || [])
    .map((d) => DAY_LABELS.indexOf(d))
    .filter((d) => d >= 0);
  if (
    openMin == null ||
    closeMin == null ||
    closeMin <= openMin ||
    !days.length
  )
    return null;
  let tz = hours.tz || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  return {
    tz,
    days,
    openMin,
    closeMin,
    holidays: new Set(parseHolidays(hours.holidays)),
  };
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Local wall-clock parts of an instant in `tz`. */
export function localParts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of dtf(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    hh: +p.hour % 24,
    mm: +p.minute,
    ss: +p.second,
  };
}

function offsetMs(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return (
    Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000
  );
}

/** Working windows [fromMs, toMs] of each local day, starting at the local day containing `fromMs`. */
function* windows(
  cal: Calendar,
  fromMs: number,
  forward = true,
): Generator<[number, number]> {
  const p = localParts(fromMs, cal.tz);
  for (let i = 0; i <= MAX_DAYS; i++) {
    const dayUtc = Date.UTC(p.y, p.m - 1, p.d + (forward ? i : -i));
    const date = new Date(dayUtc);
    const iso = date.toISOString().slice(0, 10);
    if (!cal.days.includes(date.getUTCDay()) || cal.holidays.has(iso)) continue;
    const off = offsetMs(dayUtc + 12 * 3600000, cal.tz);
    yield [
      dayUtc + cal.openMin * 60000 - off,
      dayUtc + cal.closeMin * 60000 - off,
    ];
  }
}

/** Minutes between two instants, counted on the calendar (wall clock when `cal` is null). */
export function workMinutes(
  start: Date | number,
  end: Date | number,
  cal: Calendar | null,
): number {
  const a = +start;
  const b = +end;
  if (b <= a) return 0;
  if (!cal) return (b - a) / 60000;
  let total = 0;
  for (const [from, to] of windows(cal, a)) {
    if (from > b) break;
    const lo = Math.max(from, a);
    const hi = Math.min(to, b);
    if (hi > lo) total += hi - lo;
  }
  return total / 60000;
}

/** The instant `minutes` of calendar time after `start`. */
export function addWorkMinutes(
  start: Date | number,
  minutes: number,
  cal: Calendar | null,
): Date {
  const a = +start;
  if (!cal) return new Date(a + minutes * 60000);
  let left = minutes * 60000;
  let last = a;
  for (const [from, to] of windows(cal, a)) {
    const lo = Math.max(from, a);
    if (to <= lo) continue;
    if (to - lo >= left) return new Date(lo + left);
    left -= to - lo;
    last = to;
  }
  return new Date(last + left);
}

export interface SlaPolicyLite {
  id: string;
  name: string;
  applies: string;
  scope: string;
  priority: string;
  fr: number;
  res: number;
  hours: string;
  pause: string[];
  warn: number;
  active: boolean;
  order: number;
}

export interface SlaTicketInput {
  status: string;
  priority: string;
  category: string;
  queueName: string | null;
  branchName: string | null;
  /** Names of CRM segments (and tags) the customer belongs to, lower-cased. */
  segments: string[];
  createdAt: Date;
  firstResponseAt: Date | null;
  slaMissed: boolean;
  /** Closed pause intervals [fromIso, toIso, status]. */
  pauses: Array<[string, string, string]>;
  pausedSince: Date | null;
}

export type SlaKey =
  'Breached' | 'At Risk' | 'Healthy' | 'Paused' | 'Met' | 'Missed' | 'None';
export const SLA_COLORS: Record<SlaKey, [string, string, string]> = {
  Breached: ['#B42318', '#FEF3F2', '✕'],
  'At Risk': ['#B54708', '#FEF6E7', '!'],
  Healthy: ['#0E8442', '#ECFDF3', '✓'],
  Paused: ['#475467', '#F2F4F7', '‖'],
  Met: ['#0E8442', '#ECFDF3', '✓'],
  Missed: ['#B42318', '#FEF3F2', '✕'],
  None: ['#667085', '#F2F4F7', '–'],
};

export interface SlaState {
  k: SlaKey;
  /** "✕ Breached", "! At risk", … */
  t: string;
  sub: string;
  fg: string;
  bg: string;
  policyId: string | null;
  policyName: string | null;
  fr: number | null;
  res: number | null;
  phase: 'First response' | 'Resolution' | null;
  /** When the current phase is due (null while paused or without a policy). */
  dueAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  /** Minutes left (negative = over). */
  remaining: number | null;
}

export function fmtM(m: number): string {
  m = Math.max(0, Math.round(m));
  if (m < 60) return m + 'm';
  if (m < 1440)
    return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d + 'd' + (h ? ' ' + h + 'h' : '');
}

/** First matching active policy: segment → queue → category → branch → priority → all tickets. */
export function pickPolicy(
  t: SlaTicketInput,
  policies: SlaPolicyLite[],
): SlaPolicyLite | null {
  const P = policies.filter((p) => p.active).sort((a, b) => a.order - b.order);
  const eq = (a: string | null, b: string) =>
    !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    P.find(
      (p) =>
        p.applies === 'Customer Segment' &&
        !!p.scope &&
        t.segments.includes(p.scope.trim().toLowerCase()),
    ) ??
    P.find((p) => p.applies === 'Queue' && eq(t.queueName, p.scope)) ??
    P.find((p) => p.applies === 'Category' && eq(t.category, p.scope)) ??
    P.find((p) => p.applies === 'Branch' && eq(t.branchName, p.scope)) ??
    P.find(
      (p) => p.applies === 'Specific Priority' && p.priority === t.priority,
    ) ??
    P.find((p) => p.applies === 'All Tickets') ??
    null
  );
}

function state(
  k: SlaKey,
  sub: string,
  extra: Partial<SlaState> = {},
): SlaState {
  const C = SLA_COLORS[k];
  return {
    k,
    t: C[2] + ' ' + (k === 'At Risk' ? 'At risk' : k),
    sub,
    fg: C[0],
    bg: C[1],
    policyId: null,
    policyName: null,
    fr: null,
    res: null,
    phase: null,
    dueAt: null,
    firstResponseDueAt: null,
    resolutionDueAt: null,
    remaining: null,
    ...extra,
  };
}

/** The live SLA state of a ticket. Pure: the same inputs always give the same answer. */
export function evaluateSla(
  t: SlaTicketInput,
  policies: SlaPolicyLite[],
  standard: Calendar | null,
  now = new Date(),
): SlaState {
  const p = pickPolicy(t, policies);
  const pol = p
    ? { policyId: p.id, policyName: p.name, fr: p.fr, res: p.res }
    : {};
  if (CLOSED_STATUSES.includes(t.status))
    return t.slaMissed
      ? state('Missed', 'Target missed', pol)
      : state('Met', 'Within target', pol);
  if (!p) return state('None', 'No policy applies');
  const cal = p.hours === '24/7' ? null : standard;
  const pauseSet = new Set(p.pause);
  const pausedWork = t.pauses
    .filter((x) => pauseSet.has(x[2]))
    .reduce((s, x) => s + workMinutes(new Date(x[0]), new Date(x[1]), cal), 0);
  const paused = !!t.pausedSince && pauseSet.has(t.status);
  const openPause = paused ? workMinutes(t.pausedSince!, now, cal) : 0;
  const used = workMinutes(t.createdAt, now, cal) - pausedWork - openPause;
  const phase = t.firstResponseAt ? 'Resolution' : 'First response';
  const target = t.firstResponseAt ? p.res : p.fr;
  const rem = target - used;
  const frDue = addWorkMinutes(
    t.createdAt,
    p.fr + pausedWork + openPause,
    cal,
  ).toISOString();
  const resDue = addWorkMinutes(
    t.createdAt,
    p.res + pausedWork + openPause,
    cal,
  ).toISOString();
  const extra = {
    ...pol,
    phase,
    remaining: Math.round(rem),
    firstResponseDueAt: frDue,
    resolutionDueAt: resDue,
  } as Partial<SlaState>;
  if (paused)
    return state(
      'Paused',
      `${phase} paused · ${fmtM(Math.max(rem, 0))} left`,
      extra,
    );
  extra.dueAt = t.firstResponseAt ? resDue : frDue;
  if (rem < 0) return state('Breached', `${phase} · ${fmtM(-rem)} over`, extra);
  if ((used / target) * 100 >= (p.warn || 75))
    return state('At Risk', `${phase} · ${fmtM(rem)} left`, extra);
  return state('Healthy', `${phase} · ${fmtM(rem)} left`, extra);
}
