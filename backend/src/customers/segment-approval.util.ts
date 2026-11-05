import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';

/** Canonical name, rule definition and record version are all covered by the approval. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, ordered(entry)]),
    );
  return value;
}
export function customerSegmentReviewHash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(ordered(value)))
    .digest('hex');
}
export function segmentDefinitionHash(
  name: string,
  rules: unknown,
  version: number,
) {
  return customerSegmentReviewHash({ name, rules, version });
}

export function segmentApprovalState(segment: {
  name: string;
  rules: Prisma.JsonValue;
  version: number;
  sourceAgentRecommendationId: string | null;
  agentApprovedVersion: number | null;
  agentApprovedDefinitionHash: string | null;
}): 'manual' | 'approved' | 'changed' {
  if (!segment.sourceAgentRecommendationId) return 'manual';
  return segment.agentApprovedVersion === segment.version &&
    segment.agentApprovedDefinitionHash ===
      segmentDefinitionHash(segment.name, segment.rules, segment.version)
    ? 'approved'
    : 'changed';
}
