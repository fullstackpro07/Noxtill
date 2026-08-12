export const TABLE_ERROR_CODES = {
  TABLE_NOT_FOUND: 'tables.not_found',
  NUMBER_TAKEN: 'tables.number_taken',
  NO_ACTIVE_ORDER: 'tables.no_active_order',
  DESTINATION_OCCUPIED: 'tables.destination_occupied',
};

/**
 * Order statuses considered "still open" for the purposes of a table's live status/total —
 * covers both a draft cart being built (UPD-BE-009) and the pending/confirmed/in_progress
 * lifecycle already used by public ordering (`public-ordering.service.ts`) and quotations
 * (`quotations.service.ts`). `completed`/`cancelled` orders never count as a table's active order.
 */
export const ACTIVE_ORDER_STATUSES = [
  'draft',
  'pending',
  'confirmed',
  'in_progress',
] as const;
