/**
 * "Public listing completeness" — how many of the same seven things a customer sees on a Google
 * listing are filled in. The SAME checklist is applied to a competitor (from Google Places) and to
 * your own Master Record, so the two numbers are directly comparable. (Your Listings module keeps
 * its own, wider 12-field score for directory syncing — that one is not comparable to a competitor's
 * because Google exposes far fewer of a competitor's fields.)
 */
export const PUBLIC_LISTING_CHECKS = [
  { key: 'name', label: 'Business name' },
  { key: 'phone', label: 'Phone number' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
  { key: 'hours', label: 'Opening hours' },
  { key: 'category', label: 'Category' },
  { key: 'photos', label: 'Photos' },
] as const;

export type PublicListingCheckKey =
  (typeof PUBLIC_LISTING_CHECKS)[number]['key'];

export interface PublicListingCompleteness {
  percent: number;
  checks: { key: PublicListingCheckKey; label: string; present: boolean }[];
}

export function publicListingCompleteness(
  present: Record<PublicListingCheckKey, boolean>,
): PublicListingCompleteness {
  const checks = PUBLIC_LISTING_CHECKS.map((c) => ({
    key: c.key,
    label: c.label,
    present: present[c.key],
  }));
  const filled = checks.filter((c) => c.present).length;
  return {
    percent: Math.round((filled / checks.length) * 100),
    checks,
  };
}
