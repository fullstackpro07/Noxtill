import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenCipherService } from '../token-cipher.service';
import { SlackConnector } from '../connectors/slack.connector';
import type { OAuthTokens } from '../connector.interface';
import { AUTOMATION_TRIGGERS } from './automation.constants';
import {
  IntegrationProvider,
  IntegrationStatus,
  WorkflowTriggerKey,
} from '@prisma/client';

/**
 * Posts real Noxtill events (new sale, booking completed, review, low stock, credit overdue,
 * lapsed customer, birthday) to the Slack channel a business connected. Called from the same
 * dispatch point as outbound webhooks. Fire-and-forget: a Slack outage must never block the sale
 * or booking that triggered the message, and each attempt is logged (success or failure).
 */
@Injectable()
export class SlackNotifierService {
  private readonly logger = new Logger(SlackNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipherService,
    private readonly slack: SlackConnector,
  ) {}

  async notify(
    businessId: string,
    triggerKey: WorkflowTriggerKey,
    event: { description: string },
  ): Promise<void> {
    const provider = IntegrationProvider.slack;
    const row = await this.prisma.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row || row.status !== IntegrationStatus.connected || row.pausedAt)
      return;

    const startedAt = Date.now();
    const label =
      AUTOMATION_TRIGGERS.find((t) => t.key === triggerKey)?.label ??
      triggerKey;
    try {
      if (!row.tokens) return;
      // Slack tokens issued through incoming-webhook OAuth never expire, so no refresh is needed.
      const tokens = JSON.parse(this.cipher.decrypt(row.tokens)) as OAuthTokens;
      await this.slack.postMessage(
        tokens,
        (row.meta as Record<string, unknown>) ?? {},
        `*${label}* — ${event.description}`,
      );
      await this.log(businessId, startedAt, true, `Posted "${label}" to Slack`);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(
        `Slack post failed for business=${businessId}: ${message}`,
      );
      await this.log(businessId, startedAt, false, message);
    }
  }

  private async log(
    businessId: string,
    startedAt: number,
    success: boolean,
    message: string,
  ) {
    await this.prisma.integrationSyncLog.create({
      data: {
        businessId,
        provider: IntegrationProvider.slack,
        success,
        recordsProcessed: success ? 1 : 0,
        recordsFailed: success ? 0 : 1,
        durationMs: Date.now() - startedAt,
        message: message.slice(0, 500),
      },
    });
    if (success) {
      await this.prisma.integration.updateMany({
        where: { businessId, provider: IntegrationProvider.slack },
        data: { lastSyncAt: new Date() },
      });
    }
  }
}
