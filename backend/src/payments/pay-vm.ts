/**
 * View-model builders — the same shapes as the design's shared renderer (website-core.js), so the
 * frontend paints them exactly like the design. Everything here is presentation only; every value
 * passed in comes from real rows.
 */
import { CST } from './payments.constants';

export type Btn = {
  k: string;
  t: string;
  bg: string;
  fg: string;
  bd: string;
  dis: boolean;
  why: string;
};
export const btn = (
  k: string,
  t: string,
  kind: 'primary' | 'dark' | 'danger' | 'ghost' = 'ghost',
  dis?: boolean,
  why?: string,
): Btn => {
  const K = {
    primary: ['#12A150', '#fff', '#12A150'],
    dark: ['#0A1B2A', '#fff', '#0A1B2A'],
    danger: ['#fff', '#B42318', '#FDD9D6'],
    ghost: ['#fff', '#344054', '#E6EAF0'],
  }[kind];
  return {
    k,
    t,
    bg: K[0],
    fg: K[1],
    bd: K[2],
    dis: !!dis,
    why: dis ? (why ?? 'Not permitted for your role') : '',
  };
};
export type Cell = {
  t: string;
  s: string;
  bt: string;
  bfg: string;
  bbg: string;
  fw: number;
  fg: string;
  ff: string;
  mw: string;
  opt: string;
};
export const cell = (o: Partial<Cell>): Cell => ({
  t: '',
  s: '',
  bt: '',
  bfg: '',
  bbg: '',
  fw: 500,
  fg: '#344054',
  ff: 'inherit',
  mw: 'none',
  opt: '0',
  ...o,
});
export const chip = (st: string) => {
  const C = CST[st] ?? ['#344054', '#F2F4F7', ''];
  return { t: (C[2] ? `${C[2]} ` : '') + st, fg: C[0], bg: C[1] };
};
export const stc = (st: string) => {
  const c = chip(st);
  return cell({ bt: c.t, bfg: c.fg, bbg: c.bg });
};
export const K = (
  k: string,
  l: string,
  v: string | number,
  sub: string,
  fg?: string | null,
  dot?: string,
) => ({
  k,
  l,
  v: String(v),
  sub,
  fg: fg ?? '#0F172A',
  dot: dot ?? '#D0D5DD',
  aria: `${l}: ${v}. ${sub}. Open.`,
});
export type Bar = { l: string; v: string; w: string; c: string; aria: string };
export const mkBars = (
  items: [string, number, string?][],
  color?: string | null,
  fmt?: (v: number) => string,
): Bar[] => {
  const max = Math.max(1, ...items.map((x) => Math.abs(x[1])));
  return items.map(([l, v, c]) => ({
    l,
    v: fmt ? fmt(v) : String(v),
    w: `${Math.max(2, Math.round((Math.abs(v) / max) * 100))}%`,
    c: c ?? color ?? '#12A150',
    aria: `${l}: ${fmt ? fmt(v) : v}`,
  }));
};
export const seg = (
  items: [string, string, (number | string | null)?][],
  cur: string,
) =>
  items.map(([k, t, n]) => ({
    k,
    t,
    n: n == null ? '' : String(n),
    on: k === cur,
    bg: k === cur ? '#0A1B2A' : '#fff',
    fg: k === cur ? '#fff' : '#344054',
    bd: k === cur ? '#0A1B2A' : '#E6EAF0',
  }));
export const card = (o: Record<string, unknown>) => ({
  card: true,
  id: '',
  title: '',
  sub: '',
  acts: [],
  seg: null,
  filters: null,
  bulk: null,
  table: null,
  bars: null,
  trend: null,
  qcards: null,
  empty: null,
  pager: null,
  info: null,
  api: null,
  kpis: null,
  fields: null,
  preview: null,
  cal: null,
  ...o,
});
export const R = (cols: string, blocks: unknown[], collapse?: boolean) => ({
  cols,
  blocks,
  collapse: collapse === false ? '0' : '1',
});
export const kpiRow = (kpis: unknown[]) =>
  R('minmax(0,1fr)', [{ kpis, card: false }], false);
export const cols = (list: (string | [string, string?])[]) =>
  list.map((x) => {
    const [t, opt] = Array.isArray(x) ? x : [x];
    return {
      t,
      plain: true,
      sk: null,
      opt: opt ?? '0',
      fg: '#667085',
      arrow: '',
      aria: 'none',
    };
  });
