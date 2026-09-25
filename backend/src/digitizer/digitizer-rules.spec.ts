import {
  RulesContext,
  RowLookup,
  assessDocument,
  assessRow,
  confidenceSummary,
  normalizeField,
  reconcile,
} from './digitizer-rules';
import { DigitizerRow } from './digitizer.types';

const ctx: RulesContext = {
  country: 'PK',
  reviewThreshold: 0.7,
  currency: 'PKR',
  now: new Date('2026-09-24T12:00:00Z'),
};

let n = 0;
function row(
  over: Partial<DigitizerRow> & Pick<DigitizerRow, 'destination' | 'data'>,
): DigitizerRow {
  n += 1;
  return {
    id: `r${n}`,
    confidence: 0.95,
    corrected: false,
    action: 'commit',
    ...over,
  };
}

const noLookup = new Map<string, RowLookup>();

describe('normalizeField', () => {
  it('turns a local phone number into E.164 using the business country, and says so', () => {
    const out = normalizeField('phone', '0300-1234567', { country: 'PK' });
    expect(out.value).toBe('+923001234567');
    expect(out.note).toContain('Local format to international');
    expect(out.invalid).toBe(false);
  });

  it('flags a phone that cannot be parsed instead of inventing digits', () => {
    const out = normalizeField('phone', '+92 303 55443', { country: 'PK' });
    expect(out.invalid).toBe(true);
    expect(out.value).toBe('+92 303 55443'); // left exactly as read
  });

  it('lower-cases and validates emails', () => {
    expect(
      normalizeField('email', 'H.Raza@Example.pk', { country: null }),
    ).toMatchObject({ value: 'h.raza@example.pk', invalid: false });
    expect(
      normalizeField('email', 'not-an-email', { country: null }).invalid,
    ).toBe(true);
  });

  it('reads amounts with currency symbols and separators, and uppercases SKUs', () => {
    expect(
      normalizeField('money', 'Rs. 1,250.50', { country: null }).value,
    ).toBe('1250.5');
    expect(normalizeField('sku', ' ab 12 ', { country: null }).value).toBe(
      'AB12',
    );
  });

  it('accepts only real ISO dates', () => {
    expect(
      normalizeField('date', '2026-08-28', { country: null }).invalid,
    ).toBe(false);
    expect(
      normalizeField('date', '2026-13-40', { country: null }).invalid,
    ).toBe(true);
    expect(normalizeField('date', '28/08/26', { country: null }).invalid).toBe(
      true,
    );
  });
});

