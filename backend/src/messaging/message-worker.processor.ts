import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRegistryService } from './templates/template-registry.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { EmailService } from './channels/email.service';
import { ChannelSender } from './channels/channel-sender.interface';
import { MESSAGES_QUEUE } from './messaging.constants';
import { MessageChannel } from '../../generated/prisma';

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
  ) {
    super();
  }

  async process(job: Job<SendJobData>): Promise<void> {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: job.data.messageId },
    });

    const payload = message.payload as Record<string, string>;
    const rendered = this.templates.render(
      message.templateKey,
      message.locale,
      payload,
    );
    const to = payload.__to;

    const sender = this.pickSender(message.channel);
    const result = await sender.send({
      to,
      text: rendered.text,
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
