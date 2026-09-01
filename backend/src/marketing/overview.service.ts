import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AD_PROVIDERS } from '../ads/ads.constants';
import {
  EmailEventType,
  IntegrationProvider,
  MessageStatus,
} from '@prisma/client';

export interface ChannelOverviewRow {
  channel: string;
  spend: number;
  results: number;
  /** null = not applicable for this channel (ad platforms don't have a "delivered" concept the same way). */
  delivered: number | null;
  costPerResult: number | null;
}

export interface MarketingOverviewTotals {
  spend: number;
  results: number;
  delivered: number;
  blendedCostPerResult: number | null;
  /** Real orders that used a coupon or voucher — the only attribution link that actually exists in this schema. */
  redemptions: number;
  /** Revenue from those same coupon/voucher-attributed orders, not a full multi-touch model. */
  revenue: number;
}

export interface MarketingOverviewResult {
  channels: ChannelOverviewRow[];
  totals: MarketingOverviewTotals;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Cross-channel marketing overview (BE-089, extended UPD-BE-105a). Real aggregation over data
 * that genuinely exists — WhatsApp campaigns (BE-061) and email campaigns (BE-083) will show real
 * numbers once sent; each ad-spend channel (UPD-BE-069's now-9-provider set, shared from
 * `ads/ads.constants.ts`) honestly reads zero until a real OAuth connection exists to create
 * campaigns against. `redemptions`/`revenue` are deliberately scoped to orders that used a real
 * `Coupon`/`Voucher` — the only attribution link this schema actually has; there's no per-campaign
 * UTM/attribution system, so this is not claimed to be full marketing-attribution revenue.
 */
@Injectable()
export class MarketingOverviewService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
    private readonly cls: ClsService,
  ) {}

  /** UPD-FE-091's "AI-reallocation popup" — a real suggestion from the shared, rate-limited AI
   * infra, fed the business's own real channel numbers (never fabricated). Falls back to an
   * honest unavailable-message if the model call fails, same convention as `ReviewsService.aiDraft`. */
  async suggestReallocation(): Promise<{ suggestion: string }> {
    const result = await this.overview();
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const prompt =
      "Here is this business's real marketing channel performance for the current period " +
      "(spend, results, cost-per-result — all in the business's own currency, results meaning " +
      'messages sent or ad-platform-reported results):\n\n' +
      JSON.stringify(result.channels, null, 2) +
      `\n\nTotal spend: ${result.totals.spend}, total results: ${result.totals.results}, blended cost-per-result: ${result.totals.blendedCostPerResult ?? 'n/a'}.\n\n` +
      'In 3-4 concise sentences, suggest how this business could reallocate its ad budget across ' +
      "these channels for better ROI. Reference the real numbers above. If there isn't enough " +
      'spend/results data yet to say anything meaningful, say so honestly instead of guessing.';

    try {
      const suggestion = await this.aiInfra.complete(
        businessId,
        prompt,
        0.5,
        'marketing_reallocation',
      );
      return { suggestion };
    } catch {
      return {
        suggestion:
          "AI suggestions aren't available right now — please try again later.",
      };
    }
  }

  async overview(): Promise<MarketingOverviewResult> {
    const [
      whatsapp,
      whatsappDelivered,
      email,
      emailDelivered,
      adCampaigns,
      redemptions,
    ] = await Promise.all([
      this.tenantPrisma.client.campaign.aggregate({
        _sum: { sentCount: true },
      }),
      this.tenantPrisma.client.message.count({
        where: {
          campaignId: { not: null },
          status: { in: [MessageStatus.delivered, MessageStatus.read] },
        },
      }),
      this.tenantPrisma.client.emailCampaign.aggregate({
        _sum: { sentCount: true },
      }),
      this.tenantPrisma.client.emailEvent.count({
        where: { type: EmailEventType.delivered },
      }),
      this.tenantPrisma.client.adCampaign.findMany({
        where: { provider: { in: AD_PROVIDERS } },
      }),
      this.tenantPrisma.client.order.aggregate({
        where: {
          OR: [{ couponId: { not: null } }, { voucherId: { not: null } }],
        },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const rows: ChannelOverviewRow[] = [
      this.toRow(
        'WhatsApp',
        0,
        whatsapp._sum.sentCount ?? 0,
        whatsappDelivered,
      ),
      this.toRow('Email', 0, email._sum.sentCount ?? 0, emailDelivered),
    ];

    for (const provider of AD_PROVIDERS) {
      const campaigns = adCampaigns.filter((c) => c.provider === provider);
      const spend = campaigns.reduce((sum, c) => sum + Number(c.budget), 0);
      const results = campaigns.reduce((sum, c) => {
        const stats = c.stats as { results?: number } | null;
        return sum + (stats?.results ?? 0);
      }, 0);
      rows.push(this.toRow(this.label(provider), spend, results, null));
    }

    const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0);
    const totalResults = rows.reduce((sum, r) => sum + r.results, 0);
    const totalDelivered = whatsappDelivered + emailDelivered;

    return {
      channels: rows,
      totals: {
        spend: totalSpend,
        results: totalResults,
        delivered: totalDelivered,
        blendedCostPerResult:
          totalResults > 0 ? round2(totalSpend / totalResults) : null,
        redemptions: redemptions._count,
        revenue: Number(redemptions._sum.total ?? 0),
      },
    };
  }

  private toRow(
    channel: string,
    spend: number,
    results: number,
    delivered: number | null,
  ): ChannelOverviewRow {
    return {
      channel,
      spend,
      results,
      delivered,
      costPerResult: results > 0 ? round2(spend / results) : null,
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
      case IntegrationProvider.linkedin_ads:
        return 'LinkedIn Ads';
      case IntegrationProvider.pinterest_ads:
        return 'Pinterest Ads';
      case IntegrationProvider.snapchat_ads:
        return 'Snapchat Ads';
      case IntegrationProvider.microsoft_ads:
        return 'Microsoft Ads';
      case IntegrationProvider.amazon_ads:
        return 'Amazon Ads';
      case IntegrationProvider.reddit_ads:
        return 'Reddit Ads';
      default:
        return provider;
    }
  }
}
