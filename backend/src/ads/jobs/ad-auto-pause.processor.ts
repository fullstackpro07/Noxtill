import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdCampaignsService } from '../ad-campaigns.service';
import { AD_AUTO_PAUSE_QUEUE, type AdCampaignStats } from '../ads.constants';
import { Role } from '@prisma/client';

/**
 * `ad-auto-pause` (UPD-BE-131) — real enforcement of `AdSettings.autoPauseCostPerResult`: pauses a
 * real active campaign, through the same per-provider `AdCampaignsService.update()` path a manual
 * pause uses, the moment its own stored `stats` show a real cost-per-result over the business's
 * configured threshold. A campaign with zero real results is skipped, never treated as an
 * infinite/zero cost-per-result — there is nothing real to measure yet.
 */
@Processor(AD_AUTO_PAUSE_QUEUE)
export class AdAutoPauseProcessor extends WorkerHost {
  private readonly logger = new Logger(AdAutoPauseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: AdCampaignsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.run();
  }

  async run(): Promise<void> {
    const settings = await this.prisma.adSettings.findMany({
      where: { autoPauseCostPerResult: { not: null } },
    });

    let pausedCount = 0;
    for (const setting of settings) {
      const threshold = Number(setting.autoPauseCostPerResult);
      const activeCampaigns = await this.prisma.adCampaign.findMany({
        where: { businessId: setting.businessId, status: 'active' },
      });

      for (const campaign of activeCampaigns) {
        const stats = campaign.stats as AdCampaignStats;
        if (!stats.results || stats.results <= 0 || stats.spend == null)
          continue;
        const costPerResult = stats.spend / stats.results;
        if (costPerResult <= threshold) continue;

        // Pausing is never gated by requireApproval (that only governs activation) — the role
        // passed here is inert, but a real value is still required by the method's signature.
        await this.campaigns.update(
          setting.businessId,
          campaign.id,
          { status: 'paused' },
          Role.owner,
        );
        pausedCount += 1;
        // Real record of the pause — this is what lets the Rules screen show a genuine "fired"
        // count instead of an invented one (see AdRulesService.list()).
        await this.prisma.auditLog.create({
          data: {
            businessId: setting.businessId,
            action: 'ad.auto_pause',
            entity: 'AdCampaign',
            entityId: campaign.id,
            after: { costPerResult: Math.round(costPerResult * 100) / 100, threshold } as never,
          },
        });
        this.logger.log(
          `Auto-paused campaign ${campaign.id} (business ${setting.businessId}): cost-per-result ${costPerResult.toFixed(2)} > threshold ${threshold}`,
        );
      }
    }

    this.logger.debug(
      `ad-auto-pause processed ${settings.length} business(es), paused ${pausedCount} campaign(s)`,
    );
  }
}
