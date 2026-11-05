import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  TemplateRegistryService,
  substituteTemplateVariables,
} from './templates/template-registry.service';
import { resolveChannel } from './channel-resolution.util';
import { deferOutOfQuietHours } from './send-policy.util';
import { resolvePolicies } from '../common/policies/policies.service';
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
  /** Stable, tenant-scoped key for safe workflow action retries; ordinary sends leave this unset. */
  idempotencyKey?: string;
  /** Overrides `business.channelPref` for this send only (booking reminder rules, UPD-BE-092) — still subject to the same contact-availability fallback in `resolveChannel`. */
  channel?: Message['channel'];
  /** Real custom wording (UPD-BE-092 fix-it) — `{{var}}` placeholders, used instead of the fixed
   * `TEMPLATE_REGISTRY` copy by SMS/email and by WhatsApp inside its 24h window; WhatsApp outside
   * that window still needs `templateKey` to resolve to a real pre-approved template, so this is
   * an override of the rendered TEXT only, never of `templateKey` itself. */
  customBody?: string;
  /** Extra strict channel consent for non-marketing sends. Marketing always requires channel consent. */
  requireChannelConsent?: boolean;
}

export interface SendPreview {
  channel: Message['channel'];
  category: Message['category'];
  templateKey: string;
  locale: string;
  renderedText: string;
  scheduledFor: Date | null;
}

type PreparedSend = Pick<
  SendPreview,
  'channel' | 'category' | 'locale' | 'scheduledFor'
