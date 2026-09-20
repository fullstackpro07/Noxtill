import { Role } from '@prisma/client';

export type HubTone = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'neutral';
export type HubScope = 'Business' | 'Branch' | 'User' | 'Team';
export type HubRisk = 'Low' | 'Medium' | 'High';
export type HubValue = string | number | boolean | null;

export type HubControl =
  | { type: 'toggle'; on: boolean }
  | {
      type: 'select';
      current: string;
      options: { value: string; label: string }[];
    }
  | { type: 'text'; current: string; placeholder?: string; maxLength?: number }
  | {
      type: 'number';
      current: number | null;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      /** An empty box means "no limit" and is saved as null. */
      nullable?: boolean;
      emptyLabel?: string;
    }
  | { type: 'time'; current: string | null; nullable?: boolean }
  | {
      type: 'action';
      label: string;
      actionKey: string;
      tone?: 'red' | 'neutral';
      confirm?: string;
      /** Runs in the browser (e.g. play a sound, download a file) instead of calling the server. */
      client?: 'play-sound' | 'download-diagnostics';
    };

export interface HubCtx {
  /** The business being configured — the selected branch, else the signed-in business. */
  businessId: string;
  userId: string;
  role: Role;
  sessionId?: string;
  customRoleId?: string | null;
  caps: Set<string>;
  /** True when the caller may use `capability` (owner always may). */
  can(capability: string): boolean;
  isOwner: boolean;
  now: Date;
}

export interface RowState {
  value: string;
  tone?: HubTone;
  control?: HubControl | null;
  effective?: string | null;
}

export interface RowDef {
  key: string;
  label: string;
  description: string;
  scope?: HubScope;
  risk?: HubRisk;
  impact?: string;
  /** Capability needed to edit, or 'owner'. Rows without `write` are read-only regardless. */
  requires?: string;
  link?: { label: string; href: string };
  state(ctx: HubCtx): RowState | Promise<RowState>;
  write?(ctx: HubCtx, value: HubValue): Promise<void>;
  /** A real Noxtill default, so "Reset to default" is genuine. */
  reset?: { label: string; value: HubValue };
}

export interface GroupDef {
  title: string;
  hint?: string;
  badge?: (ctx: HubCtx) => Promise<{ text: string; tone: HubTone } | null>;
  footer?: string;
  /** Static rows — also what settings search indexes. */
  rows?: RowDef[];
  /** Rows that depend on data (sessions, tax rules, integrations…). */
  dynamicRows?: (ctx: HubCtx) => Promise<RowDef[]>;
}

export interface CategoryDef {
  key: string;
  label: string;
  title: string;
  icon: string;
  /** Every row is a personal preference, so history shows only the caller's own changes. */
  userScoped?: boolean;
  group:
    | 'Platform'
    | 'Access'
    | 'Money'
    | 'Operations'
    | 'Engagement'
    | 'Intelligence'
    | 'Governance';
  description: string;
  affects: string[];
  affectsNote: string;
  help: string[];
  notice?: {
    text: string;
    icon: 'info' | 'shield-check';
    action?: { label: string; href: string };
  };
  actions?: {
    label: string;
    icon: string;
    primary?: boolean;
    href?: string;
    kind: 'reset' | 'history' | 'link' | 'export';
  }[];
  groups: GroupDef[];
  /** A notifications-style matrix rendered above the rows. */
  matrix?: (ctx: HubCtx) => Promise<unknown>;
}

export const canonicalOf = (state: RowState): HubValue | null => {
  const c = state.control;
  if (!c || c.type === 'action') return null;
  return c.type === 'toggle' ? c.on : c.current;
};

/** Small helper so category files stay declarative. */
export function row(def: RowDef): RowDef {
  return def;
}

export const chipTone = (ok: boolean, bad: HubTone = 'amber'): HubTone =>
  ok ? 'green' : bad;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function relativeTime(date: Date | null | undefined, now = new Date()): string {
  if (!date) return 'Never';
  const mins = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
