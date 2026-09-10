import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import { ConnectorRegistry } from '../../integrations/connector-registry';
import { AD_STATS_SYNC_QUEUE } from '../ads.constants';
import { IntegrationStatus, Prisma } from '@prisma/client';

/**
 * `ad-stats-sync` (fatigue-warning depth fix) — refreshes `AdCampaign.stats` from each connected
 * provider's own real reporting API and appends a real, timestamped snapshot row. This is the
 * real data source `computeFatigueWarning` reads — a campaign never sync'd yet (or whose provider
 * doesn't implement `fetchCampaignStats`, e.g. Microsoft/Amazon — see `AD_STATS_SYNC_QUEUE`'s own
 * doc) simply accumulates no history, and honestly shows no fatigue signal rather than a fabricated one.
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

    let syncedCount = 0;
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
      } catch (error) {
        this.logger.warn(
          `Real stats sync failed for campaign ${campaign.id} (provider=${campaign.provider}), skipping this cycle: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `ad-stats-sync processed ${campaigns.length} campaign(s), synced ${syncedCount}`,
    );
  }
}
