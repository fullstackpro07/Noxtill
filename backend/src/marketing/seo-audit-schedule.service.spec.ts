import { SeoAuditScheduleService } from './seo-audit-schedule.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { MasterListingService } from '../listings/master-listing.service';
import { AuditService } from '../common/audit/audit.service';

describe('SeoAuditScheduleService', () => {
  it('returns disabled defaults until an owner configures a schedule', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = new SeoAuditScheduleService(
      {
        client: { seoAuditSchedule: { findUnique } },
      } as unknown as TenantPrismaService,
      {} as MasterListingService,
      {} as AuditService,
    );

    await expect(service.get('business_1')).resolves.toMatchObject({
      id: null,
      businessId: 'business_1',
      enabled: false,
      intervalHours: 168,
      configured: false,
      nextRunAt: null,
    });
  });

  it('requires a valid configured website before enabling scheduled crawls', async () => {
    const find = jest.fn().mockResolvedValue({ website: null });
    const service = new SeoAuditScheduleService(
      { client: { seoAuditSchedule: {} } } as unknown as TenantPrismaService,
      { find } as unknown as MasterListingService,
      {} as AuditService,
    );

    await expect(
      service.save('business_1', { enabled: true, intervalHours: 168 }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_SITE_NOT_CONFIGURED' },
    });
  });

  it('persists the owner cadence and records the setting change', async () => {
    const now = new Date();
    const saved = {
      id: 'schedule_1',
      businessId: 'business_1',
      enabled: true,
      intervalHours: 24,
      nextRunAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      processingAt: null,
      lastRunAt: null,
      lastRunId: null,
      lastStatus: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest
      .fn<
        Promise<typeof saved>,
        [
          {
            where: { businessId: string };
            create: {
              businessId: string;
              enabled: boolean;
              intervalHours: number;
              nextRunAt: Date | null;
            };
            update: Record<string, unknown>;
          },
        ]
      >()
      .mockResolvedValue(saved);
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const service = new SeoAuditScheduleService(
      {
        client: {
          seoAuditSchedule: { findUnique, upsert },
        },
      } as unknown as TenantPrismaService,
      {
        find: jest.fn().mockResolvedValue({ website: 'https://example.com' }),
      } as unknown as MasterListingService,
      { log: auditLog } as unknown as AuditService,
    );

    await expect(
      service.save('business_1', { enabled: true, intervalHours: 24 }),
    ).resolves.toMatchObject({
      id: 'schedule_1',
      enabled: true,
      intervalHours: 24,
      configured: true,
    });
    expect(upsert.mock.calls[0]?.[0].create).toMatchObject({
      businessId: 'business_1',
      enabled: true,
      intervalHours: 24,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'SeoAuditSchedule',
        entityId: 'schedule_1',
        action: 'seo_audit_schedule_updated',
        before: null,
      }),
    );
  });
});