> & { payload: Prisma.InputJsonValue; renderedText: string };

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

    if (params.idempotencyKey) {
      const existing = await this.findIdempotentMessage(
        params.businessId,
        params.idempotencyKey,
      );
      if (existing) return this.reuseIdempotentMessage(existing);
    }

    const prepared = await this.prepare(params, business);

    let message: Message;
    try {
      message = await this.tenantPrisma.client.$transaction(async (tx) => {
        if (prepared.category === 'marketing' && params.customerId) {
          await this.assertCurrentMarketingConsent(
            tx as unknown as Prisma.TransactionClient,
            params.businessId,
            params.customerId,
            prepared.channel,
            params.requireChannelConsent === true,
          );
        }
        const created = await tx.message.create({
          data: {
            businessId: params.businessId,
            customerId: params.customerId,
            campaignId: params.campaignId,
            channel: prepared.channel,
            category: prepared.category,
            templateKey: params.templateKey,
            locale: prepared.locale,
            payload: prepared.payload,
            status: 'queued',
            scheduledFor: prepared.scheduledFor ?? undefined,
            customBody: params.customBody,
            idempotencyKey: params.idempotencyKey,
          },
        });
        await tx.business.update({
          where: { id: params.businessId },
          data: { msgUsed: { increment: 1 } },
        });
        return created;
      });
    } catch (error) {
      if (!params.idempotencyKey || !this.isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.findIdempotentMessage(
        params.businessId,
        params.idempotencyKey,
      );
      if (!existing) throw error;
      return this.reuseIdempotentMessage(existing);
    }

    await this.enqueueMessage(message);

    return message;
  }

  /**
   * Runs the same current send-gate checks and renders the same registered copy as `send`, but
   * does not create a Message, consume quota, or enqueue provider work. `quotaOffset` lets a
   * multi-recipient preview account for the eligible recipients already included in that preview.
   */
  async preview(
    params: SendGateParams,
    options: { quotaOffset?: number } = {},
  ): Promise<SendPreview> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: params.businessId },
    });
    const prepared = await this.prepare(
      params,
      business,
      options.quotaOffset ?? 0,
    );
    return {
      channel: prepared.channel,
      category: prepared.category,
      templateKey: params.templateKey,
      locale: prepared.locale,
      renderedText: prepared.renderedText,
      scheduledFor: prepared.scheduledFor,
    };
  }

  private async prepare(
    params: SendGateParams,
    business: Prisma.BusinessGetPayload<Prisma.BusinessDefaultArgs>,
    quotaOffset = 0,
  ): Promise<PreparedSend> {
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
    const requireChannelConsent =
      definition.category === 'marketing' ||
      params.requireChannelConsent === true;

    if (definition.category === 'marketing' && customer?.optedOut) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_OPTED_OUT,
        'Customer has opted out of marketing messages',
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      definition.category === 'marketing' &&
      customer &&
      !customer.consentMarketing
    ) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_MARKETING_CONSENT_REQUIRED,
        'The customer has not given marketing consent. No message was queued.',
        HttpStatus.FORBIDDEN,
      );
    }

    const policies = resolvePolicies(business);

    // Owner policy: at most N marketing messages per customer in a rolling window.
    const capMax = policies.num('marketing.frequencyCapMax');
    if (
      definition.category === 'marketing' &&
      capMax !== null &&
      params.customerId
    ) {
      const since = new Date(
        Date.now() -
          (policies.num('marketing.frequencyCapDays') ?? 30) *
            24 *
            60 *
            60 *
            1000,
      );
      const recent = await this.tenantPrisma.client.message.count({
        where: {
          businessId: params.businessId,
          customerId: params.customerId,
          category: 'marketing',
          status: { not: 'failed' },
          createdAt: { gte: since },
        },
      });
      if (recent >= capMax) {
        throw new AppException(
          MESSAGE_ERROR_CODES.FREQUENCY_CAP_REACHED,
          `This customer already received ${recent} marketing message(s) in the last ${policies.num('marketing.frequencyCapDays')} days (limit ${capMax})`,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    if (business.msgUsed + quotaOffset >= business.msgQuota) {
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

    const priority =
      (business.channelPriority as Message['channel'][] | null) ?? undefined;
    let channel = resolveChannel(
      params.channel ?? business.channelPref,
      contact,
      priority,
    );

    // A WhatsApp template the owner marked pending/rejected must not go out over WhatsApp; use
    // the next channel the customer can be reached on instead, or refuse if there is none.
    const approval = (
      business.templateApprovals as Record<string, { status?: string }> | null
    )?.[params.templateKey];
    if (
      channel === 'whatsapp' &&
      approval?.status &&
      approval.status !== 'approved'
    ) {
      const alternatives = [...(priority ?? []), 'sms', 'email'].filter(
        (c) => c !== 'whatsapp',
      ) as Message['channel'][];
      channel = alternatives.find((c) => resolveChannel(c, contact, [c]) === c);
      if (!channel) {
        throw new AppException(
          MESSAGE_ERROR_CODES.TEMPLATE_NOT_APPROVED,
          `Template "${params.templateKey}" is ${approval.status} for WhatsApp and the customer has no other channel`,
          HttpStatus.FORBIDDEN,
        );
      }
    }
    if (!channel) {
      throw new AppException(
        MESSAGE_ERROR_CODES.NO_CHANNEL_AVAILABLE,
        'Customer has no usable contact channel',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (requireChannelConsent) {
      if (!params.customerId) {
        throw new AppException(
          MESSAGE_ERROR_CODES.CUSTOMER_CHANNEL_CONSENT_REQUIRED,
          'A customer-specific channel consent record is required. No message was queued.',
          HttpStatus.FORBIDDEN,
        );
      }
      await this.assertChannelConsent(
        params.businessId,
        params.customerId,
        channel,
      );
    }

    const payload: Prisma.InputJsonValue = {
      ...params.variables,
      __to: contact.phone ?? contact.email ?? '',
      ...(requireChannelConsent ? { __channelConsentRequired: true } : {}),
    };

    // Owner policy: marketing waits out quiet hours (in the business's own timezone) rather than
    // waking the customer.
    let scheduledFor = params.scheduledFor;
    const quietFrom = policies.time('marketing.quietFrom');
    const quietTo = policies.time('marketing.quietTo');
    if (definition.category === 'marketing' && quietFrom && quietTo) {
      const intended = scheduledFor ?? new Date();
      const allowed = deferOutOfQuietHours(
        intended,
        quietFrom,
        quietTo,
        business.timezone,
      );
      if (allowed.getTime() !== intended.getTime()) scheduledFor = allowed;
    }
    return {
      channel,
      category: definition.category,
      locale: business.locale,
      payload,
      renderedText: params.customBody
        ? substituteTemplateVariables(params.customBody, params.variables)
        : this.templates.render(
            params.templateKey,
            business.locale,
            params.variables,
          ).text,
      scheduledFor: scheduledFor ?? null,
    };
  }

  /** Re-check consent under a customer-row lock immediately before a marketing message is stored. */
  private async assertCurrentMarketingConsent(
    tx: Prisma.TransactionClient,
    businessId: string,
    customerId: string,
    channel: Message['channel'],
    requireChannelConsent: boolean,
  ) {
    const rows = await tx.$queryRaw<
      { optedOut: number | boolean; consentMarketing: number | boolean }[]
    >`
      SELECT opted_out AS optedOut, consent_marketing AS consentMarketing
      FROM customers
      WHERE id = ${customerId} AND business_id = ${businessId}
      FOR UPDATE
    `;
    const customer = rows[0];
    if (!customer) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_NOT_FOUND,
        'Customer not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (customer.optedOut === true || customer.optedOut === 1) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_OPTED_OUT,
        'Customer has opted out of marketing messages',
        HttpStatus.FORBIDDEN,
      );
    }
    if (customer.consentMarketing !== true && customer.consentMarketing !== 1) {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_MARKETING_CONSENT_REQUIRED,
        'The customer has not given marketing consent. No message was queued.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (requireChannelConsent) {
      const consent = await tx.customerChannelConsent.findFirst({
        where: { businessId, customerId, channel },
        orderBy: { revision: 'desc' },
        select: { state: true },
      });
      if (consent?.state !== 'granted') {
        throw new AppException(
          MESSAGE_ERROR_CODES.CUSTOMER_CHANNEL_CONSENT_REQUIRED,
          `No current granted ${channel} marketing consent is recorded. No message was queued.`,
          HttpStatus.FORBIDDEN,
        );
      }
    }
  }

  private async assertChannelConsent(
    businessId: string,
    customerId: string,
    channel: Message['channel'],
  ) {
    const consent =
      await this.tenantPrisma.client.customerChannelConsent.findFirst({
        where: { businessId, customerId, channel },
        orderBy: { revision: 'desc' },
        select: { state: true },
      });
    if (consent?.state !== 'granted') {
      throw new AppException(
        MESSAGE_ERROR_CODES.CUSTOMER_CHANNEL_CONSENT_REQUIRED,
        `No current granted ${channel} marketing consent is recorded. No message was queued.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async findIdempotentMessage(
    businessId: string,
    idempotencyKey: string,
  ): Promise<Message | null> {
    return this.tenantPrisma.client.message.findFirst({
      where: { businessId, idempotencyKey },
    });
  }

  private async reuseIdempotentMessage(message: Message): Promise<Message> {
    if (message.status === 'failed') {
      throw new AppException(
        MESSAGE_ERROR_CODES.IDEMPOTENCY_TARGET_FAILED,
        'The message for this workflow action already failed and was not sent again.',
        HttpStatus.CONFLICT,
      );
    }
    // A queue add may have failed after the message row committed. Re-add the same job ID;
    // BullMQ deduplicates it while present, and the persisted Message remains the source of truth.
    if (message.status === 'queued') await this.enqueueMessage(message);
    return message;
  }

  private enqueueMessage(message: Message): Promise<unknown> {
    const delay = message.scheduledFor
      ? Math.max(0, message.scheduledFor.getTime() - Date.now())
      : 0;
    return this.messagesQueue.add(
      'send',
      { messageId: message.id },
      {
        jobId: message.id,
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
