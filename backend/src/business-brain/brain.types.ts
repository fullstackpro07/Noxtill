import type { Window } from './brain-metrics.service';

export type FindingKind =
  'Critical' | 'Attention' | 'Opportunity' | 'Improving';
export type Confidence = 'High' | 'Medium' | 'Low';
export type DiagnoseTopic =
  'profit' | 'revenue' | 'repeat' | 'credit' | 'margin';

export interface Evidence {
  t: string;
  d: string;
  link?: { label: string; href: string };
}

export type ActionType =
  'credit_reminders' | 'reorder_draft' | 'quiet_offer' | 'lapsed_followup';

export interface ActionProposal {
  type: ActionType;
  label: string;
  title: string;
  detail: string;
  payload: Record<string, unknown>;
  capability: string;
  /** Set when the action must not run yet, with the real reason. */
  blockedReason?: string;
}

export interface Finding {
  key: string;
  kind: FindingKind;
  /** Short lowercase phrase for sentences ("overdue credit grew"). */
  phrase: string;
  t: string;
  d: string;
  src: string;
  modules: string[];
  impactLabel: string;
  /** What it costs or is worth, in money, when a recorded figure exists — used for ordering only. */
  impactValue: number | null;
  conf: Confidence;
  confWhy: string;
  what: string;
  why: string;
  evidence: Evidence[];
  rec: string;
  recWhy: string;
  limit: string;
  who: string;
  urgency: string;
  action: ActionProposal | null;
  link: { label: string; href: string } | null;
  diagnose: DiagnoseTopic | null;
}

export interface BrainBusiness {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
}

export interface BrainThresholds {
  overdueDays: number;
  stockCoverDays: number;
  repeatDropPercent: number;
  marginGapPoints: number;
  notableChangePercent: number;
  lapsedDays: number;
  maxDiscountPercent: number | null;
}

export interface BrainContext {
  userId: string;
  callerBusinessId: string;
  /** Business ids this reading covers (one branch, or the whole group). */
  ids: string[];
  scopeLabel: string;
  business: BrainBusiness;
  thresholds: BrainThresholds;
  window: Window;
}
