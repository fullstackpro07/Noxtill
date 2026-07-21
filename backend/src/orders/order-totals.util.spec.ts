import { computeOrderTotals } from './order-totals.util';

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
});
