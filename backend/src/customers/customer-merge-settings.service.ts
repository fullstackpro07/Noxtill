import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateCustomerMergeSettingsDto } from './dto/update-customer-merge-settings.dto';

const DEFAULTS = {
  matchOn: 'phone_or_email' as const,
  conflictResolution: 'primary' as const,
};

/** Customer Settings — Merge rules (UPD-BE-101). One row per business, upsert-on-write, same
 * pattern as `CompetitiveSettingsService`. */
@Injectable()
export class CustomerMergeSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.customerMergeSettings.findUnique({
      where: { businessId },
    });
    return existing ?? { businessId, ...DEFAULTS };
  }

  update(businessId: string, dto: UpdateCustomerMergeSettingsDto) {
    return this.tenantPrisma.client.customerMergeSettings.upsert({
      where: { businessId },
      create: { businessId, ...DEFAULTS, ...dto },
      update: dto,
    });
  }
}
