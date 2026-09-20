import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LocaleService } from '../common/localization/locale.service';
import { CommissionsService } from '../staff/commissions.service';
import { CreditService } from '../credit/credit.service';
import type { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import type { S3Service } from '../common/storage/s3.service';
import type { SendGateService } from '../messaging/send-gate.service';
import type { AuditService } from '../common/audit/audit.service';
import type { ActivityService } from '../activity/activity.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SYSTEM_ROLE_CAPABILITIES } from '../common/capabilities/capabilities.constants';

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only and breaks ts-jest's
// per-file CommonJS transform — same issue already worked around in qr-poster.service.spec.ts.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { ReportsService } from './reports.service';
import { ReportRunsService } from './report-runs.service';
import { ReportBuildersService } from './report-builders.service';
import { TaxReportsService } from './tax-reports.service';
import type { ReportData } from './report-data.types';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
  run<T>(fn: () => T): T {
    return fn();
  }
}

describe('Reports module', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let reports: ReportsService;
  let runs: ReportRunsService;
  let tax: TaxReportsService;
  let businessId: string;
  let otherBusinessId: string;
  let ownerUserId: string;
  let ownerBusinessUserId: string;
  let staffUserId: string;
  let staffBusinessUserId: string;
  const month = '2025-06';

  const pdfRenderer = {
    renderPdf: jest.fn<Promise<Buffer>, [string]>().mockResolvedValue(Buffer.from('pdf-bytes')),
  };
  const s3 = {
    uploadAndSign: jest.fn().mockResolvedValue('https://signed.example/report'),
    getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/fresh'),
  };
  const sendGate = { send: jest.fn().mockResolvedValue({ id: 'msg-1', channel: 'email' }) };
  const notifications = { create: jest.fn().mockResolvedValue(null) };
  const aiInfra = { complete: jest.fn() };

  const authFor = (role: Role, sub: string, home = businessId): AuthenticatedUser => ({
    sub,
    businessId: home,
    role,
    capabilities: SYSTEM_ROLE_CAPABILITIES[role],
  });
  const asOwner = () => authFor(Role.owner, ownerUserId);
  const asStaff = () => authFor(Role.staff, staffUserId);

  async function snapshotOf(id: string): Promise<ReportData> {
    const row = await prisma.reportRun.findUniqueOrThrow({ where: { id } });
    return row.snapshot as unknown as ReportData;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    const locale = new LocaleService();
    const builders = new ReportBuildersService(
      prisma,
      locale,
      cls as unknown as ClsService,
      new CommissionsService(
        tenantPrisma,
        { log: jest.fn() } as unknown as AuditService,
        { create: jest.fn() } as unknown as NotificationsService,
      ),
      new CreditService(
        tenantPrisma,
        cls as unknown as ClsService,
        { log: jest.fn() } as unknown as AuditService,
        { record: jest.fn() } as unknown as ActivityService,
      ),
    );
    runs = new ReportRunsService(
      prisma,
      cls as unknown as ClsService,
      locale,
      s3 as unknown as S3Service,
      pdfRenderer as unknown as PdfRendererService,
      builders,
      sendGate as unknown as SendGateService,
      aiInfra as unknown as AiInfraService,
    );
    reports = new ReportsService(runs);
    tax = new TaxReportsService(prisma, builders, s3 as unknown as S3Service, notifications as unknown as NotificationsService);

    const business = await prisma.business.create({
      data: { name: 'Reports Test Biz', slug: `reports-test-${Date.now()}`, currency: 'USD' },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const other = await prisma.business.create({
      data: { name: 'Someone Else', slug: `reports-other-${Date.now()}` },
    });
    otherBusinessId = other.id;

    const ownerUser = await prisma.user.create({
      data: { name: 'Report Owner', email: `report-owner-${Date.now()}@example.com`, phone: `+1555${Date.now()}`, passwordHash: 'x' },
    });
    ownerUserId = ownerUser.id;
    ownerBusinessUserId = (await prisma.businessUser.create({ data: { businessId, userId: ownerUserId, role: Role.owner } })).id;
    const staffUser = await prisma.user.create({
      data: { name: 'Report Staff', email: `report-staff-${Date.now()}@example.com`, phone: `+1556${Date.now()}`, passwordHash: 'x' },
    });
    staffUserId = staffUser.id;
    staffBusinessUserId = (
      await prisma.businessUser.create({
        data: { businessId, userId: staffUserId, role: Role.staff, commissionRule: { type: 'percent', value: 10 } },
      })
    ).id;

    const customer = await prisma.customer.create({
      data: { businessId, name: 'Report Customer', phone: `+1557${Date.now()}` },
    });
    const at = new Date('2025-06-15T00:00:00Z');
    // Two internally consistent orders: total = subtotal − discount + tax, lines add up to the
    // header, and the line cost adds up to the order's cost.
    const make = async (orderNo: number, staff: string, price: number, cost: number) => {
      const o = await prisma.order.create({
        data: { businessId, orderNo, status: 'completed', orderType: 'counter', customerId: customer.id, staffUserId: staff, subtotal: price, total: price, cogs: cost, createdAt: at },
      });
      await prisma.orderItem.create({ data: { orderId: o.id, name: `Item ${orderNo}`, price, cost, qty: 1 } });
    };
    await make(9001, ownerBusinessUserId, 100, 40);
    await make(9002, staffBusinessUserId, 50, 20);
    await prisma.expense.create({ data: { businessId, description: 'Rent', category: 'Rent', amount: 30, incurredOn: at } });

    // Another business with a big order in the SAME month — must never leak into ours.
    const foreign = await prisma.order.create({
      data: { businessId: otherBusinessId, orderNo: 1, status: 'completed', orderType: 'counter', subtotal: 5000, total: 5000, createdAt: at },
    });
    await prisma.orderItem.create({ data: { orderId: foreign.id, name: 'Foreign', price: 5000, cost: 0, qty: 1 } });
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    s3.uploadAndSign.mockClear();
    s3.getSignedDownloadUrl.mockClear();
    sendGate.send.mockClear();
    notifications.create.mockClear();
    aiInfra.complete.mockReset();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    for (const id of [businessId, otherBusinessId]) {
      await prisma.reportRun.deleteMany({ where: { businessId: id } });
      await prisma.reportFavorite.deleteMany({ where: { businessId: id } });
      await prisma.taxFiling.deleteMany({ where: { businessId: id } });
      await prisma.taxReminder.deleteMany({ where: { businessId: id } });
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.return.deleteMany({ where: { businessId: id } });
      await prisma.orderItem.deleteMany({ where: { order: { businessId: id } } });
      await prisma.order.deleteMany({ where: { businessId: id } });
      await prisma.expense.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.businessUser.deleteMany({ where: { businessId: id } });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, staffUserId] } } });
    await prisma.$disconnect();
  });

  describe('generation, versions and validation', () => {
    it('generates a monthly report: real figures, a stored run, a PDF upload and an audit entry', async () => {
      const { url, run } = await reports.generate('monthly', month, asOwner());
      expect(url).toBe('https://signed.example/report');
      expect(run).toMatchObject({ kind: 'monthly', period: month, version: 1, status: 'ready', trigger: 'manual', generatedByName: 'Report Owner' });
      expect(s3.uploadAndSign).toHaveBeenCalledWith(`reports/${businessId}/monthly-${month}-v1.pdf`, expect.any(Buffer), 'application/pdf');
      expect(pdfRenderer.renderPdf.mock.calls[0][0]).toContain('$150');

      const data = await snapshotOf(run.id);
      expect(data.metrics).toMatchObject({ revenue: 150, cogs: 60, grossProfit: 90, expenses: 30, netProfit: 60, orders: 2 });
      expect(data.validation.status).toBe('reconciled');

      const events = await prisma.auditLog.findMany({ where: { businessId, entity: 'report_run', entityId: run.id } });
      expect(events.map((e) => e.action)).toEqual(['report.generated']);
    });

    it('regenerating adds a new version alongside the old one instead of overwriting it', async () => {
      const first = await reports.generate('pnl', month, asOwner());
      const second = await reports.generate('pnl', month, asOwner());
      expect([first.run.version, second.run.version]).toEqual([1, 2]);
      expect(await prisma.reportRun.count({ where: { businessId, kind: 'pnl', period: month } })).toBe(2);

      const detail = await runs.getRun(businessId, second.run.id);
      expect(detail.versions.map((v) => v.version)).toEqual([2, 1]);
      expect(detail.kpiChanges.length).toBeGreaterThan(0);
    });

    it('P&L nets real expenses by category', async () => {
      const { run } = await reports.generate('pnl', month, asOwner());
      const data = await snapshotOf(run.id);
      expect(data.metrics.netProfit).toBe(60);
      expect(data.table?.rows).toEqual([{ category: 'Rent', entries: '1', amount: '$30.00', share: '100.0%' }]);
    });

    it('flags a real inconsistency instead of hiding it: an order whose header does not match its lines is critical', async () => {
      const broken = await prisma.order.create({
        data: { businessId, orderNo: 9100, status: 'completed', orderType: 'counter', subtotal: 80, total: 80, createdAt: new Date('2025-07-10T00:00:00Z') },
      });
      try {
        const { run } = await reports.generate('sales', '2025-07', asOwner());
        const data = await snapshotOf(run.id);
        expect(data.validation.status).toBe('critical');
        expect(data.validation.checks.find((c) => c.label.startsWith('Order subtotals vs'))?.tone).toBe('neg');
        expect(run.validationStatus).toBe('critical');
      } finally {
        await prisma.order.delete({ where: { id: broken.id } });
      }
    });

    it('lists products sold with no cost as an exclusion (warning), not as free', async () => {
      const o = await prisma.order.create({
        data: { businessId, orderNo: 9200, status: 'completed', orderType: 'counter', subtotal: 40, total: 40, cogs: 0, createdAt: new Date('2025-08-10T00:00:00Z') },
      });
      const product = await prisma.product.create({ data: { businessId, name: 'No-cost thing' } });
      await prisma.orderItem.create({ data: { orderId: o.id, productId: product.id, name: 'No-cost thing', price: 40, cost: 0, qty: 1 } });
      try {
        const { run } = await reports.generate('monthly', '2025-08', asOwner());
        expect(run.validationStatus).toBe('warning');
        expect(run.exclusionsCount).toBe(1);
      } finally {
        await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
        await prisma.order.delete({ where: { id: o.id } });
        await prisma.product.delete({ where: { id: product.id } });
      }
    });

    it('never mixes another business into a report, even from a background job with no tenant bound', async () => {
      // A scheduled run has no request-bound tenant; queries must still be scoped explicitly.
      cls.set(CLS_KEY_BUSINESS_ID, undefined);
      const { run } = await runs.generate({ businessId, kind: 'sales', month, actor: { userId: ownerUserId, role: Role.owner }, trigger: 'schedule' });
      const data = await snapshotOf(run.id);
      expect(data.metrics.revenue).toBe(150);
      expect(data.metrics.orders).toBe(2);
      expect(run.trigger).toBe('schedule');
    });

    it('sales report is scoped to a staff caller\'s own orders', async () => {
      const { run } = await reports.generate('sales', month, asStaff());
      const data = await snapshotOf(run.id);
      expect(data.table?.rows.map((r) => r.order)).toEqual(['#9002']);
    });

    it('owner sees staff via the real commissions service; a staff caller is refused', async () => {
      const { run } = await reports.generate('staff', month, asOwner());
      expect((await snapshotOf(run.id)).table?.rows.map((r) => r.name)).toContain('Report Staff');
      await expect(reports.generate('staff', month, asStaff())).rejects.toBeInstanceOf(AppException);
    });

    it('refuses a report the role may not generate, without recording a failed run', async () => {
      const before = await prisma.reportRun.count({ where: { businessId } });
      await expect(reports.generate('credit_recovery', month, authFor(Role.manager, ownerUserId))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REPORT_FORBIDDEN' }) });
      expect(await prisma.reportRun.count({ where: { businessId } })).toBe(before);
    });

    it('records a failed run with its real reason, and generates nothing in its place', async () => {
      pdfRenderer.renderPdf.mockRejectedValueOnce(new Error('renderer crashed'));
      await expect(reports.generate('reviews', month, asOwner())).rejects.toBeInstanceOf(AppException);
      const failed = await prisma.reportRun.findFirst({ where: { businessId, kind: 'reviews', status: 'failed' } });
      expect(failed?.errorMessage).toContain('renderer crashed');
      expect(failed?.fileKey).toBeNull();
      await expect(runs.download(businessId, ownerUserId, failed!.id)).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('library, favourites, downloads, delivery, explain', () => {
    it('library returns every report with its latest run and real KPI counts', async () => {
      const period = '2025-09';
      await reports.generate('monthly', period, asOwner());
      const lib = await runs.library(businessId, Role.owner, ownerUserId, period);
      const monthly = lib.reports.find((r) => r.kind === 'monthly')!;
      expect(monthly.latest?.status).toBe('ready');
      expect(lib.reports.find((r) => r.kind === 'tax')!.latest).toBeNull();
      expect(lib.kpis.available).toBe(10);
      expect(lib.kpis.ready).toBe(1);
      expect(lib.reports.every((r) => r.allowed)).toBe(true);

      const staffLib = await runs.library(businessId, Role.staff, staffUserId, period);
      expect(staffLib.kpis.available).toBeLessThan(10);
      expect(staffLib.reports.find((r) => r.kind === 'credit_recovery')!.allowed).toBe(false);
    });

    it('toggles a favourite per user', async () => {
      expect(await runs.toggleFavorite(businessId, ownerUserId, 'sales')).toEqual({ favorite: true });
      expect((await runs.library(businessId, Role.owner, ownerUserId)).reports.find((r) => r.kind === 'sales')!.favorite).toBe(true);
      expect((await runs.library(businessId, Role.owner, staffUserId)).reports.find((r) => r.kind === 'sales')!.favorite).toBe(false);
      expect(await runs.toggleFavorite(businessId, ownerUserId, 'sales')).toEqual({ favorite: false });
    });

    it('download signs a fresh link and is recorded in the audit trail', async () => {
      const { run } = await reports.generate('monthly', month, asOwner());
      expect(await runs.download(businessId, ownerUserId, run.id)).toEqual({ url: 'https://signed.example/fresh' });
      const trail = await runs.audit_trail(businessId, run.id);
      expect(trail.events.map((e) => e.action)).toEqual(['report.generated', 'report.downloaded']);
      expect(trail.events[1].actorName).toBe('Report Owner');
    });

    it('send records the message id, so the shown state is the channel\'s own; only an owner may send to someone else', async () => {
      const { run } = await reports.generate('monthly', month, asOwner());
      const sent = await runs.send(businessId, { userId: ownerUserId, role: Role.owner }, run.id, { email: 'accountant@example.com' });
      expect(sent).toMatchObject({ channel: 'email', state: 'queued', recipient: 'accountant@example.com' });
      expect(sendGate.send).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'report_ready', to: { email: 'accountant@example.com' } }));

      const detail = await runs.getRun(businessId, run.id);
      expect(detail.deliveries).toHaveLength(1);
      expect(detail.deliveries[0].recipient).toBe('accountant@example.com');

      await expect(
        runs.send(businessId, { userId: staffUserId, role: Role.manager }, run.id, { email: 'someone@example.com' }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('a send that fails is recorded with its reason, never dropped', async () => {
      const { run } = await reports.generate('monthly', month, asOwner());
      sendGate.send.mockRejectedValueOnce(new Error('quota reached'));
      await expect(runs.send(businessId, { userId: ownerUserId, role: Role.owner }, run.id)).rejects.toBeInstanceOf(AppException);
      const detail = await runs.getRun(businessId, run.id);
      expect(detail.deliveries.at(-1)).toMatchObject({ state: 'failed', error: 'quota reached' });
    });

    it('explain reports real per-product contributors whose sum matches the total change', async () => {
      const { run } = await reports.generate('monthly', month, asOwner());
      const explained = await runs.explain(businessId, run.id);
      expect(explained.rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Data period', 'Total change in product gross profit', 'Contains forecast']));
      expect(explained.rows.find((r) => r.label === 'Total change in product gross profit')!.value).toContain('90');
      expect(explained.confidence).toBe('reconciled');
    });

    it('AI builder maps a request onto a supported report, and refuses what does not exist', async () => {
      aiInfra.complete.mockResolvedValueOnce('{"kind":"product_performance","month":"2025-06","unsupportedReason":null}');
      const ok = await runs.parseRequest(businessId, Role.owner, 'top 20 products by profit in june');
      expect(ok).toMatchObject({ supported: true, kind: 'product_performance', month: '2025-06', allowed: true });

      aiInfra.complete.mockResolvedValueOnce('{"kind":"made_up","month":"2025-06","unsupportedReason":"nope"}');
      expect(await runs.parseRequest(businessId, Role.owner, 'something odd')).toMatchObject({ supported: false });

      aiInfra.complete.mockResolvedValueOnce('{"kind":"credit_recovery","month":"2025-06","unsupportedReason":null}');
      expect(await runs.parseRequest(businessId, Role.manager, 'credit')).toMatchObject({ supported: true, allowed: false });
    });

    it('branch-aware: the report is for the business the caller is acting as (CLS), not their home business', () => {
      cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
      expect(runs.activeBusinessId(businessId)).toBe(otherBusinessId);
      cls.set(CLS_KEY_BUSINESS_ID, undefined);
      expect(runs.activeBusinessId(businessId)).toBe(businessId);
    });
  });

  describe('Tax reports', () => {
    let taxBusinessId: string;

    beforeAll(async () => {
      const business = await prisma.business.create({
        data: { name: 'Tax Report Test Biz', slug: `tax-report-test-${Date.now()}`, taxRate: 8.5, taxLabel: 'VAT', taxFilingDay: 20 },
      });
      taxBusinessId = business.id;
      const mk = (orderNo: number, subtotal: number, taxAmt: number, status: 'completed' | 'cancelled', day: number) =>
        prisma.order.create({
          data: { businessId: taxBusinessId, orderNo, status, orderType: 'counter', subtotal, tax: taxAmt, total: subtotal + taxAmt, createdAt: new Date(`2025-06-${day}T00:00:00Z`) },
        });
      await mk(1, 100, 8.5, 'completed', 15);
      await mk(2, 50, 4.25, 'completed', 20);
      await mk(3, 1000, 85, 'cancelled', 22);
    });

    afterAll(async () => {
      await prisma.taxFiling.deleteMany({ where: { businessId: taxBusinessId } });
      await prisma.taxReminder.deleteMany({ where: { businessId: taxBusinessId } });
      await prisma.auditLog.deleteMany({ where: { businessId: taxBusinessId } });
      await prisma.return.deleteMany({ where: { businessId: taxBusinessId } });
      await prisma.orderItem.deleteMany({ where: { order: { businessId: taxBusinessId } } });
      await prisma.order.deleteMany({ where: { businessId: taxBusinessId } });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: taxBusinessId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    });

    it('summary returns real figures, excluding orders that are not completed', async () => {
      const s = await tax.summary(taxBusinessId, month);
      expect(s).toMatchObject({ taxLabel: 'VAT', taxRate: 8.5, periodLabel: '1–30 June 2025' });
      expect(s.kpis).toMatchObject({ taxableSales: 150, taxCollected: 12.75, netTax: 12.75, taxOnPurchasesTracked: false, transactions: 2 });
    });

    it('trend is eight real months ending on the period; only the current month is labelled partial', async () => {
      const s = await tax.summary(taxBusinessId, month);
      expect(s.trend).toHaveLength(8);
      expect(s.trend[7]).toMatchObject({ period: month, taxCollected: 12.75, partial: false });
      expect(s.trend[0].period).toBe('2024-11');
    });

    it('lists a transaction with no recorded tax rate on its own line and flags it, never assuming zero-rated', async () => {
      const s = await tax.summary(taxBusinessId, month);
      // Orders 1 and 2 have no lines at all, so nothing is rated or unrated yet.
      expect(s.rows.filter((r) => r.period === month)).toEqual([]);

      const o = await prisma.order.create({ data: { businessId: taxBusinessId, orderNo: 4, status: 'completed', orderType: 'counter', subtotal: 300, tax: 38.5, total: 338.5, createdAt: new Date('2025-06-25T00:00:00Z') } });
      await prisma.orderItem.createMany({
        data: [
          { orderId: o.id, name: 'A', price: 100, cost: 0, qty: 1, taxRatePercent: 8.5 },
          { orderId: o.id, name: 'B', price: 150, cost: 0, qty: 1, taxRatePercent: 15 },
          { orderId: o.id, name: 'Old row', price: 50, cost: 0, qty: 1 },
        ],
      });
      const after = await tax.summary(taxBusinessId, month);
      const june = after.rows.filter((r) => r.period === month);
      expect(june.find((r) => r.ratePercent === 8.5)).toMatchObject({ taxable: 100, collected: 8.5, orders: 1 });
      expect(june.find((r) => r.ratePercent === 15)).toMatchObject({ taxable: 150, collected: 22.5, orders: 1 });
      expect(june.find((r) => r.rateLabel === 'No rate recorded')).toMatchObject({ taxable: 50, collected: null, status: 'Needs review', statusTone: 'red' });
      expect(after.issues[0]).toMatchObject({ key: 'no-rate', tone: 'red' });
    });

    it('counts approved returns as information only, not netted', async () => {
      const order = await prisma.order.findFirstOrThrow({ where: { businessId: taxBusinessId, orderNo: 1 } });
      await prisma.return.create({ data: { businessId: taxBusinessId, orderId: order.id, reason: 'Damaged', refundMethod: 'cash', refundAmount: 10, status: 'approved', createdAt: new Date('2025-06-26T00:00:00Z') } });
      const s = await tax.summary(taxBusinessId, month);
      expect(s.kpis.refundsApproved).toEqual({ amount: 10, count: 1 });
      expect(s.kpis.netTax).toBe(51.25);
    });

    it('records a return as filed once, and moves the next filing on to the following period', async () => {
      const before = await tax.summary(taxBusinessId);
      const filedPeriod = before.filing.forPeriod;
      const result = await tax.recordFiling(taxBusinessId, ownerUserId, { period: filedPeriod, filedOn: '2025-07-19', reference: 'REF-1' });
      expect(result.period).toBe(filedPeriod);
      await expect(tax.recordFiling(taxBusinessId, ownerUserId, { period: filedPeriod, filedOn: '2025-07-19' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TAX_ALREADY_FILED' }) });
      const after = await tax.summary(taxBusinessId);
      expect(after.filing.forPeriod).not.toBe(filedPeriod);
      expect(after.filing.filedPeriods[0]).toMatchObject({ period: filedPeriod, reference: 'REF-1' });
      expect(after.filing.day).toBe(20);
    });

    it('validates the configurable filing day', async () => {
      await expect(tax.setFilingDay(taxBusinessId, 31)).rejects.toBeInstanceOf(AppException);
      expect(await tax.setFilingDay(taxBusinessId, 12)).toEqual({ day: 12 });
    });

    it('a reminder is a real record; the daily job notifies once when it comes due, then never again', async () => {
      const summary = await tax.summary(taxBusinessId);
      const { remindOn } = await tax.remind(taxBusinessId, ownerUserId, summary.filing.forPeriod);
      expect(remindOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await expect(tax.remind(taxBusinessId, ownerUserId, '1999-01')).rejects.toBeInstanceOf(AppException);

      const due = new Date(`${remindOn}T12:00:00Z`);
      expect(await tax.processDueReminders(due)).toBe(1);
      expect(notifications.create).toHaveBeenCalledWith(taxBusinessId, ownerUserId, expect.objectContaining({ link: '/reports/tax' }), 'tax_filing_reminder');
      expect(await tax.processDueReminders(due)).toBe(0);
    });

    it('generates the tax PDF with the business\'s own label and says purchases are not tracked', async () => {
      const { run } = await runs.generate({ businessId: taxBusinessId, kind: 'tax', month, actor: { userId: ownerUserId, role: Role.owner } });
      const html = pdfRenderer.renderPdf.mock.calls[0][0];
      expect(html).toContain('VAT');
      expect(html).toContain('Not tracked');
      expect((await snapshotOf(run.id)).validation.status).toBe('warning');
    });

    it('excel export returns a signed link', async () => {
      expect((await tax.excel(taxBusinessId, month)).url).toBe('https://signed.example/report');
      expect(s3.uploadAndSign).toHaveBeenCalledWith(expect.stringContaining('.xlsx'), expect.any(Buffer), expect.stringContaining('spreadsheetml'));
    });
  });
});
