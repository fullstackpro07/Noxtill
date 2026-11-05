import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Remedy, UsageLimitException } from './usage.exception';
import {
  PURCHASABLES,
  PurchaseKey,
  USAGE_ERROR_CODES,
} from './usage.constants';

const PURCHASE_FOR_METRIC: Record<string, PurchaseKey> = {
  ai_credits: 'credits',
  users: 'seat',
  locations: 'location',
  phone_numbers_local: 'localnum',
  phone_numbers_tollfree: 'tollfree',
  agent_seats: 'agentseat',
};

/**
 * Builds the `remedies[]` every limit error carries (spec §8.2). Only plans that actually include
 * MORE of the metric (or include the feature) are ever offered — never a plan that wouldn't help.
 */
@Injectable()
export class RemediesService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    metric: string,
    current: { planKey: string; included: number | null; trialing: boolean },
  ): Promise<Remedy[]> {
    const remedies: Remedy[] = [];
    const purchaseKey = PURCHASE_FOR_METRIC[metric];
    if (purchaseKey) {
      const def = PURCHASABLES[purchaseKey];
      // Recurring add-ons attach to a paid subscription, so they aren't offered during a trial.
      if (!(def.recurring && current.trialing)) {
        const price = await this.prisma.meterPrice.findFirst({
          where: { metricCode: def.metricCode, countryCode: '' },
          orderBy: { effectiveFrom: 'desc' },
        });
        remedies.push({
          type: 'purchase',
          label: `Buy ${def.label}`,
          target: purchaseKey,
          priceUsd: price ? Number(price.unitPriceUsd) : undefined,
        });
      }
    }
    const plans = await this.prisma.plan.findMany({
      where: { status: 'active', purchasable: true, displayOrder: { gt: 0 } },
      include: { entitlements: { where: { metricCode: metric } } },
      orderBy: { displayOrder: 'asc' },
    });
    for (const plan of plans) {
      if (plan.key === current.planKey) continue;
      const inc = plan.entitlements[0]?.includedQuantity;
      if (inc == null) continue;
      const grants = Number(inc);
      if (grants > (current.included ?? 0)) {
        remedies.push({
          type: 'upgrade',
          label: plan.name,
          target: plan.key,
          grants,
        });
      }
    }
    return remedies;
  }

  async throwLimit(
    code: (typeof USAGE_ERROR_CODES)[keyof typeof USAGE_ERROR_CODES],
    message: string,
    metric: string,
    current: { planKey: string; included: number | null; trialing: boolean },
    extra: {
      remaining?: number | null;
      resetsAt?: string | null;
      remedies?: Remedy[];
    } = {},
  ): Promise<never> {
    const status =
      code === USAGE_ERROR_CODES.FEATURE_NOT_IN_PLAN ||
      code === USAGE_ERROR_CODES.CAPACITY_REACHED ||
      code === USAGE_ERROR_CODES.TRIAL_METERED_DISABLED
        ? HttpStatus.FORBIDDEN
        : code === USAGE_ERROR_CODES.METRIC_NOT_CONFIGURED
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.PAYMENT_REQUIRED;
    const remedies = extra.remedies ?? (await this.build(metric, current));
    throw new UsageLimitException(code, message, status, {
      metric,
      remaining: extra.remaining ?? null,
      resetsAt: extra.resetsAt ?? null,
      remedies,
    });
  }
}
