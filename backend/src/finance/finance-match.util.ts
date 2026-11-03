/** Three-way match tolerances Finance applies to a bill line (fixed, not business-configurable). */
export const QTY_TOL = 0.02;
export const PRICE_TOL = 0.01;

/**
 * The label Finance shows for a bill's three-way match (bill vs purchase order vs goods received).
 * Shared so every screen that shows a bill's match result — Finance › Bills and Procurement ›
 * 3-Way Match — reads the same stored result the same way.
 */
export function billMatchLabel(b: {
  matchStatus: string;
  matchDetail: unknown;
  status: string;
}) {
  const d = (b.matchDetail ?? {}) as {
    duplicateOf?: string[];
    rows?: { result: string }[];
    reviewedBy?: string;
  };
  if (d.duplicateOf?.length && b.status === 'Review Required')
    return 'Possible Duplicate';
  if (b.matchStatus === 'Matched') return '3-Way Matched';
  if (b.matchStatus === 'Variance')
    return d.rows?.find((r) => r.result !== 'Match')?.result ?? 'Qty Exception';
  return 'No PO';
}