export const row = (
  id: string,
  cells: Cell[],
  acts: string[],
  cardInfo?: [string, string, { t: string; fg: string; bg: string }[]],
  extra?: Record<string, unknown>,
) => ({
  id,
  bg: '#fff',
  on: false,
  selLabel: `Select ${id}`,
  actLabel: `Actions for ${id}`,
  acts: acts ?? [],
  cells,
  cardT: cardInfo ? cardInfo[0] : '',
  cardS: cardInfo ? cardInfo[1] : '',
  cardB: cardInfo?.[2] ?? [],
  ...(extra ?? {}),
});
export const sel2 = (
  k: string,
  l: string,
  v: string,
  opts: (string | [string, string])[],
) => ({
  k,
  l,
  v,
  opts: opts.map((x) =>
    typeof x === 'string' ? { v: x, t: x } : { v: x[0], t: x[1] },
  ),
  bd: v ? '#12A150' : '#E6EAF0',
  bg: v ? '#F7FCF9' : '#fff',
});
export const emptyRows = (t: string, d: string, acts: Btn[] = []) => [
  R('minmax(0,1fr)', [card({ empty: { t, d, acts } })]),
];

// ── settings field builders ──────────────────────────────────────────────
const fbase = (l: string, key: string, o: Record<string, unknown>) => ({
  l,
  key,
  h: '',
  v: '',
  cols: 'minmax(0,1fr) minmax(0,1.3fr)',
  isSelect: false,
  isText: false,
  isArea: false,
  isColor: false,
  isToggle: false,
  isChips: false,
  isRead: false,
  btns: null,
  warn: null,
  warnFg: '#B54708',
  dis: false,
  req: false,
  type: 'text',
  ph: '',
  rows: 3,
  ff: 'inherit',
  fg: '#344054',
  ...o,
});
export const fSel = (
  l: string,
  key: string,
  v: string,
  opts: (string | { v: string; t: string })[],
  o?: Record<string, unknown>,
) =>
  fbase(l, key, {
    isSelect: true,
    v,
    opts: opts.map((x) => (typeof x === 'string' ? { v: x, t: x } : x)),
    ...(o ?? {}),
  });
export const fTxt = (
  l: string,
  key: string,
  v: unknown,
  o?: Record<string, unknown>,
) =>
  fbase(l, key, {
    isText: true,
    v: v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v),
    ...(o ?? {}),
  });
export const fTog = (
  l: string,
  key: string,
  on: boolean,
  o?: Record<string, unknown>,
) =>
  fbase(l, key, {
    isToggle: true,
    on: !!on,
    tBg: on ? '#12A150' : '#D0D5DD',
    tX: on ? '21px' : '3px',
    tL: on ? 'On' : 'Off',
    ...(o ?? {}),
  });
export const fChips = (
  l: string,
  key: string,
  all: (string | { v: string; t: string })[],
  on: string[],
  o?: Record<string, unknown>,
) =>
  fbase(l, key, {
    isChips: true,
    chips: all.map((x) => {
      const v = typeof x === 'string' ? x : x.v;
      const t = typeof x === 'string' ? x : x.t;
      const s = on.includes(v);
      return {
        v,
        t,
        on: s,
        mark: s ? '✓' : '+',
        bg: s ? '#ECFDF3' : '#fff',
        fg: s ? '#0E8442' : '#475467',
        bd: s ? '#12A150' : '#E6EAF0',
      };
    }),
    ...(o ?? {}),
  });
export const fRead = (l: string, v: string, o?: Record<string, unknown>) =>
  fbase(l, '', { isRead: true, v, ...(o ?? {}) });
export const fBtns = (l: string, btns: Btn[], o?: Record<string, unknown>) =>
  fbase(l, '', { btns, ...(o ?? {}) });

// ── formatting (business currency + timezone) ────────────────────────────
export class Fmt {
  constructor(
    readonly base: string,
    readonly tz: string,
  ) {}

