import {
  REORDER_LEAD_TIME_DAYS,
  REORDER_VELOCITY_WINDOW_DAYS,
} from './reorder-suggestions.constants';

/** Shared canonical calculation for the suggestions view and its reviewed agent handoff. */
export function calculateReorder(
  unitsSold: number,
  currentStock: number,
  lowStockThreshold: number,
  leadTimeDays = REORDER_LEAD_TIME_DAYS,
) {
  const velocity = unitsSold / REORDER_VELOCITY_WINDOW_DAYS;
  return {
    velocityPerDay: Math.round(velocity * 100) / 100,
    suggestedQty: Math.ceil(
      velocity * leadTimeDays + lowStockThreshold - currentStock,
    ),
  };
}
