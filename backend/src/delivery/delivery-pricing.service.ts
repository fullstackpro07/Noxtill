import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { DeliverySettingsService } from './delivery-settings.service';
import {
  computeDeliveryPricing,
  type DeliveryPricing,
} from './delivery-pricing.util';

/** Loads the zone and the owner's settings for the active business and prices one delivery. */
@Injectable()
export class DeliveryPricingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly settings: DeliverySettingsService,
  ) {}

  async quote(
    businessId: string,
    input: {
      zoneId?: string | null;
      orderTotal: number;
      lat: number | null;
      lng: number | null;
    },
  ): Promise<DeliveryPricing> {
    const [settings, zone] = await Promise.all([
      this.settings.get(businessId),
      input.zoneId
        ? this.tenantPrisma.client.deliveryZone.findUnique({
            where: { id: input.zoneId },
          })
        : Promise.resolve(null),
    ]);
    return computeDeliveryPricing({
      zone,
      settings,
      orderTotal: input.orderTotal,
      lat: input.lat,
      lng: input.lng,
    });
  }
}
