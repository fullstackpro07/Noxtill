function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  total: number;
  cogs: number;
}

/** Shared subtotal/tax/total/cogs math for both sales (BE-025) and quotations (BE-028). */
export function computeOrderTotals(
  items: { price: number; cost: number; qty: number }[],
  discount: number,
  taxRatePercent: number,
): OrderTotals {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cogs = items.reduce((sum, item) => sum + item.cost * item.qty, 0);
  const taxableAmount = subtotal - discount;
  const tax = round2(taxableAmount * (taxRatePercent / 100));
  const total = round2(taxableAmount + tax);

  return { subtotal: round2(subtotal), tax, total, cogs: round2(cogs) };
}
