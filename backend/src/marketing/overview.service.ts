import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationProvider } from '../../generated/prisma';

export interface ChannelOverviewRow {
  channel: string;
  spend: number;
  results: number;
  costPerResult: number | null;
}

const AD_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.google_ads,
  IntegrationProvider.meta_ads,
  IntegrationProvider.tiktok_ads,
];

/**
 * Cross-channel marketing overview (BE-089). Real aggregation over data that genuinely exists —
 * WhatsApp campaigns (BE-061) and email campaigns (BE-083) will show real numbers once sent; the
 * 3 ad-spend channels will honestly read zero until a real OAuth connection exists to create
 * campaigns against (deliberately deferred this ticket, see plan).
 */
@Injectable()
export class MarketingOverviewService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async overview(businessId: string): Promise<ChannelOverviewRow[]> {
    const [whatsapp, email, adCampaigns] = await Promise.all([
      this.tenantPrisma.client.campaign.aggregate({
        _sum: { sentCount: true },
      }),
      this.tenantPrisma.client.emailCampaign.aggregate({
        _sum: { sentCount: true },
      }),
      this.tenantPrisma.client.adCampaign.findMany({
        where: { provider: { in: AD_PROVIDERS } },
      }),
    ]);

    const rows: ChannelOverviewRow[] = [
      this.toRow('WhatsApp', 0, whatsapp._sum.sentCount ?? 0),
      this.toRow('Email', 0, email._sum.sentCount ?? 0),
    ];

    for (const provider of AD_PROVIDERS) {
      const campaigns = adCampaigns.filter((c) => c.provider === provider);
      const spend = campaigns.reduce((sum, c) => sum + Number(c.budget), 0);
      const results = campaigns.reduce((sum, c) => {
        const stats = c.stats as { results?: number } | null;
        return sum + (stats?.results ?? 0);
      }, 0);
      rows.push(this.toRow(this.label(provider), spend, results));
    }

    return rows;
  }

  private toRow(channel: string, spend: number, results: number): ChannelOverviewRow {
    return {
      channel,
      spend,
      results,
      costPerResult: results > 0 ? Math.round((spend / results) * 100) / 100 : null,
    };
  }

  private label(provider: IntegrationProvider): string {
    switch (provider) {
      case IntegrationProvider.google_ads:
        return 'Google Ads';
      case IntegrationProvider.meta_ads:
        return 'Meta Ads';
      case IntegrationProvider.tiktok_ads:
        return 'TikTok Ads';
      default:
        return provider;
    }
  }
}
