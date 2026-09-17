import type { LiveCustomer } from "./customers-api";

/**
 * Shared, disclosed lifecycle/health heuristic reused across the Customers list, profile and
 * insights screens — pure day-count/spend/visit thresholds over real `Customer` fields
 * (`lastVisitAt`, `lifetimeSpend`, `visitCount`, `tags`), never an invented composite "score" or
 * an AI confidence figure. Thresholds are fixed conventions (documented here), not per-business
 * calibrated — the same honesty standard used for Credit's risk bands.
 */
export type Lifecycle = "New" | "Returning" | "Loyal" | "VIP" | "At Risk" | "Lapsed" | "Dormant";

export const LIFECYCLE_TONE: Record<Lifecycle, { bg: string; fg: string }> = {
  New: { bg: "#EEF4FF", fg: "#3538CD" },
  Returning: { bg: "#E6F6F4", fg: "#0D7C74" },
  Loyal: { bg: "#E8F7EE", fg: "#0E8442" },
  VIP: { bg: "#FEF6E7", fg: "#B54708" },
  "At Risk": { bg: "#FFF1E8", fg: "#C4320A" },
  Lapsed: { bg: "#FEF3F2", fg: "#B42318" },
  Dormant: { bg: "#F2F4F7", fg: "#475467" },
};

export const HIGH_VALUE_THRESHOLD = 100000;

export function daysSince(dateIso: string | null): number {
  if (!dateIso) return Infinity;
  return Math.floor((Date.now() - new Date(dateIso).getTime()) / (1000 * 60 * 60 * 24));
}

export function lifecycleOf(c: Pick<LiveCustomer, "lastVisitAt" | "lifetimeSpend" | "visitCount" | "tags">): Lifecycle {
  const d = daysSince(c.lastVisitAt);
  if (d > 180) return "Dormant";
  if (d > 90) return "Lapsed";
  if (d > 45) return "At Risk";
  if (c.tags.includes("VIP") || c.lifetimeSpend > HIGH_VALUE_THRESHOLD) return "VIP";
  if (c.visitCount >= 8) return "Loyal";
  if (c.visitCount >= 2) return "Returning";
  return "New";
}

export function isIncompleteProfile(c: Pick<LiveCustomer, "email" | "tags">): boolean {
  return !c.email || c.tags.length === 0;
}

export function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const AVATAR_PALETTE: { bg: string; fg: string }[] = [
  { bg: "#0A1B2A", fg: "#fff" },
  { bg: "#EEF4FF", fg: "#3538CD" },
  { bg: "#E8F7EE", fg: "#0E8442" },
  { bg: "#FEF6E7", fg: "#B54708" },
  { bg: "#F5EBFE", fg: "#7E22CE" },
];

export const MEDIUM_VALUE_THRESHOLD = 30000;

export function avatarColorFor(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
