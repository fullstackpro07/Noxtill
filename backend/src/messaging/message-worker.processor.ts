import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Optional } from '@nestjs/common';
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
import { Message, MessageChannel } from '@prisma/client';
import { countryOf, MetersService, smsSegments } from '../usage/meters.service';

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
    @Optional() private readonly meters?: MetersService,
  ) {
    super();
  }

  async process(job: Job<SendJobData>): Promise<void> {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: job.data.messageId },
    });

    const payload = message.payload as Record<string, string>;
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

    await this.settleUsage(message, text, to, result.providerRef);

    this.logger.debug(
      `Message ${message.id} sent via ${message.channel}, provider_ref=${result.providerRef}`,
    );
  }

  /**
   * Usage & Limits: settle the spend hold the send gate placed at the real price of what was
   * actually sent (final rendered text → real segment count), and write the billing event.
   * WhatsApp is counted for the customer's visibility but never priced by Noxtill.
   */
  private async settleUsage(
    message: Message,
    text: string,
    to: string,
    providerRef: string,
  ): Promise<void> {
    if (!this.meters) return;
    const key = `msg:${message.id}`;
    if (message.channel === MessageChannel.whatsapp) {
      await this.meters.record({
        businessId: message.businessId,
        metricCode: 'whatsapp_messages',
        quantity: 1,
        unit: 'message',
        idempotencyKey: key,
        operationCode: `message.${message.category}`,
        provider: 'meta',
        providerRef,
        priceUsd: 0,
        countryCode: countryOf(to),
        metadata: { direction: 'outgoing', category: message.category },
      });
      return;
    }
    const isSms = message.channel === MessageChannel.sms;
    const metric = isSms ? 'sms_segments' : 'emails';
    const country = isSms ? countryOf(to) : null;
    const units = isSms ? smsSegments(text) : 1;
    const unit = (await this.meters.unitPrice(metric, country)) ?? 0;
    const event = {
      metricCode: metric,
      quantity: units,
      unit: isSms ? 'segment' : 'email',
      idempotencyKey: key,
      operationCode: `message.${message.category}`,
      provider: isSms ? 'twilio' : 'resend',
      providerRef,
      countryCode: country,
      metadata: {
        messageId: message.id,
        category: message.category,
        templateKey: message.templateKey,
      },
    };
    const hold = await this.meters.findHold(message.businessId, key);
    if (hold) {
      await this.meters.settleHold(hold.id, unit * units, event);
    } else {
      // Queued before spend caps existed: still recorded, so the event log stays complete.
      await this.meters.record({
        ...event,
        businessId: message.businessId,
        priceUsd: unit * units,
      });
    }
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