  money(v: number | null | undefined, cur?: string | null): string {
    if (v == null || !Number.isFinite(v)) return '—';
    const c = cur || this.base;
    const neg = v < 0 ? '−' : '';
    const a = Math.abs(v);
    if (c === 'PKR')
      return `${neg}Rs. ${a.toLocaleString('en-PK', { maximumFractionDigits: a % 1 ? 2 : 0 })}`;
    if (c === 'INR')
      return `${neg}₹${a.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    try {
      return (
        neg +
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: c,
          minimumFractionDigits: a % 1 ? 2 : 0,
          maximumFractionDigits: 2,
        }).format(a)
      );
    } catch {
      return `${neg}${c} ${a.toFixed(2)}`;
    }
  }

  short(v: number | null | undefined, cur?: string | null): string {
    if (v == null || !Number.isFinite(v)) return '—';
    const c = cur || this.base;
    const s = v < 0 ? '−' : '';
    const a = Math.abs(v);
    if (c === 'PKR' || c === 'INR') {
      const p = c === 'PKR' ? 'Rs. ' : '₹';
      return (
        s +
        p +
        (a >= 1e7
          ? `${(a / 1e7).toFixed(2)} Cr`
          : a >= 1e5
            ? `${(a / 1e5).toFixed(2)} L`
            : a.toLocaleString('en-PK', { maximumFractionDigits: 0 }))
      );
    }
    if (a >= 1e6) return `${s}${this.money(a / 1e6, c).replace(/\.00$/, '')}M`;
    if (a >= 1e4) return `${s}${this.money(Math.round(a / 100) / 10, c)}K`;
    return s + this.money(a, c);
  }

  private parts(d: Date) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: this.tz,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
    } catch {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
    }
  }

  dtm(d: Date | null | undefined): string {
    if (!d) return '—';
    const p = Object.fromEntries(this.parts(d).map((x) => [x.type, x.value]));
    return `${p.day} ${p.month}, ${p.hour}:${p.minute}`;
  }

  day(d: Date | null | undefined): string {
    if (!d) return '—';
    const p = Object.fromEntries(this.parts(d).map((x) => [x.type, x.value]));
    return `${p.day} ${p.month}`;
  }

  /** Whole days from today (business timezone) to d. */
  daysFrom(d: Date): number {
    const key = (x: Date) => {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: this.tz }).format(
          x,
        );
      } catch {
        return x.toISOString().slice(0, 10);
      }
    };
    return Math.round(
      (Date.parse(key(d)) - Date.parse(key(new Date()))) / 86400000,
    );
  }

  rel(d: Date | null | undefined): string {
    if (!d) return '—';
    const n = this.daysFrom(d);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return n > 0 ? `in ${n}d` : `${Math.abs(n)}d ago`;
  }

  ago(d: Date | null | undefined): string {
    if (!d) return '—';
    const m = (Date.now() - d.getTime()) / 60000;
    if (m < 1) return 'just now';
    if (m < 60) return `${Math.round(m)}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  }

  until(d: Date | null | undefined): string {
    if (!d) return '—';
    const m = (d.getTime() - Date.now()) / 60000;
    if (m <= 0) return 'Allowed now';
    if (m < 60) return `in ${Math.round(m)}m`;
    if (m < 1440) return `in ${Math.floor(m / 60)}h`;
    return `in ${Math.floor(m / 1440)}d`;
  }

  pct(a: number, b: number) {
    return b ? `${((a / b) * 100).toFixed(1)}%` : '—';
  }
}

/**
 * The design's renderer only draws card buttons inside a titled card header — an untitled card
 * with view tabs shows none. Moves those buttons into the header "More…" menu (skipping ones the
 * header already has, and ones disabled for this role) so they stay reachable without drawing
 * anything the design doesn't.
 */
export function hoistSegActs(
  rows: unknown[],
  head: { more: { v: string; t: string }[]; hdrActs: Btn[] },
) {
  const have = new Set([
    ...head.more.map((m) => m.v),
    ...head.hdrActs.map((b) => b.k),
  ]);
  for (const r of rows as { blocks?: Record<string, unknown>[] }[])
    for (const b of r.blocks ?? []) {
      if (!b.card || b.title || !b.seg) continue;
      const acts = (b.acts as Btn[] | undefined) ?? [];
      for (const a of acts)
        if (!a.dis && !have.has(a.k)) {
          head.more.unshift({ v: a.k, t: a.t });
          have.add(a.k);
        }
      b.acts = [];
    }
  return rows;
}
