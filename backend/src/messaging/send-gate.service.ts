import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { TemplateRegistryService } from './templates/template-registry.service';
import { resolveChannel } from './channel-resolution.util';
import { MESSAGE_ERROR_CODES, MESSAGES_QUEUE } from './messaging.constants';
import { Message, Prisma } from '@prisma/client';

export interface SendGateParams {
  businessId: string;
  templateKey: string;
  variables: Record<string, string>;
  scheduledFor?: Date;
  customerId?: string;
  /** Only used when customerId is omitted (e.g. an owner test send to an arbitrary contact). */
  to?: { phone?: string; email?: string };
  /** Set for campaign fan-out sends (BE-061) so the funnel report can attribute delivery/read status back. */
  campaignId?: string;
  /** Overrides `business.channelPref` for this send only (booking reminder rules, UPD-BE-092) — still subject to the same contact-availability fallback in `resolveChannel`. */
  channel?: Message['channel'];
  /** Real custom wording (UPD-BE-092 fix-it) — `{{var}}` placeholders, used instead of the fixed
   * `TEMPLATE_REGISTRY` copy by SMS/email and by WhatsApp inside its 24h window; WhatsApp outside
   * that window still needs `templateKey` to resolve to a real pre-approved template, so this is
   * an override of the rendered TEXT only, never of `templateKey` itself. */
  customBody?: string;
}

/**
 * The single function every send passes through (spec §3.1). Checks, in
 * order: opt-out (marketing only) → quota → template exists → channel
 * resolution. On success, creates the Message row and enqueues the send job
 * — the job itself is what actually talks to a provider (queue rule, BE-010).
 */
@Injectable()
export class SendGateService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly templates: TemplateRegistryService,
    @InjectQueue(MESSAGES_QUEUE) private readonly messagesQueue: Queue,
  ) {}

  async send(params: SendGateParams): Promise<Message> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: params.businessId },
    });

    const customer = params.customerId
      ? await this.tenantPrisma.client.customer.findUnique({
          where: { id: params.customerId },
        })
      : undefined;

    if (params.customerId && !customer) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_NOT_FOUND,
        'Customer not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const definition = this.templates.get(params.templateKey);
    if (!definition) {
      throw new AppException(
        MESSAGE_ERROR_CODES.TEMPLATE_NOT_FOUND,
        `Unknown template: ${params.templateKey}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (definition.category === 'marketing' && customer?.optedOut) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_OPTED_OUT,
        'Customer has opted out of marketing messages',
        HttpStatus.FORBIDDEN,
      );
    }

    if (business.msgUsed >= business.msgQuota) {
      throw new AppException(
        MESSAGE_ERROR_CODES.QUOTA_EXCEEDED,
        `Monthly message quota (${business.msgQuota}) reached`,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!this.templates.exists(params.templateKey, business.locale)) {
      throw new AppException(
        MESSAGE_ERROR_CODES.TEMPLATE_NOT_FOUND,
        `No copy for template "${params.templateKey}" in locale "${business.locale}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const contact = customer
      ? { phone: customer.phone, email: customer.email }
      : { phone: params.to?.phone, email: params.to?.email };

    const channel = resolveChannel(
      params.channel ?? business.channelPref,
      contact,
      (business.channelPriority as Message['channel'][] | null) ?? undefined,
    );
    if (!channel) {
      throw new AppException(
        MESSAGE_ERROR_CODES.NO_CHANNEL_AVAILABLE,
        'Customer has no usable contact channel',
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload: Prisma.InputJsonValue = {
      ...params.variables,
      __to: contact.phone ?? contact.email ?? '',
    };

    const [message] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.message.create({
        data: {
          businessId: params.businessId,
          customerId: params.customerId,
          campaignId: params.campaignId,
          channel,
          category: definition.category,
          templateKey: params.templateKey,
          locale: business.locale,
          payload,
          status: 'queued',
          scheduledFor: params.scheduledFor,
          customBody: params.customBody,
        },
      }),
      this.tenantPrisma.client.business.update({
        where: { id: params.businessId },
        data: { msgUsed: { increment: 1 } },
      }),
    ]);

    const delay = params.scheduledFor
      ? Math.max(0, params.scheduledFor.getTime() - Date.now())
      : 0;
    await this.messagesQueue.add(
      'send',
      { messageId: message.id },
      {
        jobId: message.id,
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return message;
  }
}
