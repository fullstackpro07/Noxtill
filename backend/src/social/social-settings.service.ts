import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateSocialSettingsDto } from './dto/social-settings.dto';

/** Social Settings (UPD-BE-051) — same upsert-on-write, default-empty-view pattern as `MasterListingService`. */
@Injectable()
export class SocialSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.socialSettings.findUnique({
      where: { businessId },
    });
    return (
      existing ?? {
        id: null,
        businessId,
        autoPostRules: {},
        hashtagSets: {},
        brandVoice: null,
        createdAt: null,
        updatedAt: null,
      }
    );
  }

  async update(businessId: string, dto: UpdateSocialSettingsDto) {
    return this.tenantPrisma.client.socialSettings.upsert({
      where: { businessId },
      create: { businessId, ...dto },
      update: { ...dto },
    });
  }
}
