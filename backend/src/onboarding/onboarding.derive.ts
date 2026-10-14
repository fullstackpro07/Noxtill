import {
  COMMON_QUESTIONS,
  CatalogActivity,
  CatalogQuestion,
  DISCOVERY,
  DISCOVERY_ALIAS,
  MODULES,
  REQ_LABEL,
} from './onboarding.catalog';

/** Step 2 answers as the client stores them (resumable draft). Every field is optional on read. */
export interface OnboardingDraft {
  s2?: number;
  basics?: {
    bizName?: string;
    bizEmail?: string;
    dialIso?: string;
    dialCode?: string;
    phone?: string;
    website?: string;
    countryIso?: string;
    countryName?: string;
    currency?: string;
    city?: string;
  };
  category?: string;
  customIndustry?: string;
  tags?: string[];
  desc?: string;
  discovery?: Record<string, string[]>;
  activities?: string[];
  touchedActs?: boolean;
  customActs?: string[];
  reqs?: string[];
  touchedReqs?: boolean;
}

export interface Derived {
  bizType: string;
  activities: CatalogActivity[];
  activeActivities: CatalogActivity[];
  candidateIds: string[];
  matchedIds: string[];
  reasonFor: Record<string, string>;
  answeredCount: number;
}

const KNOWN = new Set(MODULES.map((m) => m.id));

export function discoveryTree(bizType: string) {
  const key = DISCOVERY[bizType]
    ? bizType
    : (DISCOVERY_ALIAS[bizType] ?? 'Clothing Store');
  return DISCOVERY[key];
}

export function visibleQuestions(
  bizType: string,
  answers: Record<string, string[]>,
): CatalogQuestion[] {
  return discoveryTree(bizType)
    .questions.concat(COMMON_QUESTIONS)
    .filter(
      (q) =>
        !q.showIf ||
        (answers[q.showIf.id] ?? []).some((v) => q.showIf!.any.includes(v)),
    );
}

/**
 * Activities come only from the owner's answers (never a universal list); a module is a candidate
 * only if an activity justifies it, and is matched only if it's a requirement the owner kept.
 */
export function derive(draft: OnboardingDraft): Derived {
  const bizType = draft.tags?.[0] ?? '';
  const answers = draft.discovery ?? {};
  const tree = discoveryTree(bizType);
  const derived: CatalogActivity[] = tree.base.slice();
  for (const q of visibleQuestions(bizType, answers)) {
    const picked = answers[q.id] ?? [];
    for (const o of q.options) {
      if (!picked.includes(o.label)) continue;
      for (const a of o.acts) {
        if (!derived.some((d) => d.name === a.name)) derived.push(a);
      }
    }
  }
  for (const n of draft.customActs ?? []) {
    if (!derived.some((d) => d.name === n)) {
      derived.push({ name: n, group: 'YOUR OWN', icon: 'sparkle', mods: [] });
    }
  }
  const activeActivities = draft.touchedActs
    ? derived.filter((a) => (draft.activities ?? []).includes(a.name))
    : derived;

  const candidateIds: string[] = [];
  const reasonFor: Record<string, string> = {};
  for (const a of activeActivities) {
    for (const id of a.mods) {
      if (!candidateIds.includes(id)) candidateIds.push(id);
      reasonFor[id] = reasonFor[id]
        ? `${reasonFor[id]} + “${a.name}”`
        : `You told us: “${a.name}”`;
    }
  }
  const matchedIds = (
    draft.touchedReqs ? (draft.reqs ?? []) : candidateIds
  ).filter((id) => KNOWN.has(id));
  for (const id of matchedIds) {
    if (!reasonFor[id]) {
      reasonFor[id] =
        `You asked Noxtill to manage “${(REQ_LABEL[id] ?? id).toLowerCase()}”`;
    }
  }
  return {
    bizType,
    activities: derived,
    activeActivities,
    candidateIds,
    matchedIds,
    reasonFor,
    answeredCount: Object.keys(answers).length,
  };
}

/** "Service-based with product sales" etc. — from what the owner actually does. */
export function classifyBusiness(candidateIds: string[]): string {
  const service = candidateIds.some((id) =>
    ['bookings', 'projects'].includes(id),
  );
  const product = candidateIds.some((id) =>
    ['pos', 'inventory', 'products', 'orders'].includes(id),
  );
  if (service && product) return 'Service-based with product sales';
  if (service) return 'Service-based';
  if (product) return 'Product-based sales';
  return 'Not enough information yet';
}