describe('assessRow', () => {
  it('blocks a customer row with no name — a required value is never guessed', () => {
    const r = row({
      destination: 'customer',
      data: { name: null, phone: '0300-1234567' },
      fieldConfidence: { name: null, phone: 0.9 },
      page: 2,
      sourceRow: 41,
    });
    const a = assessRow(r, ctx, undefined, null);
    expect(a.state).toBe('blocked');
    expect(a.blockedBy).toBe('error');
    expect(
      a.issues.some((i) => i.code === 'missing_required' && i.field === 'name'),
    ).toBe(true);
    expect(a.fields.find((f) => f.field === 'name')?.level).toBe('unreadable');
    expect(a.displayName).toBe('Row p2 r41 · name blank');
  });

  it('holds a low-confidence row for review, and releases it once the owner accepts it', () => {
    const r = row({
      destination: 'customer',
      data: { name: 'Sara', phone: '0300-1234567' },
      fieldConfidence: { name: 0.9, phone: 0.4 },
    });
    const held = assessRow(r, ctx, undefined, null);
    expect(held.state).toBe('needs_review');
    expect(held.fields.find((f) => f.field === 'phone')?.level).toBe('low');
    expect(held.plan).toBe('blocked');

    const accepted = assessRow({ ...r, reviewed: true }, ctx, undefined, null);
    expect(accepted.state).toBe('ready');
    expect(accepted.plan).toBe('create');
  });

  it('respects the owner’s review threshold', () => {
    const r = row({
      destination: 'customer',
      data: { name: 'Sara', phone: '0300-1234567' },
      confidence: 0.75,
    });
    expect(
      assessRow(r, { ...ctx, reviewThreshold: 0.7 }, undefined, null).state,
    ).toBe('ready');
    expect(
      assessRow(r, { ...ctx, reviewThreshold: 0.9 }, undefined, null).state,
    ).toBe('needs_review');
  });

  it('does not accept an invalid phone by "reviewing" it', () => {
    const r = row({
      destination: 'customer',
      data: { name: 'Sara', phone: '12' },
      reviewed: true,
    });
    const a = assessRow(r, ctx, undefined, null);
    expect(a.state).toBe('blocked');
    expect(a.issues.some((i) => i.code === 'invalid_phone')).toBe(true);
  });

  it('holds a strong duplicate until the owner decides, then follows the decision', () => {
    const duplicate: RowLookup = {
      duplicate: {
        level: 'high',
        entity: 'Customers',
        basis: 'Phone and name both match an existing customer exactly.',
        phoneMatch: true,
        emailMatch: false,
        nameMatch: true,
        existing: {
          id: 'c1',
          name: 'Ahmed Khan',
          phone: '+923001234567',
          email: null,
        },
      },
      product: null,
      existingCustomer: null,
    };
    const r = row({
      destination: 'customer',
      data: { name: 'Ahmed Khan', phone: '0300-1234567' },
    });
    const undecided = assessRow(r, ctx, duplicate, null);
    expect(undecided.state).toBe('blocked');
    expect(undecided.blockedBy).toBe('duplicate');

    const decided = assessRow(
      { ...r, duplicateDecision: 'use_existing' },
      ctx,
      duplicate,
      null,
    );
    expect(decided.state).toBe('ready');
    expect(decided.plan).toBe('skip'); // using the existing customer creates nothing
  });

  it('treats a name-only match as a warning to look at, never a block on its own', () => {
    const weak: RowLookup = {
      duplicate: {
        level: 'low',
        entity: 'Customers',
        basis: 'Name matches, phone does not.',
        phoneMatch: false,
        emailMatch: false,
        nameMatch: true,
        existing: {
          id: 'c2',
          name: 'Muhammad Hassan',
          phone: '+923009999999',
          email: null,
        },
      },
      product: null,
      existingCustomer: null,
    };
    const r = row({
      destination: 'customer',
      data: { name: 'Muhammad Hassan', phone: '0300-1234567' },
    });
    expect(assessRow(r, ctx, weak, null).state).toBe('needs_review');
    expect(assessRow({ ...r, reviewed: true }, ctx, weak, null).plan).toBe(
      'create',
    );
  });

  it('blocks an inventory row that matches no catalog product, and plans an update when it does', () => {
    const r = row({
      destination: 'inventory',
      data: { name: 'Mystery Item', countedQty: 4 },
    });
    const unmatched = assessRow(
      r,
      ctx,
      { duplicate: null, product: null, existingCustomer: null },
      null,
    );
    expect(unmatched.state).toBe('blocked');
    expect(unmatched.issues.some((i) => i.code === 'unmatched_product')).toBe(
      true,
    );

    const matched = assessRow(
      r,
      ctx,
      {
        duplicate: null,
        product: { id: 'p1', name: 'Mystery Item', sku: null, stockQty: 3 },
        existingCustomer: null,
      },
      null,
    );
    expect(matched.state).toBe('ready');
    expect(matched.plan).toBe('update');
  });

  it('blocks an expense with no readable date instead of defaulting it to today', () => {
    const r = row({
      destination: 'expense',
      data: { description: 'Fuel', amount: 40, incurredOn: null },
      fieldConfidence: { incurredOn: null },
    });
    const a = assessRow(r, ctx, undefined, null);
    expect(a.state).toBe('blocked');
    expect(
      a.issues.some(
        (i) => i.code === 'missing_required' && i.field === 'incurredOn',
      ),
    ).toBe(true);
  });

  it('warns about a future date and rejects a negative quantity', () => {
    const future = assessRow(
      row({
        destination: 'expense',
        data: { description: 'x', amount: 5, incurredOn: '2026-12-01' },
      }),
      ctx,
      undefined,
      null,
    );
    expect(future.issues.some((i) => i.code === 'future_date')).toBe(true);
    expect(future.state).toBe('needs_review');

    const neg = assessRow(
      row({ destination: 'inventory', data: { name: 'x', countedQty: -3 } }),
      ctx,
      {
        duplicate: null,
        product: { id: 'p', name: 'x', sku: null, stockQty: 1 },
        existingCustomer: null,
      },
      null,
    );
    expect(neg.state).toBe('blocked');
    expect(neg.issues.some((i) => i.code === 'negative_quantity')).toBe(true);
  });

  it('keeps the model’s original beside the normalized value', () => {
    const r = row({
      destination: 'customer',
      data: { name: 'Sara', phone: '0300-1234567' },
      original: { name: 'Sara', phone: '0300-1234567' },
    });
    const phone = assessRow(r, ctx, undefined, null).fields.find(
      (f) => f.field === 'phone',
    );
    expect(phone?.original).toBe('0300-1234567');
    expect(phone?.normalized).toBe('+923001234567');
  });

  it('shows a field the model returned but this build has nowhere to put as ignored', () => {
    const r = row({
      destination: 'customer',
      data: { name: 'Sara', phone: '0300-1234567', city: 'Lahore' },
    });
    const city = assessRow(r, ctx, undefined, null).fields.find(
      (f) => f.field === 'city',
    );
    expect(city?.target).toBeNull();
  });

  it('never marks an already imported row as needing anything', () => {
    const r = row({
      destination: 'customer',
      data: { name: 'Sara', phone: '0300-1234567' },
      result: { status: 'created', at: '2026-09-24T00:00:00Z', jobId: 'IMP-1' },
    });
    const a = assessRow(r, ctx, undefined, null);
    expect(a.state).toBe('imported');
    expect(a.plan).toBe('done');
  });
});

