import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import { ConnectorRegistry } from '../../integrations/connector-registry';
import { AD_STATS_SYNC_QUEUE } from '../ads.constants';
import {
  AdCampaign,
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
} from '@prisma/client';

/**
 * `ad-stats-sync` (fatigue-warning depth fix) — refreshes `AdCampaign.stats` from each connected
 * provider's own real reporting API (all 9 platforms — see `AD_STATS_SYNC_QUEUE`'s own doc for
 * Microsoft/Amazon's real async report flow) and appends a real, timestamped snapshot row. This
 * is the real data source `computeFatigueWarning` reads — a campaign never sync'd yet simply
 * accumulates no history, and honestly shows no fatigue signal rather than a fabricated one.
 */
@Processor(AD_STATS_SYNC_QUEUE)
export class AdStatsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AdStatsSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.run();
  }

  async run(): Promise<void> {
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        externalId: { not: null },
        status: { in: ['active', 'paused'] },
      },
    });
    const syncedCount = await this.syncCampaigns(campaigns);
    this.logger.debug(
      `ad-stats-sync processed ${campaigns.length} campaign(s), synced ${syncedCount}`,
    );
  }

  /**
   * Connection Detail depth fix — the real, on-demand version of the hourly tick above, scoped to
   * one business's campaigns on one provider: what "Sync now" on that connector's Connection
   * Detail page actually triggers, rather than making the caller wait up to an hour.
   */
  async syncBusinessProvider(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<{ synced: number; total: number }> {
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        businessId,
        provider,
        externalId: { not: null },
        status: { in: ['active', 'paused'] },
      },
    });
    const synced = await this.syncCampaigns(campaigns);
    return { synced, total: campaigns.length };
  }

  private async syncCampaigns(campaigns: AdCampaign[]): Promise<number> {
    let syncedCount = 0;
    // One real sync-log row per business+provider per run (Integrations hub — last attempted vs
    // last successful, errors today) rather than one per campaign.
    const runs = new Map<
      string,
      {
        businessId: string;
        provider: IntegrationProvider;
        ok: number;
        failed: number;
        started: number;
        lastError?: string;
      }
    >();
    const runFor = (c: AdCampaign) => {
      const key = `${c.businessId}:${c.provider}`;
      let run = runs.get(key);
      if (!run) {
        run = {
          businessId: c.businessId,
          provider: c.provider,
          ok: 0,
          failed: 0,
          started: Date.now(),
        };
        runs.set(key, run);
      }
      return run;
    };
    for (const campaign of campaigns) {
      const connector = this.connectors.get(campaign.provider);
      if (!connector.fetchCampaignStats) continue;

      const integration = await this.prisma.integration.findUnique({
        where: {
          businessId_provider: {
            businessId: campaign.businessId,
            provider: campaign.provider,
          },
        },
      });
      if (integration?.status !== IntegrationStatus.connected) continue;
      // Owner paused this connection — keep it authorised but do not pull stats.
      if (integration.pausedAt) continue;

      try {
        const tokens = await this.integrations.getTokens(
          campaign.businessId,
          campaign.provider,
        );
        if (!tokens) continue;

        const stats = await connector.fetchCampaignStats(
          tokens,
          campaign.externalId!,
          (campaign.providerMeta as Record<string, unknown>) ?? {},
        );

        await this.prisma.adCampaign.update({
          where: { id: campaign.id },
          data: { stats: stats as unknown as Prisma.InputJsonValue },
        });
        await this.prisma.adCampaignStatsSnapshot.create({
          data: {
            businessId: campaign.businessId,
            campaignId: campaign.id,
            spend: stats.spend,
            impressions: stats.impressions,
            clicks: stats.clicks,
            results: stats.results,
          },
        });
        syncedCount += 1;
        runFor(campaign).ok += 1;
      } catch (error) {
        this.logger.warn(
          `Real stats sync failed for campaign ${campaign.id} (provider=${campaign.provider}), skipping this cycle: ${(error as Error).message}`,
        );
        const run = runFor(campaign);
        run.failed += 1;
        run.lastError = (error as Error).message;
      }
    }
    for (const run of runs.values()) {
      const lastError = run.lastError;
      await this.prisma.integrationSyncLog.create({
        data: {
          businessId: run.businessId,
          provider: run.provider,
          success: run.failed === 0,
          recordsProcessed: run.ok,
          recordsFailed: run.failed,
          durationMs: Date.now() - run.started,
          message:
            run.failed === 0
              ? `Refreshed stats for ${run.ok} campaign(s)`
              : `Refreshed ${run.ok}, failed ${run.failed}${lastError ? `: ${lastError.slice(0, 300)}` : ''}`,
        },
      });
      if (run.ok > 0) {
        await this.prisma.integration.updateMany({
          where: { businessId: run.businessId, provider: run.provider },
          data: { lastSyncAt: new Date() },
        });
      }
    }
    return syncedCount;
  }
}
