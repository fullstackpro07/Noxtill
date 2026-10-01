/**
 * Display helpers shared by the Finance screen and record builders. They produce exactly the
 * shapes the Finance design renders (cells, KPIs, notices, flows); the frontend only paints them.
 */
import { MONTHS } from './finance.constants';

export const PAL: Record<string, [string, string]> = {
  green: ['#E8F7EE', '#0E8442'],
  amber: ['#FEF6E7', '#B54708'],
  blue: ['#EFF8FF', '#175CD3'],
  violet: ['#F4F3FF', '#5925DC'],
  red: ['#FEF3F2', '#B42318'],
  gray: ['#F2F4F7', '#475467'],
  dark: ['#0A1B2A', '#FFFFFF'],
};
const TONE: Record<string, string> = {};
const setT = (t: string, l: string) =>
  l.split('|').forEach((s) => (TONE[s] = t));
setT(
  'green',
  'Posted|Reconciled|Matched|Filed|Completed|Active|Paid|Balanced|Healthy|Done|Capitalized|On Budget|Favorable|Current|N/A|3-Way Matched|Approved · Active|OK|Connected|Accepted|Fully Depreciated',
);
setT(
  'amber',
  'Pending Review|Needs Review|Review Required|Suggested|Part Paid|Partially Paid|On Hold|Due Soon|Estimated|Partial|Payment Pending|Open|Soft Close|Revised|Stale|Review|Qty Exception|Price Exception|Possible Duplicate|Due this week|Material|Temporary|Reopened|In Transit|Not Started|Due',
);
setT('violet', 'Approval Required|Submitted');
setT(
  'blue',
  'Approved|Ready to Post|Posting|Processing|In Progress|Calculated|Ready to Reconcile|Approved for Payment|High Confidence|Requested|New|Invited|Pending Approval',
);
setT(
  'red',
  'Failed|Overdue|Not Reconciled|Blocked|Disputed|Reauthorize|Unfavorable|Mismatch|Critical|Missing Data|Out of Balance|Rejected|Not connected',
);
setT(
  'gray',
  'Draft|Excluded|Reversed|Voided|Inactive|Archived|Pending|Header|No PO|Not submitted|Manual|Expired|Revoked|Disposed|Never imported|Not run',
);
setT('dark', 'Locked|Hard Closed');

export function chip(s: string) {
  const p = PAL[TONE[s] ?? 'gray'];
  return { bg: p[0], fg: p[1] };
}

export function money(
  n: number | null | undefined,
  cur = 'USD',
  dp = 2,
): string {
  if (n == null || Number.isNaN(n)) return '—';
  let s: string;
  try {
    s = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    }).format(Math.abs(n));
  } catch {
    s = `${cur} ${Math.abs(n).toFixed(dp)}`;
  }
  return (n < 0 ? '−' : '') + s;
}

export const md = (d: Date | null | undefined) =>
  d
    ? `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${String(d.getUTCDate()).padStart(2, '0')}`
    : '—';
