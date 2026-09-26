import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

/**
 * Shared bookkeeping for every capability sync: one real `IntegrationSyncLog` row per attempt
 * (success or failure, with counts and duration) and `lastSyncAt` only when the attempt succeeded.
 * Also the single place that decides whether a connection may run at all — connected, and not
 * paused by the owner.
 */
@Injectable()
export class SyncLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** The connection if it can run right now; `null` when not connected or paused. */
  async runnable(businessId: string, provider: IntegrationProvider) {
    const row = await this.prisma.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row || row.status !== IntegrationStatus.connected || row.pausedAt)
      return null;
    return row;
  }

  /** Like `runnable`, but explains why it can't run (used by manual "Sync now"). */
  async requireRunnable(businessId: string, provider: IntegrationProvider) {
    const row = await this.prisma.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row || row.status === IntegrationStatus.not_connected) {
      throw new AppException(
        'INTEGRATION_NOT_CONNECTED',
        `${provider} is not connected`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (row.status === IntegrationStatus.needs_attention) {
      throw new AppException(
        'INTEGRATION_NEEDS_ATTENTION',
        `${provider} needs to be reconnected before it can sync`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (row.pausedAt) {
      throw new AppException(
        'INTEGRATION_PAUSED',
        `${provider} is paused — resume it before syncing`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return row;
  }

  async record(
    businessId: string,
    provider: IntegrationProvider,
    run: {
      startedAt: number;
      success: boolean;
      processed: number;
      failed?: number;
      message: string;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.integrationSyncLog.create({
      data: {
        businessId,
        provider,
        success: run.success,
        recordsProcessed: run.processed,
        recordsFailed: run.failed ?? 0,
        durationMs: Date.now() - run.startedAt,
        message: run.message.slice(0, 1000),
        ...(run.details ? { details: run.details as never } : {}),
      },
    });
    if (run.success) {
      await this.prisma.integration.updateMany({
        where: { businessId, provider },
        data: { lastSyncAt: new Date() },
      });
    }
  }
}
