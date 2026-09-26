import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ChannelSendParams,
  ChannelSendResult,
  ChannelSender,
} from '../messaging/channels/channel-sender.interface';
import { WhatsappWindowService } from './whatsapp-window.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenCipherService } from '../integrations/token-cipher.service';
import type { OAuthTokens } from '../integrations/connector.interface';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

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
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly cipher?: TokenCipherService,
  ) {}

  /**
   * The business's own WhatsApp Cloud API credentials, when it connected WhatsApp Business in
   * Integrations (and hasn't paused it). Otherwise `null`, and the shared platform number is used
   * exactly as before.
   */
  private async businessCredentials(
    businessId: string,
  ): Promise<{ phoneId: string; token: string } | null> {
    if (!this.prisma || !this.cipher) return null;
    const row = await this.prisma.integration.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.whatsapp,
        },
      },
    });
    if (
      !row ||
      row.status !== IntegrationStatus.connected ||
      row.pausedAt ||
      !row.tokens
    ) {
      return null;
    }
    try {
      const tokens = JSON.parse(this.cipher.decrypt(row.tokens)) as OAuthTokens;
      const phoneId = tokens.providerMeta?.phoneNumberId as string | undefined;
      return phoneId ? { phoneId, token: tokens.accessToken } : null;
    } catch {
      return null;
    }
  }

  /** One real log row per message sent through the business's own number (records + errors). */
  private async logOwnNumberSend(
    businessId: string,
    startedAt: number,
    error?: string,
  ) {
    if (!this.prisma) return;
    await this.prisma.integrationSyncLog
      .create({
        data: {
          businessId,
          provider: IntegrationProvider.whatsapp,
          success: !error,
          recordsProcessed: error ? 0 : 1,
          recordsFailed: error ? 1 : 0,
          durationMs: Date.now() - startedAt,
          message: error
            ? error.slice(0, 500)
            : 'Message sent from your WhatsApp Business number',
        },
      })
      .catch(() => undefined);
    if (!error) {
      await this.prisma.integration
        .updateMany({
          where: { businessId, provider: IntegrationProvider.whatsapp },
          data: { lastSyncAt: new Date() },
        })
        .catch(() => undefined);
    }
  }

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

    const own = await this.businessCredentials(params.businessId);
    const phoneId = own?.phoneId ?? this.config.get<string>('META_WA_PHONE_ID');
    const token = own?.token ?? this.config.get<string>('META_WA_TOKEN');
    const apiVersion = this.config.get<string>('META_WA_API_VERSION', 'v19.0');

    const startedAt = Date.now();
    let response: { data: { messages: { id: string }[] } };
    try {
      response = await axios.post<{ messages: { id: string }[] }>(
        `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`,
        body,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      if (own)
        await this.logOwnNumberSend(
          params.businessId,
          startedAt,
          (error as Error).message,
        );
      throw error;
    }
    if (own) await this.logOwnNumberSend(params.businessId, startedAt);

    const providerRef = response.data.messages[0]?.id;
    this.logger.debug(`WhatsApp message sent, provider_ref=${providerRef}`);
    return { providerRef };
  }
}
