import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
/** Newest first: alerts are rare (at most hourly per business), so this always covers new ones. */
const BATCH = 200;

interface PendingAlert {
  sourceKey: string;
  businessId: string;
  kind: 'operations_alert' | 'budget_warning' | 'webhook_dead_letter';
  text: string;
  at: Date;
}

/**
 * Forwards platform operations alerts to an external channel (Slack-compatible incoming webhook
 * at OPS_ALERT_WEBHOOK_URL): realtime failure bursts, phone budget 70/90% warnings and provider
 * callbacks that reached dead-letter. Each source alert is sent once (delivery row per source),
 * retried on failure up to a limit. Messages carry business name and counts, never caller data.
 * Without OPS_ALERT_WEBHOOK_URL nothing is sent and in-app notifications remain the only channel.
 */
@Injectable()
export class VoiceAlertForwarderService {
  private readonly logger = new Logger(VoiceAlertForwarderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async forward(
    now = new Date(),
  ): Promise<{ delivered: number; failed: number }> {
    const url = this.config.get<string>('OPS_ALERT_WEBHOOK_URL');
    if (!url) return { delivered: 0, failed: 0 };
    const since = new Date(now.getTime() - LOOKBACK_MS);
    const pending = await this.collect(since);
    if (!pending.length) return { delivered: 0, failed: 0 };

    const existing = await this.prisma.voiceAlertDelivery.findMany({
      where: { sourceKey: { in: pending.map((p) => p.sourceKey) } },
    });
    const bySource = new Map(existing.map((row) => [row.sourceKey, row]));
    const names = new Map(
      (
        await this.prisma.business.findMany({
          where: { id: { in: [...new Set(pending.map((p) => p.businessId))] } },
          select: { id: true, name: true },
        })
      ).map((b) => [b.id, b.name]),
    );

    let delivered = 0;
    let failed = 0;
    for (const alert of pending) {
      const row = bySource.get(alert.sourceKey);
      if (row?.deliveredAt || (row && row.attempts >= MAX_ATTEMPTS)) continue;
      const delivery =
        row ??
        (await this.prisma.voiceAlertDelivery
          .create({
            data: {
              businessId: alert.businessId,
              sourceKey: alert.sourceKey,
              kind: alert.kind,
            },
          })
          .catch((error: unknown) => {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            )
              return null;
            throw error;
          }));
      if (!delivery) continue;
      try {
        await axios.post(
          url,
          {
            text: `[Noxtill ${alert.kind.replace(/_/g, ' ')}] ${names.get(alert.businessId) ?? 'Business'}: ${alert.text}`,
            kind: alert.kind,
            businessId: alert.businessId,
            occurredAt: alert.at.toISOString(),
          },
          { timeout: 8000 },
        );
        await this.prisma.voiceAlertDelivery.update({
          where: { id: delivery.id },
          data: {
            deliveredAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
          },
        });
        delivered += 1;
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? `HTTP ${error.response?.status ?? 'network error'}`
          : (error as Error).message;
        await this.prisma.voiceAlertDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts: { increment: 1 },
            lastError: message.slice(0, 300),
          },
        });
        failed += 1;
      }
    }
    if (failed)
      this.logger.warn(
        `${failed} operations alert(s) could not be delivered to the webhook`,
      );
    return { delivered, failed };
  }

  private async collect(since: Date): Promise<PendingAlert[]> {
    const [records, deadLetters] = await Promise.all([
      this.prisma.voiceUsageRecord.findMany({
        where: {
          unit: { in: ['operations_alert', 'budget_warning'] },
          measuredAt: { gte: since },
        },
        orderBy: { measuredAt: 'desc' },
        take: BATCH,
      }),
      this.prisma.voiceProviderWebhookEvent.findMany({
        where: { state: 'dead_letter', lastAttemptAt: { gte: since } },
        select: {
          id: true,
          businessId: true,
          eventType: true,
          lastAttemptAt: true,
          consecutiveFailures: true,
        },
        orderBy: { lastAttemptAt: 'desc' },
        take: BATCH,
      }),
    ]);
    const alerts: PendingAlert[] = records.map((record) => {
      const evidence = (record.evidence ?? {}) as Record<string, unknown>;
      const text =
        record.unit === 'budget_warning'
          ? `phone usage reached ${String(evidence.threshold)}% of the $${String(evidence.capUsd)} monthly cap ($${Number(evidence.confirmedPlusEstimatedUsd ?? 0).toFixed(2)} so far).`
          : `${record.quantity.toString()} live audio sessions failed in 10 minutes. Check provider readiness in Supervisor.`;
      return {
        sourceKey: `usage:${record.id}`,
        businessId: record.businessId,
        kind: record.unit as PendingAlert['kind'],
        text,
        at: record.measuredAt,
      };
    });
    for (const event of deadLetters) {
      alerts.push({
        sourceKey: `webhook:${event.id}`,
        businessId: event.businessId,
        kind: 'webhook_dead_letter',
        text: `a provider callback (${event.eventType}) failed ${event.consecutiveFailures} times and needs an operator replay.`,
        at: event.lastAttemptAt ?? since,
      });
    }
    return alerts;
  }
}
