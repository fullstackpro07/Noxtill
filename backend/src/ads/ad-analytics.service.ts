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

export interface AdFunnelStage {
  label: string;
  value: number;
  widthPercent: number;
}

export interface AdDailyHistoryPoint {
  date: string;
  spend: number;
  results: number;
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

  /**
   * Real funnel from real stored numbers only. There is no landing-page-view, add-to-cart or
   * click-to-order tracking anywhere in this schema, so this stops at what is actually measured:
   * impressions and clicks (from each campaign's own provider-reported `stats`), leads (real
   * `AdLead` rows), and orders (real completed `Order` rows) — it does not claim those orders were
   * caused by an ad click, only that they exist. Width is a real percentage of impressions, not a
   * fixed shape.
   */
  async funnel(): Promise<AdFunnelStage[]> {
    const campaigns = await this.tenantPrisma.client.adCampaign.findMany();
    let impressions = 0;
    let clicks = 0;
    for (const c of campaigns) {
      const stats = (c.stats as AdCampaignStats | null) ?? {};
      impressions += stats.impressions ?? 0;
      clicks += stats.clicks ?? 0;
    }
    const leads = await this.tenantPrisma.client.adLead.count();
    const orders = await this.tenantPrisma.client.order.count({ where: { status: 'completed' } });

    const widthOf = (n: number) => (impressions > 0 ? Math.min(100, Math.round((n / impressions) * 100)) : 0);
    return [
      { label: 'Impressions', value: impressions, widthPercent: impressions > 0 ? 100 : 0 },
      { label: 'Clicks', value: clicks, widthPercent: widthOf(clicks) },
      { label: 'Leads', value: leads, widthPercent: widthOf(leads) },
      { label: 'Completed orders', value: orders, widthPercent: widthOf(orders) },
    ];
  }

  /**
   * Real per-day spend/results, aggregated from `AdCampaignStatsSnapshot` (captured hourly by
   * `AdStatsSyncProcessor`). This is what a trend chart should read from — before this existed, the
   * Overview screen faked a trend line by multiplying today's all-time total by a fixed made-up
   * shape, which produced a line that always looked the same regardless of what actually happened.
   */
  async dailyHistory(days = 14): Promise<AdDailyHistoryPoint[]> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const snapshots = await this.tenantPrisma.client.adCampaignStatsSnapshot.findMany({
      where: { capturedAt: { gte: since } },
      orderBy: { capturedAt: 'asc' },
    });

    const byDay = new Map<string, { spend: number; results: number }>();
    for (const s of snapshots) {
      const key = s.capturedAt.toISOString().slice(0, 10);
      const row = byDay.get(key) ?? { spend: 0, results: 0 };
      row.spend += Number(s.spend);
      row.results += s.results;
      byDay.set(key, row);
    }

    const points: AdDailyHistoryPoint[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const row = byDay.get(key);
      points.push({ date: key, spend: round2(row?.spend ?? 0), results: row?.results ?? 0 });
    }
    return points;
  }
}