describe('reconcile', () => {
  it('finds the gap between the line items and the printed total, and names the unreadable line', () => {
    const rec = reconcile(
      {
        lineItems: [
          { description: 'A', quantity: 2, unitPrice: 500, lineTotal: 1000 },
          {
            description: 'B',
            quantity: null,
            unitPrice: 1000,
            lineTotal: null,
          },
          { description: 'C', quantity: 1, unitPrice: 400, lineTotal: 400 },
        ],
        totals: { subtotal: null, tax: 0, discount: 0, printedTotal: 2400 },
        ledger: null,
      },
      'PKR',
    )!;
    expect(rec.kind).toBe('invoice');
    expect(rec.ok).toBe(false);
    expect(rec.calculated).toBe(1400);
    expect(rec.difference).toBe(1000);
    expect(rec.unreadableLines).toEqual([
      { index: 2, missing: ['quantity', 'line total'] },
    ]);
  });

  it('accepts line items that add up, including tax and discount', () => {
    const rec = reconcile(
      {
        lineItems: [
          { description: 'A', quantity: 2, unitPrice: 50, lineTotal: 100 },
        ],
        totals: { subtotal: null, tax: 10, discount: 5, printedTotal: 105 },
        ledger: null,
      },
      'PKR',
    )!;
    expect(rec.ok).toBe(true);
  });

  it('reconciles a credit ledger from its own entries and reports the difference untouched', () => {
    const rec = reconcile(
      {
        lineItems: [],
        totals: null,
        ledger: {
          openingBalance: 100000,
          entries: [
            { description: 'Sale', amount: 60000, kind: 'charge' },
            { description: 'Payment', amount: 11800, kind: 'payment' },
          ],
          statedClosingBalance: 151400,
        },
      },
      'PKR',
    )!;
    expect(rec.kind).toBe('ledger');
    expect(rec.calculated).toBe(148200);
    expect(rec.difference).toBe(3200);
    expect(rec.ok).toBe(false);
  });

  it('has nothing to reconcile without a printed total', () => {
    expect(
      reconcile(
        {
          lineItems: [
            { description: 'A', quantity: 1, unitPrice: 1, lineTotal: 1 },
          ],
          totals: null,
          ledger: null,
        },
        'PKR',
      ),
    ).toBeNull();
  });
});

