import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { SeoSiteAuditService } from '../seo-site-audit.service';
import { SeoAuditScheduleProcessor } from './seo-audit-schedule.processor';

describe('SeoAuditScheduleProcessor', () => {
  it('claims due work, runs it inside tenant context, and records the result', async () => {
    const now = new Date('2026-09-29T10:00:00.000Z');
    const dueSchedule = {
      id: 'schedule_1',
      businessId: 'business_1',
      enabled: true,
      intervalHours: 168,
      nextRunAt: new Date('2026-09-29T09:00:00.000Z'),
      processingAt: null,
    };
    const findMany = jest.fn().mockResolvedValue([dueSchedule]);
    const findFirst = jest.fn().mockResolvedValue({
      enabled: true,
      intervalHours: 168,
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditRun = { id: 'audit_1', status: 'completed', error: null };
    const runAudit = jest.fn().mockResolvedValue(auditRun);
    const cls = {
      run: async (callback: () => Promise<unknown>) => callback(),
      set: jest.fn(),
    };
    const processor = new SeoAuditScheduleProcessor(
      {
        seoAuditSchedule: { findMany, findFirst, updateMany },
      } as unknown as PrismaService,
      cls as unknown as ClsService,
      { run: runAudit } as unknown as SeoSiteAuditService,
    );

    await processor.runDue(now);

    expect(cls.set).toHaveBeenCalledWith('businessId', 'business_1');
    expect(runAudit).toHaveBeenCalledWith('business_1', 'schedule');
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'schedule_1', businessId: 'business_1', processingAt: now },
      select: { enabled: true, intervalHours: true },
    });
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: 'schedule_1',
          businessId: 'business_1',
          processingAt: now,
        },
        data: expect.objectContaining({
          lastRunId: 'audit_1',
          lastStatus: 'completed',
          processingAt: null,
        }),
      }),
    );
  });

  it('does not run when another worker has already claimed the due schedule', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'schedule_1',
        businessId: 'business_1',
        enabled: true,
        intervalHours: 24,
        nextRunAt: new Date('2026-09-29T09:00:00.000Z'),
        processingAt: null,
      },
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const runAudit = jest.fn();
    const processor = new SeoAuditScheduleProcessor(
      {
        seoAuditSchedule: { findMany, updateMany },
      } as unknown as PrismaService,
      {
        run: (callback: () => Promise<unknown>) => callback(),
      } as unknown as ClsService,
      { run: runAudit } as unknown as SeoSiteAuditService,
    );

    await processor.runDue(new Date('2026-09-29T10:00:00.000Z'));

    expect(runAudit).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
