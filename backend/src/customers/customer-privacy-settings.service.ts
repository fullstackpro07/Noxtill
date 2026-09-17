import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateCustomerPrivacySettingsDto } from './dto/update-customer-privacy-settings.dto';

const DEFAULTS = {
  creditBalanceVisibleToStaff: false,
  notesVisibleToStaff: true,
  staffCanExport: false,
  staffCanMerge: false,
  staffCanArchive: false,
};

/** Customer Settings — Privacy & staff access (UPD-BE-101). One row per business, upsert-on-write,
 * same pattern as `CompetitiveSettingsService`. Read by `CustomersController`/`CustomersExportService`
 * to decide what a Staff caller may see or do — Owner/Manager are never restricted by this table. */
@Injectable()
export class CustomerPrivacySettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.customerPrivacySettings.findUnique({
      where: { businessId },
    });
    return existing ?? { businessId, ...DEFAULTS };
  }

  update(businessId: string, dto: UpdateCustomerPrivacySettingsDto) {
    return this.tenantPrisma.client.customerPrivacySettings.upsert({
      where: { businessId },
      create: { businessId, ...DEFAULTS, ...dto },
      update: dto,
    });
  }
}
