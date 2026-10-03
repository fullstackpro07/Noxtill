import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';

export type PayChannel = 'whatsapp' | 'sms' | 'email';

/**
 * Payments never sends messages itself — every customer message is handed to the shared send gate
 * (opt-out, quota, template and channel rules) and lives in the Unified Inbox / Message log.
 * Payments keeps only the delivery reference (Message id + status).
 */
@Injectable()
export class PayMessagingService {
  private readonly logger = new Logger(PayMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
    private readonly cls: ClsService,
  ) {}

  async send(p: {
    customerId: string;
    templateKey: string;
    variables: Record<string, string>;
    channel?: PayChannel;
    customBody?: string;
  }): Promise<{
    message: Message | null;
    error: string | null;
    channel: string;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: p.customerId },
      select: { businessId: true },
    });
    if (!customer)
      return {
        message: null,
        error: 'Customer not found',
        channel: p.channel ?? '—',
      };
    try {
      const message = await this.cls.run(async () => {
        this.cls.set(CLS_KEY_BUSINESS_ID, customer.businessId);
        return this.sendGate.send({
          businessId: customer.businessId,
          customerId: p.customerId,
          templateKey: p.templateKey,
          variables: p.variables,
          channel: p.channel,
          customBody: p.customBody,
        });
      });
      return { message, error: null, channel: message.channel };
    } catch (e) {
      this.logger.warn(`payments message not sent: ${(e as Error).message}`);
      return {
        message: null,
        error: (e as Error).message.slice(0, 300),
        channel: p.channel ?? '—',
      };
    }
  }

  /** Message.status → the design's delivery labels. */
  static status(m: { status: string } | null | undefined): string {
    if (!m) return 'Failed';
    return (
      (
        {
          queued: 'Queued',
          sent: 'Sent',
          delivered: 'Delivered',
          read: 'Read',
          failed: 'Failed',
        } as Record<string, string>
      )[m.status] ?? 'Sent'
    );
  }
}
