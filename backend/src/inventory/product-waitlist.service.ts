import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { INVENTORY_ERROR_CODES } from './inventory.constants';

type WaitlistPreviewRecipient = {
  name: string;
  status: 'eligible' | 'blocked';
  channel: string | null;
  message: string | null;
  reasonCode: string | null;
  reason: string | null;
};

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

  /**
   * Builds a current, non-sending preview for an existing explicit waitlist request. Every
   * recipient is checked through the same send-gate preflight used by `notify`; no message row is
   * created, no quota is consumed and no provider job is queued. The actual send rechecks later.
   */
  async previewNotification(
    businessId: string,
    actorUserId: string,
    productId: string,
  ) {
    const product = await this.tenantPrisma.client.product.findFirst({
      where: { id: productId, businessId, active: true },
      select: { id: true, name: true, stockQty: true },
    });
    if (!product) {
      throw new AppException(
        'INVENTORY_WAITLIST_PREVIEW_PRODUCT_NOT_FOUND',
        'This active product is not available in the current business.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (product.stockQty <= 0) {
      throw new AppException(
        INVENTORY_ERROR_CODES.PRODUCT_NOT_FOUND,
        `${product.name} is still out of stock — restock it before preparing a notification preview.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { name: true },
    });
    const waiting =
      await this.tenantPrisma.client.productWaitlistEntry.findMany({
        where: { businessId, productId, notifiedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { customer: { select: { id: true, name: true } } },
      });

    const recipients: WaitlistPreviewRecipient[] = [];
    for (const entry of waiting) {
      try {
        const preview = await this.sendGate.preview(
          {
            businessId,
            customerId: entry.customer.id,
            templateKey: 'back_in_stock',
            variables: {
              customerName: entry.customer.name,
              productName: product.name,
              businessName: business.name,
            },
          },
          {
            quotaOffset: recipients.filter((row) => row.status === 'eligible')
              .length,
          },
        );
        recipients.push({
          name: entry.customer.name,
          status: 'eligible',
          channel: preview.channel,
          message: preview.renderedText,
          reasonCode: null,
          reason: null,
        });
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        const response = error.getResponse();
        const detail =
          typeof response === 'object' && response !== null
            ? (response as { code?: unknown; message?: unknown })
            : {};
        recipients.push({
          name: entry.customer.name,
          status: 'blocked',
          channel: null,
          message: null,
          reasonCode:
            typeof detail.code === 'string' ? detail.code : 'SEND_GATE_BLOCKED',
          reason:
            typeof detail.message === 'string'
              ? detail.message
              : 'The current send-gate checks did not allow this notification.',
        });
      }
    }

    const eligibleCount = recipients.filter(
      (recipient) => recipient.status === 'eligible',
    ).length;
    const blockedCount = recipients.length - eligibleCount;
    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId,
        actorUserId,
        action: 'inventory.waitlist_notification_previewed',
        entity: 'ProductWaitlistEntry',
        entityId: productId,
        before: {
          availableStock: product.stockQty,
          waitingCount: waiting.length,
        },
        after: {
          eligibleCount,
          blockedCount,
          eligibleChannels: recipients
            .filter((recipient) => recipient.channel)
            .map((recipient) => recipient.channel),
          blockedReasonCodes: recipients
            .filter((recipient) => recipient.reasonCode)
            .map((recipient) => recipient.reasonCode),
          sendsMessage: false,
          providerDeliveryChecked: false,
        },
      },
    });

    return {
      productId,
      productName: product.name,
      availableStock: product.stockQty,
      asOf: new Date().toISOString(),
      waitingCount: waiting.length,
      eligibleCount,
      blockedCount,
      providerDeliveryChecked: false,
      recipients,
    };
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
