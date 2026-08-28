import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ChannelSendParams,
  ChannelSendResult,
  ChannelSender,
} from './channel-sender.interface';

function humanize(templateKey: string): string {
  return templateKey
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Resend email adapter (BE-017) — SES is a drop-in alternative behind the same ChannelSender contract. */
@Injectable()
export class EmailService implements ChannelSender {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(params: ChannelSendParams): Promise<ChannelSendResult> {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_KEY');
    const fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS');

    const response = await axios.post<{ id: string }>(
      'https://api.resend.com/emails',
      {
        from: fromAddress,
        to: params.to,
        subject: humanize(params.templateKey),
        text: params.text,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    this.logger.debug(`Email sent, provider_ref=${response.data.id}`);
    return { providerRef: response.data.id };
  }
}
