import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';

export type CustomerMessageKind = 'eta' | 'slip' | 'delivered';

/**
 * Real customer notifications for a delivery, sent through the same send gate every other message
 * in the product uses (quota, channel choice, opt-outs, message log). A successful send stamps
 * `Delivery.customerNotifiedAt` / `notifiedPromisedAt`, which is the only thing the Tracking
 * screen's "Customer told" column reads — so it says "told" only when a message was queued.
 */
@Injectable()
export class DeliveryNotifierService {
  private readonly logger = new Logger(DeliveryNotifierService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
    private readonly config: ConfigService,
  ) {}

  trackingUrl(token: string): string {
    const base =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${base}/track/${token}`;
  }

  newTrackingToken(): string {
    return randomBytes(16).toString('hex');
  }

  /** Returns `sent: true` only when a message was actually queued; otherwise the reason. */
  async notify(
    businessId: string,
    deliveryId: string,
    kind: CustomerMessageKind,
  ): Promise<{ sent: boolean; reason?: string }> {
    const delivery = await this.tenantPrisma.client.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { include: { customer: true } }, rider: true },
    });
    if (!delivery?.order.customer) {
      return { sent: false, reason: 'This order has no customer to message' };
    }
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const token = delivery.trackingToken ?? this.newTrackingToken();
    if (!delivery.trackingToken) {
      await this.tenantPrisma.client.delivery.update({
        where: { id: deliveryId },
        data: { trackingToken: token },
      });
    }
    const url = this.trackingUrl(token);
    const orderNo = String(delivery.order.orderNo);
    const eta = delivery.promisedAt
      ? delivery.promisedAt.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: business.timezone,
        })
      : 'soon';

    let body: string;
    if (kind === 'eta') {
      body = `Hi {{customerName}}, your order #${orderNo} is on its way${delivery.rider ? ` with ${delivery.rider.name}` : ''}. Expected by ${eta}. Track it: ${url}`;
    } else if (kind === 'slip') {
      const late = delivery.promisedAt
        ? Math.max(
            1,
            Math.round((Date.now() - delivery.promisedAt.getTime()) / 60000),
          )
        : null;
      body = `Hi {{customerName}}, your order #${orderNo} is running${late ? ` about ${late} minutes` : ''} behind. Sorry for the wait. Track it: ${url}`;
    } else {
      body = `Hi {{customerName}}, your order #${orderNo} has been delivered. Details and proof of delivery: ${url}`;
    }

    let messageId: string;
    try {
      const message = await this.sendGate.send({
        businessId,
        customerId: delivery.order.customerId ?? undefined,
        templateKey: 'order_status',
        customBody: body,
        variables: {
          customerName: delivery.order.customer.name,
          orderNo,
          status: kind === 'delivered' ? 'delivered' : 'on its way',
        },
      });
      messageId = message.id;
    } catch (error) {
      const reason = (error as Error).message;
      this.logger.warn(
        `Could not message customer for delivery ${deliveryId}: ${reason}`,
      );
      return { sent: false, reason };
    }

    await this.tenantPrisma.client.delivery.update({
      where: { id: deliveryId },
      data: {
        customerNotifiedAt: new Date(),
        notificationMessageId: messageId,
        notifiedPromisedAt: delivery.promisedAt,
        ...(kind === 'slip' ? { slipNotifiedAt: new Date() } : {}),
      },
    });
    return { sent: true };
  }
}
