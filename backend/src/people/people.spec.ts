import { Fmt } from '../payments/pay-vm';
import { PpDataService, Inp, Data } from './pp-data.service';
import { PpContextService } from './pp-context.service';
import { defaultPpConfig, mergePpConfig, monthlyTax, TaxTable } from './pp.constants';

const table: TaxTable = {
  key: 'Test',
  version: 1,
  effectiveFrom: '2026-07-01',
  slabs: [
    { upTo: 600000, rate: 0, base: 0 },
    { upTo: 1200000, rate: 0.05, base: 0 },
    { upTo: null, rate: 0.15, base: 30000 },
  ],
  nonFilerMultiplier: 2,
  source: 'spec',
};

const inp = (o: Partial<Inp> = {}): Inp => ({
  basis: 'Salaried',
  rate: 150000,
  hours: 0,
  ot: 0,
  otMult: 1.5,
  tsOk: true,
  tsNeeded: false,
  comm: 0,
  commPaidOutside: false,
  commRule: false,
  advances: [],
  adds: [],
  deds: [],
  unpaid: 0,
  prorate: 1,
  taxp: 'Filer',
  bank: 'Bank ••1234',
  rules: [],
  ...o,
});

describe('People & Payroll engine', () => {
  const X = new PpDataService({} as PpContextService);
  const d = { cfg: defaultPpConfig(), fmt: new Fmt('PKR', 'UTC') } as unknown as Data;

  it('applies the configured progressive table per month', () => {
    expect(monthlyTax(table, 40000, false)).toBe(0);
    expect(monthlyTax(table, 142500, false)).toBe(8875);
    expect(monthlyTax(table, 142500, true)).toBe(17750);
  });

  it('calculates gross, pre-tax rules, tax and net from inputs only', () => {
    const c = X.calc(d, inp({ rules: [{ id: 'r', name: 'PF', type: 'Deduction + employer contribution', pp: 'Pre-tax', method: 'Percentage of base', ver: 1, ee: 5, er: 5, fin: null }] }), table);
    expect(c.gross).toBe(150000);
    expect(c.pre).toBe(7500);
    expect(c.tax).toBe(8875);
    expect(c.net).toBe(133625);
    expect(c.er).toBe(7500);
    expect(c.cost).toBe(157500);
  });

  it('deducts unpaid leave and recovers only advances that fit', () => {
    const c = X.calc(d, inp({ unpaid: 2, advances: [{ id: 'a1', amount: 10000 }, { id: 'a2', amount: 999999 }] }), table);
    expect(c.leaveImp).toBeCloseTo(-11538.46, 2);
    expect(c.advIds).toEqual(['a1']);
    expect(c.adv).toBe(10000);
  });

  it('pays hourly staff regular + overtime at the branch multiplier', () => {
    const c = X.calc(d, inp({ basis: 'Hourly', rate: 500, hours: 170, ot: 10, taxp: 'Exempt' }), table);
    expect(c.regular).toBe(80000);
    expect(c.ot).toBe(7500);
    expect(c.tax).toBe(0);
  });

  it('never invents tax: missing profile or table leaves net empty', () => {
    expect(X.calc(d, inp({ taxp: null }), table).net).toBeNull();
    expect(X.calc(d, inp(), null).net).toBeNull();
  });

  it('merges saved settings over defaults without built-in statutory values', () => {
    const c = mergePpConfig({ payroll: { workingDays: 22 } });
    expect(c.payroll.workingDays).toBe(22);
    expect(c.payroll.standardHours).toBe(208);
    expect(c.tax.tables).toEqual([]);
    expect(c.leave.types).toEqual([]);
  });
});
