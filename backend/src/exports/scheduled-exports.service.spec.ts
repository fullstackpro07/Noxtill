// exports.service.ts pulls in PdfRendererService -> puppeteer, an ESM-only package ts-jest's
// CommonJS transform can't parse (same pattern as receipts.service.spec.ts / exports.service.spec.ts).
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ScheduledExportsService } from './scheduled-exports.service';
import type { ExportsService } from './exports.service';
import type { ReportRunsService } from '../reports/report-runs.service';
import { currentMonth } from '../reports/reports.types';
import type { SendGateService } from '../messaging/send-gate.service';
import type { NotificationsService } from '../notifications/notifications.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ScheduledExportsService (UPD-FE-071 recurring export)', () => {
  let prisma: PrismaService;
  let service: ScheduledExportsService;
  let businessId: string;
  let userId: string;
  const exportsService = {
    generate: jest
      .fn<Promise<{ url: string }>, [string, string, string]>()
      .mockResolvedValue({ url: 'https://signed.example/scheduled.xlsx' }),
  };
  const reportRuns = {
    generate: jest
      .fn<Promise<{ url: string; run: { id: string } }>, unknown[]>()
      .mockResolvedValue({
        url: 'https://signed.example/report.pdf',
        run: { id: 'run-1' },
      }),
    send: jest.fn().mockResolvedValue({ channel: 'email', state: 'queued' }),
  };

  // A schedule is anchored to a weekday, so "due" is decided against a fixed reference moment:
  // noon, `days` from today. Its weekday is what the schedule is created on.
  const at = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    return d;
  };
  const sendGate = { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ScheduledExportsService(
      tenantPrisma,
      prisma,
      exportsService as unknown as ExportsService,
      reportRuns as unknown as ReportRunsService,
      sendGate as unknown as SendGateService,
      notifications as unknown as NotificationsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Scheduled Exports Test Biz',
        slug: `scheduled-exports-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'Owner',
        phone: `+1415699${String(Date.now()).slice(-4)}`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterEach(() => {
    exportsService.generate.mockClear();
    reportRuns.generate.mockClear();
    reportRuns.send.mockClear();
    sendGate.send.mockClear();
    notifications.create.mockClear();
  });

  afterAll(async () => {
    await prisma.scheduledExport.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates a real schedule and lists it back', async () => {
    const created = await service.create(businessId, userId, {
      kind: 'products',
      format: 'xlsx',
      frequency: 'weekly',
    });
    expect(created.active).toBe(true);
    expect(created.lastRunAt).toBeNull();

    const list = await service.list();
    expect(list.map((s) => s.id)).toContain(created.id);
  });

  it('update() can pause a real schedule', async () => {
    const created = await service.create(businessId, userId, {
      kind: 'stock',
      format: 'csv',
      frequency: 'monthly',
    });
    const updated = await service.update(created.id, { active: false });
    expect(updated.active).toBe(false);
  });

  it('remove() deletes a real schedule', async () => {
    const created = await service.create(businessId, userId, {
      kind: 'sales',
      format: 'xlsx',
      frequency: 'weekly',
    });
    await service.remove(created.id);
    await expect(
      service.update(created.id, { active: false }),
    ).rejects.toThrow();
  });

  describe('runDueSchedules()', () => {
    it('runs a real never-run schedule, generates a real export, and notifies the creator', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'products',
        format: 'pdf',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
      });

      const ran = await service.runDueSchedules(at(8));
      expect(ran).toBeGreaterThanOrEqual(1);
      expect(exportsService.generate).toHaveBeenCalledWith(
        businessId,
        'products',
        'pdf',
      );
      expect(notifications.create).toHaveBeenCalledWith(
        businessId,
        userId,
        expect.objectContaining({
          link: 'https://signed.example/scheduled.xlsx',
        }),
        'scheduled_delivery_ready',
      );

      const refreshed = await prisma.scheduledExport.findUniqueOrThrow({
        where: { id: schedule.id },
      });
      expect(refreshed.lastRunAt).not.toBeNull();
      expect(refreshed.lastResult).toBe('sent');
      expect(refreshed.lastError).toBeNull();
    });

    it('does not run a brand-new weekly schedule before its first weekday arrives', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'stock',
        format: 'xlsx',
        frequency: 'weekly',
        dayOfWeek: at(3).getDay(),
      });
      exportsService.generate.mockClear();
      await service.runDueSchedules(at(1));
      expect(
        exportsService.generate.mock.calls.some((c) => c[1] === 'stock'),
      ).toBe(false);
      await service.runDueSchedules(at(3));
      expect(
        exportsService.generate.mock.calls.some((c) => c[1] === 'stock'),
      ).toBe(true);
      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });

    it('never re-runs a weekly schedule inside the same 7-day window', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'customers',
        format: 'xlsx',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
      });
      await service.runDueSchedules(at(8));
      exportsService.generate.mockClear();

      await service.runDueSchedules(at(11));
      const stillNotCalledForThisSchedule =
        !exportsService.generate.mock.calls.some(
          (call) => call[1] === 'customers',
        );
      expect(stillNotCalledForThisSchedule).toBe(true);

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });

    it('re-runs a weekly schedule once 7+ real days have passed', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'expenses',
        format: 'xlsx',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
      });
      await service.runDueSchedules(at(8));
      exportsService.generate.mockClear();

      await service.runDueSchedules(at(15));
      expect(exportsService.generate).toHaveBeenCalledWith(
        businessId,
        'expenses',
        'xlsx',
      );

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });

    it('never stamps lastRunAt when delivery genuinely fails, so it retries on the next check (Reports depth fix, UPD-INT-015)', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'sales',
        format: 'xlsx',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
      });

      notifications.create.mockRejectedValueOnce(new Error('DB down'));
      const ranWhileFailing = await service.runDueSchedules(at(8));
      expect(ranWhileFailing).toBe(0);

      const afterFailure = await prisma.scheduledExport.findUniqueOrThrow({
        where: { id: schedule.id },
      });
      expect(afterFailure.lastRunAt).toBeNull(); // not falsely marked "run"
      expect(afterFailure.lastResult).toBe('failed');
      expect(afterFailure.lastError).toBe('DB down');

      // A real retry on the very next check (not a full week later) now succeeds.
      exportsService.generate.mockClear();
      const ranOnRetry = await service.runDueSchedules(at(8));
      expect(ranOnRetry).toBeGreaterThanOrEqual(1);
      const afterRetry = await prisma.scheduledExport.findUniqueOrThrow({
        where: { id: schedule.id },
      });
      expect(afterRetry.lastRunAt).not.toBeNull();

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });

    it('never runs a paused (inactive) schedule', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'credit',
        format: 'xlsx',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
      });
      await service.update(schedule.id, { active: false });
      exportsService.generate.mockClear();

      await service.runDueSchedules(at(8));
      const calledForCredit = exportsService.generate.mock.calls.some(
        (call) => call[1] === 'credit',
      );
      expect(calledForCredit).toBe(false);
    });
  });

  describe('reportKind scheduling (UPD-BE-116)', () => {
    it('rejects a schedule with neither kind nor reportKind', async () => {
      await expect(
        service.create(businessId, userId, {
          format: 'xlsx',
          frequency: 'weekly',
        }),
      ).rejects.toThrow();
    });

    it('rejects a schedule with both kind and reportKind', async () => {
      await expect(
        service.create(businessId, userId, {
          kind: 'products',
          reportKind: 'pnl',
          format: 'xlsx',
          frequency: 'weekly',
        }),
      ).rejects.toThrow();
    });

    it('creates a real report schedule and forces format to pdf regardless of what was passed', async () => {
      const created = await service.create(businessId, userId, {
        reportKind: 'pnl',
        format: 'csv',
        frequency: 'monthly',
      });
      expect(created.reportKind).toBe('pnl');
      expect(created.kind).toBeNull();
      expect(created.format).toBe('pdf');

      await prisma.scheduledExport.delete({ where: { id: created.id } });
    });

    it('runDueSchedules() generates the real report through the run service for this business, not ExportsService', async () => {
      const schedule = await service.create(businessId, userId, {
        reportKind: 'sales',
        format: 'pdf',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
      });

      const ran = await service.runDueSchedules(at(8));
      expect(ran).toBeGreaterThanOrEqual(1);
      expect(reportRuns.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          kind: 'sales',
          month: currentMonth(),
          trigger: 'schedule',
          scheduleId: schedule.id,
        }),
      );
      const after = await prisma.scheduledExport.findUniqueOrThrow({
        where: { id: schedule.id },
      });
      expect(after.lastReportRunId).toBe('run-1');
      expect(exportsService.generate).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        businessId,
        userId,
        expect.objectContaining({ link: 'https://signed.example/report.pdf' }),
        'scheduled_delivery_ready',
      );

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });

    it('delivers to explicit recipients via SendGateService instead of the in-app notification when recipients are set', async () => {
      const schedule = await service.create(businessId, userId, {
        reportKind: 'monthly',
        format: 'pdf',
        frequency: 'weekly',
        dayOfWeek: at(8).getDay(),
        recipients: [
          { email: 'accountant@example.com' },
          { phone: '+14155550000' },
        ],
      });

      await service.runDueSchedules(at(8));

      // Sent through the run itself, so each delivery is stored with its real message id.
      expect(reportRuns.send).toHaveBeenCalledTimes(2);
      expect(reportRuns.send).toHaveBeenCalledWith(
        businessId,
        { userId, role: 'owner' },
        'run-1',
        { phone: undefined, email: 'accountant@example.com' },
      );
      expect(reportRuns.send).toHaveBeenCalledWith(
        businessId,
        { userId, role: 'owner' },
        'run-1',
        { phone: '+14155550000', email: undefined },
      );
      expect(notifications.create).not.toHaveBeenCalled();

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });
  });

  describe('timing, run-now and listing', () => {
    it('a monthly report schedule covers the previous full month, and list() returns its real next run', async () => {
      const created = await service.create(businessId, userId, {
        reportKind: 'pnl',
        format: 'pdf',
        frequency: 'monthly',
        dayOfMonth: 10,
      });
      const listed = (await service.list()).find((r) => r.id === created.id)!;
      expect(listed.dayOfMonth).toBe(10);
      expect(listed.runHour).toBe(6);
      expect(new Date(listed.nextRunAt!).getDate()).toBe(10);
      expect(listed.period).toMatch(/^\d{4}-\d{2}$/);
      expect(listed.period).not.toBe(currentMonth());

      reportRuns.generate.mockClear();
      const result = await service.runNow(created.id);
      expect(result).toMatchObject({ ok: true, lastResult: 'sent', lastReportRunId: 'run-1' });
      expect(reportRuns.generate).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: 'manual', month: listed.period }),
      );
      await prisma.scheduledExport.delete({ where: { id: created.id } });
    });

    it('records the real reason when a run fails, and reports ok:false', async () => {
      const created = await service.create(businessId, userId, {
        reportKind: 'sales',
        format: 'pdf',
        frequency: 'weekly',
      });
      reportRuns.generate.mockRejectedValueOnce(new Error('renderer crashed'));
      const result = await service.runNow(created.id);
      expect(result).toMatchObject({ ok: false, lastResult: 'failed', lastError: 'renderer crashed' });
      await prisma.scheduledExport.delete({ where: { id: created.id } });
    });

    it('a paused schedule has no next run', async () => {
      const created = await service.create(businessId, userId, {
        reportKind: 'sales',
        format: 'pdf',
        frequency: 'weekly',
      });
      await service.update(created.id, { active: false });
      const listed = (await service.list()).find((r) => r.id === created.id)!;
      expect(listed.nextRunAt).toBeNull();
      await prisma.scheduledExport.delete({ where: { id: created.id } });
    });
  });
});
