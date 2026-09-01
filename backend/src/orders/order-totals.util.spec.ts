import { computeOrderTotals, resolveTaxRatePercent } from './order-totals.util';

describe('computeOrderTotals (BE-025)', () => {
  it('computes subtotal, tax, total, and cogs from line items', () => {
    const totals = computeOrderTotals(
      [
        { price: 10, cost: 4, qty: 2 }, // 20 revenue, 8 cogs
        { price: 5, cost: 2, qty: 3 }, // 15 revenue, 6 cogs
      ],
      0,
      10, // 10% tax
    );

    expect(totals.subtotal).toBe(35);
    expect(totals.cogs).toBe(14);
    expect(totals.tax).toBe(3.5);
    expect(totals.total).toBe(38.5);
  });

  it('applies discount before computing tax', () => {
    const totals = computeOrderTotals(
      [{ price: 100, cost: 40, qty: 1 }],
      20,
      10,
    );

    // taxable = 100 - 20 = 80; tax = 8; total = 88
    expect(totals.tax).toBe(8);
    expect(totals.total).toBe(88);
  });

  it('rounds to 2 decimal places', () => {
    const totals = computeOrderTotals(
      [{ price: 10.005, cost: 1, qty: 3 }],
      0,
      0,
    );
    expect(totals.subtotal).toBe(30.02);
  });

  describe('Taxes & Currency multi-rate (UPD-BE-120)', () => {
    it('applies a per-item taxRatePercent independently of the default rate', () => {
      const totals = computeOrderTotals(
        [
          { price: 100, cost: 40, qty: 1, taxRatePercent: 20 }, // 20 tax
          { price: 100, cost: 40, qty: 1 }, // falls back to default 10% -> 10 tax
        ],
        0,
        10,
      );

      expect(totals.subtotal).toBe(200);
      expect(totals.tax).toBe(30);
      expect(totals.total).toBe(230);
    });

    it("allocates discount proportionally by line value before applying each line's own rate", () => {
      const totals = computeOrderTotals(
        [
          { price: 100, cost: 0, qty: 1, taxRatePercent: 20 }, // 50% of subtotal
          { price: 100, cost: 0, qty: 1, taxRatePercent: 0 }, // 50% of subtotal
        ],
        40, // discount, split 20/20 across the two equal-value lines
        10,
      );

      // line1 taxable = 100 - 20 = 80 -> tax 16; line2 taxable = 80 -> tax 0
      expect(totals.tax).toBe(16);
      expect(totals.total).toBe(176); // 200 - 40 + 16
    });

    it('produces identical results to the pre-UPD-BE-120 flat-rate math when no item overrides the rate', () => {
      const flat = computeOrderTotals(
        [
          { price: 30, cost: 10, qty: 2 },
          { price: 17.5, cost: 5, qty: 1 },
        ],
        5,
        8.25,
      );
      // subtotal 77.5, taxable 72.5, tax = 72.5 * 8.25% = 5.98125 -> 5.98
      expect(flat.tax).toBe(5.98);
      expect(flat.total).toBe(78.48);
    });
  });
});

describe('resolveTaxRatePercent (UPD-BE-120)', () => {
  it('returns the flat rate when there are no rules', () => {
    expect(resolveTaxRatePercent([], 'Beverages', 5)).toBe(5);
  });

  it('prefers a category-specific active rule over the flat rate', () => {
    const rules = [
      { category: 'Beverages', rate: 12, active: true },
      { category: null, rate: 7, active: true },
    ];
    expect(resolveTaxRatePercent(rules, 'Beverages', 5)).toBe(12);
  });

  it('falls back to a null-category (catch-all) active rule when no specific match exists', () => {
    const rules = [{ category: null, rate: 7, active: true }];
    expect(resolveTaxRatePercent(rules, 'Snacks', 5)).toBe(7);
  });

  it('ignores inactive rules and falls through to the flat rate', () => {
    const rules = [
      { category: 'Beverages', rate: 12, active: false },
      { category: null, rate: 7, active: false },
    ];
    expect(resolveTaxRatePercent(rules, 'Beverages', 5)).toBe(5);
  });

  it('treats a null/undefined product category as never matching a category-specific rule', () => {
    const rules = [{ category: 'Beverages', rate: 12, active: true }];
    expect(resolveTaxRatePercent(rules, null, 5)).toBe(5);
  });
});
