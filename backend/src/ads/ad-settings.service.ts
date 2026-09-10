import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateAdSettingsDto } from './dto/update-ad-settings.dto';

/**
 * Advertising Settings (UPD-BE-131) — one row per business, upsert-on-write (same pattern as
 * `DeliverySettingsService`). `get()` returns a real stored row or a default-empty view (never
 * creates a row on read); `autoPauseCostPerResult` is real-enforced by `AdAutoPauseProcessor`.
 */
@Injectable()
export class AdSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.adSettings.findUnique({
      where: { businessId },
    });
    return (
      existing ?? {
        businessId,
        defaultDailyBudgetCap: null,
        autoPauseCostPerResult: null,
        requireApproval: false,
      }
    );
  }

  update(businessId: string, dto: UpdateAdSettingsDto) {
    return this.tenantPrisma.client.adSettings.upsert({
      where: { businessId },
      create: { businessId, ...dto },
      update: dto,
    });
  }
}
