import { POLICY_DEFS, PolicyDef, PolicyKey } from '../../common/policies/policies.constants';
import { resolvePolicies } from '../../common/policies/policies.service';
import { HubTone, HubValue, row, RowDef } from '../hub.core';
import { HubDeps, business } from './hub.deps';

interface PolicyRowBase {
  key: string;
  policy: PolicyKey;
  label: string;
  description: string;
  requires?: string;
  risk?: 'Low' | 'Medium' | 'High';
  impact?: string;
  link?: { label: string; href: string };
}

export interface TogglePolicyRow extends PolicyRowBase {
  kind: 'toggle';
  /** How each state reads, and how it is coloured. */
  on: { text: string; tone: HubTone };
  off: { text: string; tone: HubTone };
}

export interface NumberPolicyRow extends PolicyRowBase {
  kind: 'number';
  unit?: string;
  /** How a set value reads, e.g. (n) => `${n}%`. */
  format: (n: number) => string;
  /** How an unset value reads. */
  emptyLabel?: string;
  step?: number;
  tone?: (n: number | null) => HubTone;
}

export interface TimePolicyRow extends PolicyRowBase {
  kind: 'time';
  emptyLabel: string;
}

export type PolicyRowSpec = TogglePolicyRow | NumberPolicyRow | TimePolicyRow;

/**
 * A Settings row backed by one owner policy (`Business.policies`). Reading falls back to the
 * policy's real default and writing goes through the same validation the enforcement points rely
 * on, so a value that can be saved is a value that will be enforced.
 */
export function policyRow(d: HubDeps, spec: PolicyRowSpec): RowDef {
  const def = POLICY_DEFS[spec.policy] as PolicyDef;
  const read = async (ctx: Parameters<RowDef['state']>[0]) => resolvePolicies(await business(d, ctx));

  const resetOf = (): RowDef['reset'] => {
    if (spec.kind === 'toggle') return { label: def.default ? spec.on.text : spec.off.text, value: def.default === true };
    if (spec.kind === 'time') return { label: spec.emptyLabel, value: null };
    const n = def.default as number | null;
    return n === null ? { label: spec.emptyLabel ?? 'No limit', value: null } : { label: spec.format(n), value: n };
  };

  return row({
    key: spec.key,
    label: spec.label,
    description: spec.description,
    risk: spec.risk,
    impact: spec.impact,
    requires: spec.requires ?? 'owner',
    link: spec.link,
    reset: resetOf(),
    state: async (ctx) => {
      const p = await read(ctx);
      if (spec.kind === 'toggle') {
        const on = p.bool(spec.policy);
        const s = on ? spec.on : spec.off;
        return { value: s.text, tone: s.tone, control: { type: 'toggle', on } };
      }
      if (spec.kind === 'time') {
        const t = p.time(spec.policy);
        return { value: t ?? spec.emptyLabel, tone: t ? 'blue' : 'neutral', control: { type: 'time', current: t, nullable: true } };
      }
      const n = p.num(spec.policy);
      return {
        value: n === null ? (spec.emptyLabel ?? 'No limit') : spec.format(n),
        tone: spec.tone ? spec.tone(n) : n === null ? 'neutral' : 'blue',
        control: { type: 'number', current: n, min: def.min, max: def.max, step: spec.step ?? 1, unit: spec.unit, nullable: def.kind === 'nullableNumber', emptyLabel: spec.emptyLabel ?? 'No limit' },
      };
    },
    write: async (ctx, v: HubValue) => {
      await d.policies.set(ctx.businessId, spec.policy, v);
    },
  });
}

