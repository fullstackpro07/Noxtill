import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

const WINDOW_HOURS = 24;

/**
 * Tracks the Meta WhatsApp 24h customer-service window per customer (BE-016).
 * Replies inside the window are free-form and free; outside it, only
 * pre-approved templates can be sent.
 */
@Injectable()
export class WhatsappWindowService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Call when an inbound message/reply arrives from the customer (via the Meta webhook). */
  async refresh(businessId: string, customerId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + WINDOW_HOURS * 60 * 60 * 1000);
    await this.tenantPrisma.client.whatsappWindow.upsert({
      where: { businessId_customerId: { businessId, customerId } },
      create: { businessId, customerId, expiresAt },
      update: { expiresAt },
    });
  }

  async isOpen(businessId: string, customerId: string): Promise<boolean> {
    const window = await this.tenantPrisma.client.whatsappWindow.findFirst({
      where: { businessId, customerId },
    });
    return !!window && window.expiresAt > new Date();
  }
}
