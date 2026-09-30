import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { MasterListingService } from '../listings/master-listing.service';
import { normalizeWebsiteUrl } from './seo-site-audit.util';
import { SeoAuditScheduleDto } from './dto/seo-audit-schedule.dto';

const SEO_SITE_NOT_CONFIGURED = 'SEO_SITE_NOT_CONFIGURED';
const SEO_SITE_URL_INVALID = 'SEO_SITE_URL_INVALID';

@Injectable()
export class SeoAuditScheduleService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly masterListing: MasterListingService,
    private readonly audit: AuditService,
  ) {}

  async get(businessId: string) {
    const schedule = await this.tenantPrisma.client.seoAuditSchedule.findUnique(
      { where: { businessId } },
    );
    return (
      schedule ?? {
        id: null,
        businessId,
        enabled: false,
        intervalHours: 168,
        nextRunAt: null,
        lastRunAt: null,
        lastRunId: null,
        lastStatus: null,
        lastError: null,
        configured: false,
      }
    );
  }

  async save(businessId: string, dto: SeoAuditScheduleDto) {
    if (dto.enabled) {
      const listing = await this.masterListing.find(businessId);
      if (!listing?.website?.trim()) {
        throw new AppException(
          SEO_SITE_NOT_CONFIGURED,
          'Add your website in Business Listings before enabling scheduled audits.',
          HttpStatus.BAD_REQUEST,
        );
      }
      try {
        normalizeWebsiteUrl(listing.website);
      } catch {
        throw new AppException(
          SEO_SITE_URL_INVALID,
          'The website URL in Business Listings is invalid or uses an unsupported address.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const current = await this.tenantPrisma.client.seoAuditSchedule.findUnique({
      where: { businessId },
    });
    const nextRunAt = dto.enabled
      ? new Date(Date.now() + dto.intervalHours * 60 * 60 * 1000)
      : null;
    const schedule = await this.tenantPrisma.client.seoAuditSchedule.upsert({
      where: { businessId },
      create: {
        businessId,
        enabled: dto.enabled,
        intervalHours: dto.intervalHours,
        nextRunAt,
      },
      update: {
        enabled: dto.enabled,
        intervalHours: dto.intervalHours,
        nextRunAt,
      },
    });

    await this.audit.log({
      entity: 'SeoAuditSchedule',
      entityId: schedule.id,
      action: 'seo_audit_schedule_updated',
      before: current
        ? {
            enabled: current.enabled,
            intervalHours: current.intervalHours,
            nextRunAt: current.nextRunAt?.toISOString() ?? null,
          }
        : null,
      after: {
        enabled: schedule.enabled,
        intervalHours: schedule.intervalHours,
        nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      },
    });

    return { ...schedule, configured: true };
  }
}
