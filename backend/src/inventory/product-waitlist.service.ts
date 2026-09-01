import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { INVENTORY_ERROR_CODES } from './inventory.constants';

/**
 * Back-in-stock notifications (UPD-BE-111) — deliberately minimal: staff add a customer who asked
 * in person/by phone (no `WaitlistEntry` reuse — that model is booking-slot-only), not a public
 * storefront "notify me" widget, which would need its own public-facing flow.
 */
@Injectable()
export class ProductWaitlistService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async add(businessId: string, productId: string, customerId: string) {
    const [product, customer] = await Promise.all([
      this.tenantPrisma.client.product.findUnique({ where: { id: productId } }),
      this.tenantPrisma.client.customer.findUnique({
        where: { id: customerId },
      }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!customer) throw new NotFoundException('Customer not found');

    return this.tenantPrisma.client.productWaitlistEntry.create({
      data: { businessId, productId, customerId },
      include: { customer: true },
    });
  }

  list(productId: string) {
    return this.tenantPrisma.client.productWaitlistEntry.findMany({
      where: { productId, notifiedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { customer: true },
    });
  }

  count(productId: string) {
    return this.tenantPrisma.client.productWaitlistEntry.count({
      where: { productId, notifiedAt: null },
    });
  }

  async remove(id: string) {
    const entry =
      await this.tenantPrisma.client.productWaitlistEntry.findUnique({
        where: { id },
      });
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    await this.tenantPrisma.client.productWaitlistEntry.delete({
      where: { id },
    });
  }

  /** Sends a real WhatsApp notification to every real, un-notified waiting customer, then marks each notified. */
  async notify(businessId: string, productId: string) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.stockQty <= 0) {
      throw new AppException(
        INVENTORY_ERROR_CODES.PRODUCT_NOT_FOUND,
        `${product.name} is still out of stock — restock it before notifying the waitlist`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const waiting = await this.list(productId);

    let notifiedCount = 0;
    for (const entry of waiting) {
      await this.sendGate
        .send({
          businessId,
          customerId: entry.customerId,
          templateKey: 'back_in_stock',
          variables: {
            customerName: entry.customer.name,
            productName: product.name,
            businessName: business.name,
          },
        })
        .then(async () => {
          await this.tenantPrisma.client.productWaitlistEntry.update({
            where: { id: entry.id },
            data: { notifiedAt: new Date() },
          });
          notifiedCount += 1;
        })
        .catch(() => undefined);
    }

    return { notifiedCount };
  }
}
