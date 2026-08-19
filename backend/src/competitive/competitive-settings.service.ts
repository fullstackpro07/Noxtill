import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateCompetitiveSettingsDto } from './dto/update-competitive-settings.dto';
import { DEFAULT_COMPETITIVE_SETTINGS } from './competitive.constants';

/**
 * Competitive Settings (UPD-BE-055) — one row per business, upsert-on-write (same pattern as
 * `SocialSettingsService`/`MasterListingService`). Tracked competitors/keywords themselves are
 * managed via the existing `CompetitorsService`/`KeywordsService` CRUD (BE-063) — this only holds
 * the scan-frequency and alert-threshold knobs that gate the gap-analysis job (UPD-BE-054).
 */
@Injectable()
export class CompetitiveSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing =
      await this.tenantPrisma.client.competitiveSettings.findUnique({
        where: { businessId },
      });
    return existing ?? { businessId, ...DEFAULT_COMPETITIVE_SETTINGS };
  }

  async update(businessId: string, dto: UpdateCompetitiveSettingsDto) {
    return this.tenantPrisma.client.competitiveSettings.upsert({
      where: { businessId },
      create: { businessId, ...DEFAULT_COMPETITIVE_SETTINGS, ...dto },
      update: dto,
    });
  }
}