describe('assessDocument', () => {
  const invoiceAnalysis = {
    lineItems: [
      { description: 'A', quantity: 1, unitPrice: 100, lineTotal: 100 },
    ],
    totals: { subtotal: null, tax: null, discount: null, printedTotal: 150 },
    ledger: null,
  };

  it('reports a total mismatch as critical, blocks the expense row, and never adjusts either figure', () => {
    const rows = [
      row({
        destination: 'expense',
        data: { description: 'Invoice', amount: 150, incurredOn: '2026-09-01' },
      }),
    ];
    const doc = assessDocument(
      { batchStatus: 'pending', stage: null, rows, analysis: invoiceAnalysis },
      ctx,
      noLookup,
    );
    expect(doc.status).toBe('total_mismatch');
    const issue = doc.issues.find((i) => i.code === 'total_mismatch')!;
    expect(issue.severity).toBe('critical');
    expect(issue.blocks).toBe('rows');
    expect(doc.rows[0].state).toBe('blocked');
    expect(doc.rows[0].blockedBy).toBe('reconciliation');
    expect(doc.reconciliation?.calculated).toBe(100);
    expect(doc.reconciliation?.stated).toBe(150);
  });

  it('blocks the whole ledger, not one row, when it does not reconcile', () => {
    const rows = [
      row({
        destination: 'credit_opening_balance',
        data: { customerName: 'A', phone: '0300-1111111', amount: 10 },
      }),
      row({
        destination: 'credit_opening_balance',
        data: { customerName: 'B', phone: '0300-2222222', amount: 20 },
      }),
    ];
    const doc = assessDocument(
      {
        batchStatus: 'pending',
        stage: null,
        rows,
        analysis: {
          lineItems: [],
          totals: null,
          ledger: {
            openingBalance: 0,
            entries: [{ description: 'x', amount: 30, kind: 'charge' }],
            statedClosingBalance: 50,
          },
        },
      },
      ctx,
      noLookup,
    );
    expect(doc.status).toBe('unbalanced');
    expect(doc.rows.every((r) => r.state === 'blocked')).toBe(true);
    expect(doc.issues[0].blocks).toBe('document');
  });

  it('is ready when every row is clean and nothing needs a decision', () => {
    const rows = [
      row({
        destination: 'customer',
        data: { name: 'Sara', phone: '0300-1234567' },
      }),
    ];
    const doc = assessDocument(
      { batchStatus: 'pending', stage: null, rows, analysis: null },
      ctx,
      noLookup,
    );
    expect(doc.status).toBe('ready');
    expect(doc.plan.create).toBe(1);
    expect(confidenceSummary(doc.counts)).toBe('All high');
  });

  it('counts confidence from the rows and reports "needs review" with the reason', () => {
    const rows = [
      row({
        destination: 'customer',
        data: { name: 'Sara', phone: '0300-1234567' },
      }),
      row({
        destination: 'customer',
        data: { name: 'Bilal', phone: '0300-7654321' },
        fieldConfidence: { name: 0.9, phone: 0.3 },
      }),
      row({
        destination: 'customer',
        data: { name: null, phone: null },
        fieldConfidence: { name: null, phone: null },
      }),
    ];
    const doc = assessDocument(
      { batchStatus: 'pending', stage: null, rows, analysis: null },
      ctx,
      noLookup,
    );
    expect(doc.status).toBe('needs_review');
    expect(doc.counts.rowsByLevel).toEqual({
      high: 1,
      medium: 0,
      low: 1,
      unreadable: 1,
    });
    expect(confidenceSummary(doc.counts)).toBe('1 high · 1 low · 1 unreadable');
    expect(doc.plan.blocked).toBe(2);
    expect(doc.plan.create).toBe(1);
    expect(doc.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['missing_required', 'low_confidence']),
    );
  });

  it('derives the pipeline statuses from the batch, not from a stored label', () => {
    const a = (
      batchStatus: 'processing' | 'failed' | 'completed',
      stage: string | null,
    ) =>
      assessDocument(
        { batchStatus, stage, rows: [], analysis: null },
        ctx,
        noLookup,
      ).status;
    expect(a('processing', 'queued')).toBe('queued');
    expect(a('processing', 'extraction')).toBe('processing');
    expect(a('failed', null)).toBe('failed');
    expect(a('completed', null)).toBe('imported');
  });

  it('treats a document whose every row has been resolved as imported even if a row was skipped', () => {
    const rows = [
      row({
        destination: 'customer',
        data: { name: 'A', phone: '0300-1111111' },
        result: { status: 'created', at: 'x', jobId: 'J' },
      }),
      row({
        destination: 'customer',
        data: { name: 'B', phone: '0300-2222222' },
        action: 'skip',
      }),
    ];
    expect(
      assessDocument(
        { batchStatus: 'pending', stage: null, rows, analysis: null },
        ctx,
        noLookup,
      ).status,
    ).toBe('imported');
  });
});
