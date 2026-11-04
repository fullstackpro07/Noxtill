import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TemplateRegistryService,
  substituteTemplateVariables,
} from './templates/template-registry.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { EmailService } from './channels/email.service';
import { ChannelSender } from './channels/channel-sender.interface';
import { TerminologyService } from '../settings/terminology.service';
import { MESSAGES_QUEUE } from './messaging.constants';
import { MessageChannel } from '@prisma/client';

interface SendJobData {
  messageId: string;
}

/**
 * BullMQ consumer for the messages queue (BE-018). Picks up a queued message,
 * renders its template with the stored payload, sends via the resolved
 * channel's adapter, and persists the resulting provider_ref/status. Runs
 * outside any HTTP request, so it uses the raw PrismaService and scopes
 * queries explicitly rather than relying on CLS-bound tenancy.
 */
@Processor(MESSAGES_QUEUE)
export class MessageWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageWorkerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplateRegistryService,
    private readonly whatsapp: WhatsappService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly terminology: TerminologyService,
  ) {
    super();
  }

  async process(job: Job<SendJobData>): Promise<void> {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: job.data.messageId },
    });
    const payload = message.payload as Record<string, string>;
    const requireChannelConsent =
      message.category === 'marketing' ||
      (message.payload as Record<string, unknown>).__channelConsentRequired ===
        true;

    // Consent can be revoked after a message is queued. Re-check the current canonical CRM flags
    // immediately before calling a provider; queue-time consent is not a durable authorization.
    if (
      message.category === 'marketing' &&
      (message.customerId || requireChannelConsent)
    ) {
      const customer = message.customerId
        ? await this.prisma.customer.findFirst({
            where: {
              id: message.customerId,
              businessId: message.businessId,
            },
            select: {
              id: true,
              phone: true,
              consentMarketing: true,
              optedOut: true,
            },
          })
        : null;
      const channelConsent =
        requireChannelConsent && customer
          ? await this.prisma.customerChannelConsent.findFirst({
              where: {
                businessId: message.businessId,
                customerId: customer.id,
                channel: message.channel,
              },
              orderBy: { revision: 'desc' },
              select: { state: true },
            })
          : null;
      const suppressionReason = !customer
        ? 'customer_missing'
        : customer.phone === `erased-${customer.id}`
          ? 'customer_erased'
          : customer.optedOut
            ? 'customer_opted_out'
            : !customer.consentMarketing
              ? 'marketing_consent_missing'
              : requireChannelConsent && channelConsent?.state !== 'granted'
                ? 'channel_specific_consent_missing'
                : null;
      if (suppressionReason) {
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.message.updateMany({
            where: {
              id: message.id,
              businessId: message.businessId,
              status: 'queued',
            },
            data: { status: 'failed' },
          });
          if (updated.count > 0) {
            await tx.auditLog.create({
              data: {
                businessId: message.businessId,
                action: 'messaging.marketing_send_suppressed',
                entity: 'Message',
                entityId: message.id,
                before: { status: message.status },
                after: {
                  status: 'failed',
                  reason: suppressionReason,
                  category: message.category,
                  templateKey: message.templateKey,
                },
              },
            });
          }
        });
        this.logger.debug(
          `Message ${message.id} suppressed before provider send (${suppressionReason})`,
        );
        return;
      }
    }

    // Real custom wording (UPD-BE-092 fix-it) takes priority over the fixed registry copy when
    // set — WhatsApp's own adapter already ignores this text and falls back to `templateKey`
    // outside its 24h window (see `WhatsappService.send`), so no extra gating is needed here.
    const renderedText = message.customBody
      ? substituteTemplateVariables(message.customBody, payload)
      : this.templates.render(message.templateKey, message.locale, payload)
          .text;
    // Terminology Engine (UPD-BE-038) — a universal post-processing pass over every outgoing
    // WhatsApp message, regardless of which template produced it. No-ops (skips the DB lookup
    // entirely) for the many templates that don't reference any `{{term:...}}` placeholder.
    const text = await this.terminology.applyToText(
      message.businessId,
      renderedText,
    );
    const to = payload.__to;

    const sender = this.pickSender(message.channel);
    const result = await sender.send({
      to,
      text,
      templateKey: message.templateKey,
      locale: message.locale,
      businessId: message.businessId,
      customerId: message.customerId ?? undefined,
    });

    await this.prisma.message.update({
      where: { id: message.id },
      data: { status: 'sent', providerRef: result.providerRef },
    });

    this.logger.debug(
      `Message ${message.id} sent via ${message.channel}, provider_ref=${result.providerRef}`,
    );
  }

  private pickSender(channel: MessageChannel): ChannelSender {
    switch (channel) {
      case MessageChannel.whatsapp:
        return this.whatsapp;
      case MessageChannel.sms:
        return this.sms;
      case MessageChannel.email:
        return this.email;
    }
  }

  // An unlistened 'error' event on the underlying Worker's connection (e.g.
  // Redis over quota) throws and crashes the whole process, not just this worker.
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.warn(`Message worker connection error: ${error.message}`);
  }
}
