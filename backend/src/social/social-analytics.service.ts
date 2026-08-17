import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SocialAccountsService } from './social-accounts.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { SocialPlatform } from '../../generated/prisma';

/** Social Analytics (UPD-BE-050) — same shape as `GmbManagementService.pullInsights()`. */
@Injectable()
export class SocialAnalyticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly accounts: SocialAccountsService,
    private readonly connectors: SocialConnectorRegistry,
  ) {}

  list(businessId: string, platform?: SocialPlatform) {
    return this.tenantPrisma.client.socialAnalyticsSnapshot.findMany({
      where: { businessId, ...(platform ? { platform } : {}) },
      orderBy: { date: 'desc' },
      take: 90,
    });
  }

  /** Aggregated across every connected platform — the `GET /social/analytics` overview. */
  async summary(businessId: string) {
    const latestPerPlatform =
      await this.tenantPrisma.client.socialAnalyticsSnapshot.findMany({
        where: { businessId },
        orderBy: { date: 'desc' },
        distinct: ['platform'],
      });
    return {
      totalFollowers: latestPerPlatform.reduce(
        (sum, row) => sum + row.followers,
        0,
      ),
      totalReach: latestPerPlatform.reduce((sum, row) => sum + row.reach, 0),
      totalEngagement: latestPerPlatform.reduce(
        (sum, row) => sum + row.engagement,
        0,
      ),
      byPlatform: latestPerPlatform,
    };
  }

  async pullForAccount(businessId: string, platform: SocialPlatform) {
    const tokens = await this.accounts.getTokens(businessId, platform);
    if (!tokens)
      throw new Error(
        `${platform} is not connected for business ${businessId}`,
      );

    const account = await this.accounts.getAccount(businessId, platform);
    const connector = this.connectors.get(platform);
    const insights = await connector.fetchInsights(
      tokens,
      (account?.meta as Record<string, unknown>) ?? {},
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    return this.tenantPrisma.client.socialAnalyticsSnapshot.upsert({
      where: {
        businessId_platform_date: { businessId, platform, date: today },
      },
      create: { businessId, platform, date: today, ...insights },
      update: insights,
    });
  }
}
