import { Processor, WorkerHost } from '@nestjs/bullmq';
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
}
