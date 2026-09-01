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
import type { ReportsService } from '../reports/reports.service';
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
  const reportsService = {
    generate: jest
      .fn<Promise<{ url: string }>, unknown[]>()
      .mockResolvedValue({ url: 'https://signed.example/report.pdf' }),
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
      reportsService as unknown as ReportsService,
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
    reportsService.generate.mockClear();
    sendGate.send.mockClear();
    notifications.create.mockClear();
  });

  afterAll(async () => {
    await prisma.scheduledExport.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
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
      });

      const ran = await service.runDueSchedules(new Date());
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
    });

    it('never re-runs a weekly schedule inside the same 7-day window', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'customers',
        format: 'xlsx',
        frequency: 'weekly',
      });
      const now = new Date();
      await service.runDueSchedules(now);
      exportsService.generate.mockClear();

      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await service.runDueSchedules(threeDaysLater);
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
      });
      const now = new Date();
      await service.runDueSchedules(now);
      exportsService.generate.mockClear();

      const eightDaysLater = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
      await service.runDueSchedules(eightDaysLater);
      expect(exportsService.generate).toHaveBeenCalledWith(
        businessId,
        'expenses',
        'xlsx',
      );

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });

    it('never runs a paused (inactive) schedule', async () => {
      const schedule = await service.create(businessId, userId, {
        kind: 'credit',
        format: 'xlsx',
        frequency: 'weekly',
      });
      await service.update(schedule.id, { active: false });
      exportsService.generate.mockClear();

      await service.runDueSchedules(new Date());
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

    it('runDueSchedules() generates the real report through ReportsService, not ExportsService', async () => {
      const schedule = await service.create(businessId, userId, {
        reportKind: 'sales',
        format: 'pdf',
        frequency: 'weekly',
      });

      const ran = await service.runDueSchedules(new Date());
      expect(ran).toBeGreaterThanOrEqual(1);
      expect(reportsService.generate).toHaveBeenCalledWith(
        'sales',
        undefined,
        expect.objectContaining({ businessId }),
      );
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
        recipients: [
          { email: 'accountant@example.com' },
          { phone: '+14155550000' },
        ],
      });

      await service.runDueSchedules(new Date());

      expect(sendGate.send).toHaveBeenCalledTimes(2);
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          templateKey: 'report_ready',
          to: { phone: undefined, email: 'accountant@example.com' },
        }),
      );
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: { phone: '+14155550000', email: undefined },
        }),
      );
      expect(notifications.create).not.toHaveBeenCalled();

      await prisma.scheduledExport.delete({ where: { id: schedule.id } });
    });
  });
});
