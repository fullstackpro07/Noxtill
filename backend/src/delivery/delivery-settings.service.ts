import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { DEFAULT_DELIVERY_SETTINGS } from './delivery.constants';

/**
 * On-time-rate depth fix — one row per business, upsert-on-write (same pattern as
 * `VoiceSettings`/`CompetitiveSettings`). `defaultSlaMinutes` is the real, business-configured
 * promise window: `DeliveriesService` reads this at the moment a delivery is actually assigned to
 * compute a real `Delivery.promisedAt`, never fabricated after the fact.
 */
@Injectable()
export class DeliverySettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.deliverySettings.findUnique(
      {
        where: { businessId },
      },
    );
    return existing ?? { businessId, ...DEFAULT_DELIVERY_SETTINGS };
  }

  async getSlaMinutes(businessId: string): Promise<number> {
    const settings = await this.get(businessId);
    return settings.defaultSlaMinutes;
  }

  update(businessId: string, dto: UpdateDeliverySettingsDto) {
    return this.tenantPrisma.client.deliverySettings.upsert({
      where: { businessId },
      create: { businessId, ...DEFAULT_DELIVERY_SETTINGS, ...dto },
      update: dto,
    });
  }
}
