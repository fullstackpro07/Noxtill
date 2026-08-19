import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AdCampaignStats } from './ads.constants';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface AdBudgetRow {
  provider: string;
  campaignCount: number;
  totalDailyBudget: number;
}

export interface AdPerformanceRow {
  provider: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number | null;
  costPerResult: number | null;
}

/** Budget & Spend, Ad Performance (UPD-BE-071) — real cross-platform rollup over every stored `AdCampaign`. */
@Injectable()
export class AdAnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async budget(): Promise<{ rows: AdBudgetRow[]; totalDailyBudget: number }> {
    const campaigns = await this.tenantPrisma.client.adCampaign.findMany({
      where: { status: { not: 'draft' } },
    });

    const byProvider = new Map<string, AdBudgetRow>();
    for (const campaign of campaigns) {
      const row = byProvider.get(campaign.provider) ?? {
        provider: campaign.provider,
        campaignCount: 0,
        totalDailyBudget: 0,
      };
      row.campaignCount += 1;
      row.totalDailyBudget = round2(
        row.totalDailyBudget + Number(campaign.budget),
      );
      byProvider.set(campaign.provider, row);
    }

    const rows = [...byProvider.values()];
    return {
      rows,
      totalDailyBudget: round2(
        rows.reduce((sum, r) => sum + r.totalDailyBudget, 0),
      ),
    };
  }

  async performance(): Promise<AdPerformanceRow[]> {
    const campaigns = await this.tenantPrisma.client.adCampaign.findMany();

    const byProvider = new Map<
      string,
      { spend: number; impressions: number; clicks: number; results: number }
    >();
    for (const campaign of campaigns) {
      const stats = (campaign.stats as AdCampaignStats | null) ?? {};
      const row = byProvider.get(campaign.provider) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        results: 0,
      };
      row.spend += stats.spend ?? 0;
      row.impressions += stats.impressions ?? 0;
      row.clicks += stats.clicks ?? 0;
      row.results += stats.results ?? 0;
      byProvider.set(campaign.provider, row);
    }

    return [...byProvider.entries()].map(([provider, totals]) => ({
      provider,
      spend: round2(totals.spend),
      impressions: totals.impressions,
      clicks: totals.clicks,
      results: totals.results,
      ctr:
        totals.impressions > 0
          ? round2((totals.clicks / totals.impressions) * 100)
          : null,
      costPerResult:
        totals.results > 0 ? round2(totals.spend / totals.results) : null,
    }));
  }
}
