import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { resolvePolicies } from '../common/policies/policies.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Comparison, resolveWindow } from './brain-metrics.service';
import { BrainBusiness, BrainContext } from './brain.types';

export interface ScopeQuery {
  branch?: string;
  compare?: Comparison;
  from?: string;
  to?: string;
}

@Injectable()
export class BrainContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async build(
    user: AuthenticatedUser,
    q: ScopeQuery = {},
  ): Promise<BrainContext> {
    const ids = await this.branchScope.resolveIds(user.businessId, q.branch);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
    });
    const p = resolvePolicies(business);
    let scopeLabel = business.name;
    if (q.branch === 'all')
      scopeLabel =
        ids.length > 1 ? `All ${ids.length} branches` : business.name;
    else if (q.branch && q.branch !== user.businessId) {
      scopeLabel =
        (
          await this.prisma.business.findUnique({
            where: { id: q.branch },
            select: { name: true },
          })
        )?.name ?? business.name;
    }
    return {
      userId: user.sub,
      callerBusinessId: user.businessId,
      ids,
      scopeLabel,
      business: {
        id: business.id,
        name: business.name,
        currency: business.currency,
        locale: business.locale,
        timezone: business.timezone,
      },
      thresholds: {
        overdueDays: p.num('brain.overdueDays') ?? 30,
        stockCoverDays: p.num('brain.stockCoverDays') ?? 7,
        repeatDropPercent: p.num('brain.repeatDropPercent') ?? 10,
        marginGapPoints: p.num('brain.marginGapPoints') ?? 3,
        notableChangePercent: p.num('brain.notableChangePercent') ?? 10,
        lapsedDays: p.num('brain.lapsedDays') ?? 90,
        maxDiscountPercent: p.num('sales.maxDiscountPercent'),
      },
      window: resolveWindow(q.compare ?? 'week', q.from, q.to),
    };
  }
}

export function money(b: BrainBusiness, v: number, compact = false): string {
  const abs = Math.abs(v);
  if (compact && abs >= 1000) {
    const fmt = new Intl.NumberFormat(b.locale, {
      style: 'currency',
      currency: b.currency,
      notation: 'compact',
      maximumFractionDigits: abs >= 1_000_000 ? 2 : 1,
    });
    return fmt.format(v);
  }
  return new Intl.NumberFormat(b.locale, {
    style: 'currency',
    currency: b.currency,
    maximumFractionDigits: Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2,
  }).format(v);
}

export function pct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : ''}${r}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function clock(b: BrainBusiness, d: Date): string {
  return new Intl.DateTimeFormat(b.locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: b.timezone,
  }).format(d);
}

export function day(b: BrainBusiness, d: Date): string {
  return new Intl.DateTimeFormat(b.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: b.timezone,
  }).format(d);
}

export function ago(from: Date, now = new Date()): string {
  const m = Math.round((now.getTime() - from.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
