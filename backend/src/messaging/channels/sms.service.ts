import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ChannelSendParams,
  ChannelSendResult,
  ChannelSender,
} from './channel-sender.interface';

/**
 * Twilio SMS adapter (BE-017). Implements the same ChannelSender contract as
 * WhatsApp/Email so the send gate can pick any of the three interchangeably.
 */
@Injectable()
export class SmsService implements ChannelSender {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(params: ChannelSendParams): Promise<ChannelSendResult> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_FROM_NUMBER');

    const response = await axios.post<{ sid: string }>(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({
        To: params.to,
        From: fromNumber ?? '',
        Body: params.text,
      }),
      { auth: { username: accountSid ?? '', password: authToken ?? '' } },
    );

    this.logger.debug(`SMS sent, provider_ref=${response.data.sid}`);
    return { providerRef: response.data.sid };
  }
}
