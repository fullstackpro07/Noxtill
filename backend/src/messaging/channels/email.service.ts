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

/** Postmark email adapter (BE-017) — SES is a drop-in alternative behind the same ChannelSender contract. */
@Injectable()
export class EmailService implements ChannelSender {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(params: ChannelSendParams): Promise<ChannelSendResult> {
    const serverToken = this.config.get<string>('EMAIL_PROVIDER_KEY');
    const fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS');

    const response = await axios.post<{ MessageID: string }>(
      'https://api.postmarkapp.com/email',
      {
        From: fromAddress,
        To: params.to,
        Subject: humanize(params.templateKey),
        TextBody: params.text,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': serverToken,
        },
      },
    );

    this.logger.debug(
      `Email sent to ${params.to}, provider_ref=${response.data.MessageID}`,
    );
    return { providerRef: response.data.MessageID };
  }
}
