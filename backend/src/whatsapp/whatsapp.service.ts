import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ChannelSendParams,
  ChannelSendResult,
  ChannelSender,
} from '../messaging/channels/channel-sender.interface';
import { WhatsappWindowService } from './whatsapp-window.service';

/**
 * Meta WhatsApp Cloud API adapter, direct (no BSP) — BE-016. Free-form text
 * is only allowed inside the 24h customer-service window; outside it, a
 * pre-approved template message must be used instead.
 */
@Injectable()
export class WhatsappService implements ChannelSender {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly window: WhatsappWindowService,
  ) {}

  async send(params: ChannelSendParams): Promise<ChannelSendResult> {
    const withinWindow = params.customerId
      ? await this.window.isOpen(params.businessId, params.customerId)
      : false;

    const body = withinWindow
      ? {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'text',
          text: { body: params.text },
        }
      : {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'template',
          template: {
            name: params.templateKey,
            language: { code: params.locale },
          },
        };

    const phoneId = this.config.get<string>('META_WA_PHONE_ID');
    const token = this.config.get<string>('META_WA_TOKEN');
    const apiVersion = this.config.get<string>('META_WA_API_VERSION', 'v19.0');

    const response = await axios.post<{ messages: { id: string }[] }>(
      `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const providerRef = response.data.messages[0]?.id;
    this.logger.debug(
      `WhatsApp message sent to ${params.to}, provider_ref=${providerRef}`,
    );
    return { providerRef };
  }
}
