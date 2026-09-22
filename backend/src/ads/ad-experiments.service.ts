import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationProvider } from '@prisma/client';

export interface AdExperimentView {
  id: string;
  name: string;
  variantA: string;
  variantB: string;
  createdAt: string;
  creatives: Array<{
    id: string;
    headline: string;
    body: string;
    provider: string;
    status: string;
  }>;
}

/**
 * A/B experiments: two or more `AdCreative` rows sharing a real `experimentKey`. This shows only
 * what's real — which creatives belong together, their real copy, their real status and creation
 * date. There is no per-creative spend/conversion/CTR tracking anywhere in this schema (stats are
 * only ever recorded at the campaign level — see `AdCampaignStatsSnapshot`), so this deliberately
 * does not show a "winner", a cost figure, or a confidence verdict for an experiment — there is no
 * real signal behind any of those. A previous version of this screen fabricated all of them
 * (a fixed formula for spend, a hardcoded cost-per-conversion, and always picking variant A as the
 * "winner") plus three entirely invented example experiments shown when none existed.
 */
@Injectable()
export class AdExperimentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(): Promise<AdExperimentView[]> {
    const creatives = await this.tenantPrisma.client.adCreative.findMany({
      where: { experimentKey: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    const groups = new Map<string, typeof creatives>();
    for (const c of creatives) {
      if (!c.experimentKey) continue;
      const list = groups.get(c.experimentKey) ?? [];
      list.push(c);
      groups.set(c.experimentKey, list);
    }

    return [...groups.entries()].map(([key, items]) => {
      const title = key.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      const [a, b] = items;
      return {
        id: key,
        name: title,
        variantA: a?.headline || 'Variant A',
        variantB: b?.headline || 'Variant B',
        createdAt: (items.reduce((oldest, i) => (i.createdAt < oldest ? i.createdAt : oldest), items[0].createdAt)).toISOString(),
        creatives: items.map((i) => ({
          id: i.id,
          headline: i.headline,
          body: i.body,
          provider: i.provider,
          status: i.status,
        })),
      };
    });
  }

  async create(
    businessId: string,
    dto: {
      name: string;
      provider: IntegrationProvider;
      campaignId?: string;
      variantAHeadline: string;
      variantABody: string;
      variantBHeadline: string;
      variantBBody: string;
    },
  ) {
    const experimentKey = `exp-${Date.now()}`;

    const creativeA = await this.tenantPrisma.client.adCreative.create({
      data: {
        businessId,
        provider: dto.provider,
        campaignId: dto.campaignId,
        headline: dto.variantAHeadline,
        body: dto.variantABody,
        experimentKey,
        status: 'active',
      },
    });

    const creativeB = await this.tenantPrisma.client.adCreative.create({
      data: {
        businessId,
        provider: dto.provider,
        campaignId: dto.campaignId,
        headline: dto.variantBHeadline,
        body: dto.variantBBody,
        experimentKey,
        status: 'active',
      },
    });

    return {
      id: experimentKey,
      name: dto.name,
      creatives: [creativeA, creativeB],
    };
  }
}
