function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  total: number;
  cogs: number;
}

export interface TaxRuleLike {
  category: string | null;
  rate: number;
  active: boolean;
}

/**
 * Taxes & Currency, multi-rate (UPD-BE-120). A category-specific active rule wins; otherwise a
 * `null`-category active rule (an explicit catch-all override) applies; otherwise the business's
 * flat `taxRate` is used unchanged — exactly the additive fallback chain documented on the
 * `TaxRule` model in schema.prisma.
 */
export function resolveTaxRatePercent(
  rules: TaxRuleLike[],
  productCategory: string | null | undefined,
  flatRatePercent: number,
): number {
  const active = rules.filter((r) => r.active);
  const specific = productCategory
    ? active.find((r) => r.category === productCategory)
    : undefined;
  if (specific) return specific.rate;
  const catchAll = active.find((r) => r.category === null);
  if (catchAll) return catchAll.rate;
  return flatRatePercent;
}

/**
 * Shared subtotal/tax/total/cogs math for sales (BE-025), quotations (BE-028), and every other
 * order-creation path. Each item may carry its own `taxRatePercent` (resolved per-line via
 * `resolveTaxRatePercent`, e.g. by product category); a line without one falls back to
 * `defaultTaxRatePercent`. Discount is allocated proportionally across lines by value before tax,
 * so a single flat rate across all items produces byte-identical results to the pre-UPD-BE-120
 * single-rate math (verified: `sum(line * (1 - discount/subtotal)) * rate = (subtotal - discount) * rate`).
 */
export function computeOrderTotals(
  items: {
    price: number;
    cost: number;
    qty: number;
    taxRatePercent?: number;
  }[],
  discount: number,
  defaultTaxRatePercent: number,
): OrderTotals {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cogs = items.reduce((sum, item) => sum + item.cost * item.qty, 0);
  const discountRatio = subtotal > 0 ? discount / subtotal : 0;

  const tax = round2(
    items.reduce((sum, item) => {
      const lineAmount = item.price * item.qty;
      const rate = item.taxRatePercent ?? defaultTaxRatePercent;
      return sum + lineAmount * (1 - discountRatio) * (rate / 100);
    }, 0),
  );
  const total = round2(subtotal - discount + tax);

  return { subtotal: round2(subtotal), tax, total, cogs: round2(cogs) };
}