export const mdy = (d: Date | null | undefined) =>
  d
    ? `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
    : '—';
export const ago = (d: Date | null | undefined) => {
  if (!d) return 'never';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  const days = Math.round(s / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export interface Cell {
  t: string;
  sub: string;
  isText: boolean;
  isChip: boolean;
  fw: number;
  color: string;
  ta: string;
  ai: string;
  pl: string;
  bg?: string;
  fg?: string;
}
interface CellOpts {
  sub?: string;
  fw?: number;
  color?: string;
  r?: boolean | number;
  pl?: number;
}
export const T = (
  t: string | number | null | undefined,
  o: CellOpts = {},
): Cell => ({
  t: t == null ? '' : String(t),
  sub: o.sub ?? '',
  isText: true,
  isChip: false,
  fw: o.fw ?? 500,
  color: o.color ?? '#344054',
  ta: o.r ? 'right' : 'left',
  ai: o.r ? 'flex-end' : 'flex-start',
  pl: `${o.pl ?? 0}px`,
});
export const B = (t: string | number | null | undefined, o: CellOpts = {}) =>
  T(t, { fw: 700, color: '#101828', ...o });
export const M = (
  n: number | null | undefined,
  cur: string,
  o: CellOpts = {},
) =>
  T(n == null ? '—' : money(n, cur), {
    r: true,
    fw: 600,
    color: n != null && n < 0 ? '#B42318' : '#101828',
    ...o,
  });
export const S = (s: string, sub = ''): Cell => {
  const c = chip(s);
  return {
    t: s,
    sub,
    isText: false,
    isChip: true,
    bg: c.bg,
    fg: c.fg,
    ta: 'left',
    ai: 'flex-start',
    pl: '0px',
    fw: 700,
    color: c.fg,
  };
};
export const A = (t?: string) =>
  T(t ?? 'Open ›', { color: '#0E8442', fw: 700, r: true });

export interface Kpi {
  label: string;
  value: string;
  state: string;
  hasSt: boolean;
  stBg: string;
  stFg: string;
  icBg: string;
  icFg: string;
  meta: string;
  def: string;
  adv: string;
  go: string;
  seg: string;
  ic: string;
}
export function kpi(o: Partial<Kpi> & { label: string; value: string }): Kpi {
  const c = o.state ? chip(o.state) : null;
  return {
    state: '',
    meta: '',
    def: '',
    adv: '',
    go: '',
    seg: '',
    ic: 'overview',
    icBg: '#E8F7EE',
    icFg: '#0E8442',
    ...o,
    hasSt: !!o.state,
    stBg: c?.bg ?? '',
    stFg: c?.fg ?? '',
  };
}
export const toneAmber = { icBg: '#FEF6E7', icFg: '#B54708' };
export const toneRed = { icBg: '#FEF3F2', icFg: '#B42318' };
export const toneGray = { icBg: '#F2F4F7', icFg: '#475467' };
export const toneViolet = { icBg: '#F4F3FF', icFg: '#5925DC' };

export function notice(
  tone: 'info' | 'warn' | 'bad' | 'dark',
  title: string,
  body: string,
  al = '',
  a = '',
) {
  const t = {
    info: ['#F7FCF9', '#CDEBD8', '#0E8442'],
    warn: ['#FFFCF5', '#FEDF89', '#B54708'],
    bad: ['#FFFBFA', '#FDA29B', '#B42318'],
    dark: ['#0A1B2A', '#0A1B2A', '#FFFFFF'],
  }[tone];
  return {
    bg: t[0],
    bd: t[1],
    fg: t[2],
    body_fg: tone === 'dark' ? '#D0D5DD' : '#475467',
    title,
    body,
    al,
    a,
    hasA: !!al,
  };
}
export type Notice = ReturnType<typeof notice>;

export function flow(title: string, labels: string[], at: number, note = '') {
  return {
    title,
    note,
    steps: labels.map((l, i) => {
      const s = i < at ? 'done' : i === at ? 'active' : 'todo';
      return {
        l,
        n: String(i + 1),
        bg: s === 'done' ? '#12A150' : s === 'active' ? '#0A1B2A' : '#fff',
        fg: s === 'todo' ? '#98A2B3' : '#fff',
        bd: s === 'todo' ? '#D0D5DD' : 'transparent',
        lc: s === 'todo' ? '#98A2B3' : '#101828',
        lw: s === 'active' ? 800 : 600,
        bar: i < at ? '#12A150' : '#E4E7EC',
        last: i === labels.length - 1,
        barVis: i === labels.length - 1 ? 'hidden' : 'visible',
        sr:
          s === 'done'
            ? 'completed'
            : s === 'active'
              ? 'current step'
              : 'not started',
      };
    }),
  };
}

export interface Row {
  id: string;
  seg: string[];
  text: string;
  cells: Cell[];
  bg?: string;
  /** Filter values keyed by filter label. */
  f?: Record<string, string>;
}
export interface Table {
  title: string;
  count: string;
  cols: [string, number?][];
  grid: string;
  minW: number;
  segs: string[];
  filters: [string, string[]][];
  moreFilters?: string[];
  rows: Row[];
}

export const L = (t: string, s = '', v = '') => ({ t, s, v });
export type ListItem = ReturnType<typeof L>;
