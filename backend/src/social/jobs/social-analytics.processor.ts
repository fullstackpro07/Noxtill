import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SocialAnalyticsService } from '../social-analytics.service';
import { SOCIAL_ANALYTICS_QUEUE } from '../social.constants';
import { SocialAccountStatus } from '@prisma/client';

/** Nightly social analytics pull (UPD-BE-050) — loops every connected `SocialAccount`, catch-and-continue per row, same convention as `GmbInsightsProcessor`/`LowStockScanProcessor`. */
@Processor(SOCIAL_ANALYTICS_QUEUE)
export class SocialAnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialAnalyticsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SocialAnalyticsService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const connectedAccounts = await this.prisma.socialAccount.findMany({
      where: { status: SocialAccountStatus.connected },
      select: { businessId: true, platform: true },
    });

    for (const { businessId, platform } of connectedAccounts) {
      await this.analytics
        .pullForAccount(businessId, platform)
        .catch((error: Error) =>
          this.logger.warn(
            `Social analytics pull failed for business ${businessId}/${platform}: ${error.message}`,
          ),
        );
    }
  }
}
