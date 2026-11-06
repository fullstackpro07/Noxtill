import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../../usage/entitlements.service';
import { CreditsService } from '../../usage/credits.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminTenantsService } from './admin-tenants.service';
import type { AdminAuditContext } from '../super-admin.decorators';
import {
  badRequest,
  dateRange,
  num,
  pageArgs,
  PageQuery,
  toCsv,
} from '../super-admin.util';

const COMM_METRICS = {
  whatsapp: 'whatsapp_messages',
  sms: 'sms_segments',
  email: 'emails',
} as const;

type RangeQuery = { from?: string; to?: string };

function rangeOrDefault(q: RangeQuery, days = 30) {
  return (
    dateRange(q.from, q.to) ?? {
      gte: new Date(Date.now() - days * 86_400_000),
    }
  );
}

/**
 * Cross-tenant monitoring reads (PRD §8.1/§8.5, §10, §11, §12, §13, §14). Every number comes from
 * a real table: `usage_events`, `credit_ledger`, `credit_balances`, `messages`, `email_events`,
 * `activity_events`, `audit_log`, `security_events`, `sessions`, `integrations`. Where a signal is
 * not captured anywhere, the response says so instead of inventing it.
 */
@Injectable()
export class AdminMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly credits: CreditsService,
    private readonly tenants: AdminTenantsService,
    private readonly audit: AdminAuditService,
  ) {}

  private async businessNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map<string, string>();
    const rows = await this.prisma.business.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async userNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map<string, string>();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async scope(businessId?: string): Promise<string[] | undefined> {
    if (!businessId) return undefined;
    const rootId = await this.tenants.rootIdOrThrow(businessId);
    return this.tenants.groupIds(rootId);
  }

  // ------------------------------------------------------------------ usage

  async usageOverview(
    q: RangeQuery & { businessId?: string; metric?: string },
  ) {
    const occurredAt = rangeOrDefault(q);
    const ids = await this.scope(q.businessId);
    const where: Prisma.UsageEventWhereInput = {
      occurredAt,
      ...(ids ? { businessId: { in: ids } } : {}),
    };
    const [byMetric, meters, top] = await Promise.all([
      this.prisma.usageEvent.groupBy({
        by: ['metricCode', 'status'],
        where,
        _sum: { quantity: true, costUsd: true, priceUsd: true },
        _count: { _all: true },
      }),
      this.prisma.meterDefinition.findMany({
        orderBy: [{ sortOrder: 'asc' }, { metricCode: 'asc' }],
      }),
      q.metric
        ? this.prisma.usageEvent.groupBy({
            by: ['businessId'],
            where: { ...where, metricCode: q.metric, status: 'completed' },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 10,
          })
        : Promise.resolve(
            [] as {
              businessId: string;
              _sum: { quantity: Prisma.Decimal | null };
            }[],
          ),
    ]);
    const names = await this.businessNames(top.map((t) => t.businessId));
    const metrics = meters.map((m) => {
      const rows = byMetric.filter((r) => r.metricCode === m.metricCode);
      const completed = rows.filter((r) => r.status === 'completed');
      return {
        metricCode: m.metricCode,
        displayName: m.displayName,
        unit: m.unit,
        kind: m.kind,
        quantity: completed.reduce((a, r) => a + num(r._sum.quantity), 0),
        events: rows.reduce((a, r) => a + r._count._all, 0),
        failed: rows
          .filter((r) => ['failed', 'refused'].includes(r.status))
          .reduce((a, r) => a + r._count._all, 0),
        costUsd: completed.reduce((a, r) => a + num(r._sum.costUsd), 0),
        priceUsd: completed.reduce((a, r) => a + num(r._sum.priceUsd), 0),
      };
    });
    return {
      range: { from: occurredAt.gte ?? null, to: occurredAt.lte ?? null },
      metrics,
      // Live counts (not events): seats and locations across all tenants right now.
      live: {
        users: await this.prisma.businessUser
          .groupBy({ by: ['userId'], where: { active: true } })
          .then((r) => r.length),
        locations: await this.prisma.business.count({
          where: { active: true },
        }),
      },
      top: top.map((t) => ({
        businessId: t.businessId,
        name: names.get(t.businessId) ?? t.businessId,
        quantity: num(t._sum.quantity),
      })),
    };
  }

  async usageRecords(
    q: PageQuery &
      RangeQuery & {
        businessId?: string;
        metric?: string;
        status?: string;
        userId?: string;
      },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const ids = await this.scope(q.businessId);
    const occurredAt = dateRange(q.from, q.to);
    const where: Prisma.UsageEventWhereInput = {
      ...(ids ? { businessId: { in: ids } } : {}),
      ...(q.metric ? { metricCode: q.metric } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.userId ? { actorUserId: q.userId } : {}),
      ...(occurredAt ? { occurredAt } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.usageEvent.count({ where }),
      this.prisma.usageEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);
    const [biz, users] = await Promise.all([
      this.businessNames(rows.map((r) => r.businessId)),
      this.userNames(rows.map((r) => r.actorUserId)),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        business: {
          id: r.businessId,
          name: biz.get(r.businessId) ?? r.businessId,
        },
        user: r.actorUserId
          ? {
              id: r.actorUserId,
              name: users.get(r.actorUserId) ?? r.actorUserId,
            }
          : null,
        metricCode: r.metricCode,
        operationCode: r.operationCode,
        quantity: num(r.quantity),
        unit: r.unit,
        costUsd: r.costUsd == null ? null : num(r.costUsd),
        priceUsd: r.priceUsd == null ? null : num(r.priceUsd),
        provider: r.provider,
        providerRef: r.providerRef,
        countryCode: r.countryCode,
        status: r.status,
        occurredAt: r.occurredAt,
        recordedAt: r.recordedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // --------------------------------------------------------------------- AI

  async ai(q: RangeQuery & { businessId?: string }) {
    const range = rangeOrDefault(q);
    const ids = await this.scope(q.businessId);
    const scoped = ids ? { businessId: { in: ids } } : {};
    const [settled, failed, byOp, byBiz, balances, providers] =
      await Promise.all([
        this.prisma.creditLedger.aggregate({
          where: { ...scoped, state: 'committed', settledAt: range },
          _sum: { actualQty: true },
          _count: { _all: true },
        }),
        this.prisma.creditLedger.count({
          where: {
            ...scoped,
            state: { in: ['released', 'expired'] },
            reservedAt: range,
          },
        }),
        this.prisma.creditLedger.groupBy({
          by: ['operationCode'],
          where: { ...scoped, state: 'committed', settledAt: range },
          _sum: { actualQty: true },
          _count: { _all: true },
          orderBy: { _sum: { actualQty: 'desc' } },
          take: 25,
        }),
        this.prisma.creditLedger.groupBy({
          by: ['businessId'],
          where: { ...scoped, state: 'committed', settledAt: range },
          _sum: { actualQty: true },
          orderBy: { _sum: { actualQty: 'desc' } },
          take: 10,
        }),
        this.prisma.creditBalance.aggregate({
          where: ids ? { businessId: { in: ids } } : {},
          _sum: {
            includedQuantity: true,
            includedUsed: true,
            purchasedBalance: true,
            purchasedUsed: true,
            reserved: true,
          },
          _count: { _all: true },
        }),
        this.prisma.usageEvent.groupBy({
          by: ['provider'],
          where: {
            ...scoped,
            metricCode: 'ai_credits',
            status: 'completed',
            occurredAt: range,
          },
          _sum: { quantity: true },
          _count: { _all: true },
        }),
      ]);
    const names = await this.businessNames(byBiz.map((b) => b.businessId));
    const s = balances._sum;
    const allocated =
      num(s.includedQuantity) + num(s.purchasedBalance) + num(s.purchasedUsed);
    const used = num(s.includedUsed) + num(s.purchasedUsed);
    return {
      range: { from: range.gte ?? null, to: range.lte ?? null },
      currentPeriod: {
        businesses: balances._count._all,
        allocated,
        consumed: used,
        reserved: num(s.reserved),
        remaining: Math.max(0, allocated - used - num(s.reserved)),
      },
      inRange: {
        creditsConsumed: num(settled._sum.actualQty),
        requests: settled._count._all,
        failedOrReleased: failed,
      },
      // Not captured anywhere: per-request latency.
      averageResponseMs: null,
      byOperation: byOp.map((o) => ({
        operationCode: o.operationCode,
        module: o.operationCode.split('.')[0],
        credits: num(o._sum.actualQty),
        requests: o._count._all,
      })),
      byBusiness: byBiz.map((b) => ({
        businessId: b.businessId,
        name: names.get(b.businessId) ?? b.businessId,
        credits: num(b._sum.actualQty),
      })),
      byProvider: providers.map((p) => ({
        provider: p.provider,
        credits: num(p._sum.quantity),
        events: p._count._all,
      })),
    };
  }

  async aiBalances(q: PageQuery & { search?: string }) {
    const { page, pageSize, skip, take } = pageArgs(q);
    let businessFilter: Prisma.CreditBalanceWhereInput = {};
    if (q.search?.trim()) {
      const biz = await this.prisma.business.findMany({
        where: {
          parentId: null,
          OR: [
            { name: { contains: q.search.trim() } },
            { id: q.search.trim() },
          ],
        },
        select: { id: true },
        take: 500,
      });
      businessFilter = { businessId: { in: biz.map((b) => b.id) } };
    }
    const [total, rows] = await Promise.all([
      this.prisma.creditBalance.count({ where: businessFilter }),
      this.prisma.creditBalance.findMany({
        where: businessFilter,
        orderBy: [{ updatedAt: 'desc' }, { businessId: 'asc' }],
        skip,
        take,
      }),
    ]);
    const names = await this.businessNames(rows.map((r) => r.businessId));
    return {
      items: rows.map((r) => ({
        businessId: r.businessId,
        name: names.get(r.businessId) ?? r.businessId,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        included: r.includedQuantity,
        includedUsed: r.includedUsed,
        purchasedRemaining: r.purchasedBalance,
        purchasedUsed: r.purchasedUsed,
        reserved: r.reserved,
      })),
      total,
      page,
      pageSize,
    };
  }

  async aiLedger(id: string, q: PageQuery) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const { page, pageSize, skip, take } = pageArgs(q);
    const [total, rows, adjustments] = await Promise.all([
      this.prisma.creditLedger.count({ where: { businessId: rootId } }),
      this.prisma.creditLedger.findMany({
        where: { businessId: rootId },
        orderBy: [{ reservedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.usageEvent.findMany({
        where: {
          businessId: rootId,
          metricCode: 'ai_credits',
          status: 'allocated',
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
    ]);
    return {
      items: rows,
      total,
      page,
      pageSize,
      allocations: adjustments.map((a) => ({
        id: a.id,
        operationCode: a.operationCode,
        quantity: num(a.quantity),
        occurredAt: a.occurredAt,
        metadata: a.metadata,
      })),
    };
  }

  /**
   * Admin credit adjustment (PRD §12.2): moves the purchased bucket (which never expires), with an
   * `allocated` usage event carrying the admin and the reason, plus the audit row — one transaction.
   * A deduction can only take back credits that are still unused.
   */
  async adjustCredits(
    id: string,
    delta: number,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000)
      throw badRequest(
        'Adjust by a whole number of credits (not 0, at most 1,000,000).',
      );
    await this.credits.ensureBalance(rootId);
    const adjustmentId = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const bal = await tx.creditBalance.findUniqueOrThrow({
        where: { businessId: rootId },
      });
      if (delta < 0 && bal.purchasedBalance < -delta)
        throw badRequest(
          `Only ${bal.purchasedBalance} added credits are unused, so at most ${bal.purchasedBalance} can be taken back.`,
        );
      const changed = await tx.$executeRaw`
        UPDATE credit_balances SET purchased_balance = purchased_balance + ${delta}
         WHERE business_id = ${rootId} AND purchased_balance + ${delta} >= 0`;
      if (Number(changed) !== 1)
        throw badRequest('The balance changed; try again.');
      await tx.usageEvent.create({
        data: {
          businessId: rootId,
          metricCode: 'ai_credits',
          operationCode: delta > 0 ? 'admin.grant' : 'admin.deduct',
          quantity: delta,
          unit: 'credit',
          status: 'allocated',
          idempotencyKey: `admin_adjust:${adjustmentId}`,
          occurredAt: new Date(),
          metadata: {
            adminId: ctx.admin.id,
            adminEmail: ctx.admin.email,
            reason: text,
          },
        },
      });
      await tx.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId: ctx.admin.id,
          actorType: 'admin',
          changeType: 'purchase',
          before: { purchasedBalance: bal.purchasedBalance },
          after: { purchasedBalance: bal.purchasedBalance + delta, delta },
          reason: `Super Admin credit adjustment: ${text}`,
        },
      });
      await this.audit.record(tx, ctx, {
        action: delta > 0 ? 'ai.credits_granted' : 'ai.credits_deducted',
        resourceType: 'credit_balance',
        resourceId: rootId,
        businessId: rootId,
        before: { purchasedBalance: bal.purchasedBalance },
        after: {
          purchasedBalance: bal.purchasedBalance + delta,
          delta,
          adjustmentId,
        },
        reason: text,
      });
      return { purchasedBalance: bal.purchasedBalance + delta };
    });
    await this.entitlements.invalidate(rootId);
    return result;
  }

  // --------------------------------------------------------- communications

  async communications(
    q: RangeQuery & { businessId?: string; channel?: string },
  ) {
    const range = rangeOrDefault(q);
    const ids = await this.scope(q.businessId);
    const scoped = ids ? { businessId: { in: ids } } : {};
    const channels = (['whatsapp', 'sms', 'email'] as const).filter(
      (c) => !q.channel || q.channel === c,
    );
    const out: Record<string, unknown> = {};
    for (const channel of channels) {
      const metric = COMM_METRICS[channel];
      const [byStatus, byCategory, usage, byCountry, topBiz] =
        await Promise.all([
          this.prisma.message.groupBy({
            by: ['status'],
            where: {
              ...scoped,
              channel: channel,
              createdAt: range,
            },
            _count: { _all: true },
          }),
          this.prisma.message.groupBy({
            by: ['category'],
            where: {
              ...scoped,
              channel: channel,
              createdAt: range,
            },
            _count: { _all: true },
          }),
          this.prisma.usageEvent.groupBy({
            by: ['status'],
            where: { ...scoped, metricCode: metric, occurredAt: range },
            _sum: { quantity: true, costUsd: true, priceUsd: true },
            _count: { _all: true },
          }),
          this.prisma.usageEvent.groupBy({
            by: ['countryCode'],
            where: {
              ...scoped,
              metricCode: metric,
              status: 'completed',
              occurredAt: range,
            },
            _sum: { quantity: true, costUsd: true, priceUsd: true },
          }),
          this.prisma.usageEvent.groupBy({
            by: ['businessId'],
            where: {
              ...scoped,
              metricCode: metric,
              status: 'completed',
              occurredAt: range,
            },
            _sum: { quantity: true, costUsd: true, priceUsd: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 10,
          }),
        ]);
      const names = await this.businessNames(topBiz.map((t) => t.businessId));
      const completed = usage.find((u) => u.status === 'completed');
      out[channel] = {
        metricCode: metric,
        messages: Object.fromEntries(
          byStatus.map((s) => [s.status, s._count._all]),
        ),
        categories: Object.fromEntries(
          byCategory.map((s) => [s.category, s._count._all]),
        ),
        metered: {
          quantity: num(completed?._sum.quantity),
          costUsd: num(completed?._sum.costUsd),
          priceUsd: num(completed?._sum.priceUsd),
          marginUsd:
            num(completed?._sum.priceUsd) - num(completed?._sum.costUsd),
          failed: usage
            .filter((u) => ['failed', 'refused'].includes(u.status))
            .reduce((a, u) => a + u._count._all, 0),
        },
        byCountry: byCountry.map((c) => ({
          countryCode: c.countryCode || null,
          quantity: num(c._sum.quantity),
          costUsd: num(c._sum.costUsd),
          priceUsd: num(c._sum.priceUsd),
        })),
        topBusinesses: topBiz.map((t) => ({
          businessId: t.businessId,
          name: names.get(t.businessId) ?? t.businessId,
          quantity: num(t._sum.quantity),
          costUsd: num(t._sum.costUsd),
          priceUsd: num(t._sum.priceUsd),
        })),
      };
    }
    if (channels.includes('email')) {
      const emailEvents = await this.prisma.emailEvent.groupBy({
        by: ['type'],
        where: {
          createdAt: range,
          ...(ids ? { emailCampaign: { businessId: { in: ids } } } : {}),
        },
        _count: { _all: true },
      });
      (out.email as Record<string, unknown>).campaignEvents =
        Object.fromEntries(emailEvents.map((e) => [e.type, e._count._all]));
    }
    if (channels.includes('whatsapp')) {
      (out.whatsapp as Record<string, unknown>).connectedAccounts =
        await this.prisma.integration.count({
          where: { ...scoped, provider: 'whatsapp', status: 'connected' },
        });
    }
    return {
      range: { from: range.gte ?? null, to: range.lte ?? null },
      spendCaps: await this.prisma.usageSpendCap
        .aggregate({
          where: {
            ...(ids ? { businessId: { in: ids } } : {}),
            capGroup: 'messaging',
          },
          _sum: { capUsd: true },
          _count: { _all: true },
        })
        .then((r) => ({
          businesses: r._count._all,
          totalCapUsd: num(r._sum.capUsd),
        })),
      channels: out,
    };
  }

  // --------------------------------------------------------------- activity

  async activity(
    q: PageQuery &
      RangeQuery & {
        source?: string;
        businessId?: string;
        userId?: string;
        type?: string;
        search?: string;
      },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const ids = await this.scope(q.businessId);
    const createdAt = dateRange(q.from, q.to);
    if (q.source === 'changes') {
      const where: Prisma.AuditLogWhereInput = {
        ...(ids ? { businessId: { in: ids } } : {}),
        ...(q.userId ? { actorUserId: q.userId } : {}),
        ...(q.type ? { entity: q.type } : {}),
        ...(q.search
          ? { OR: [{ action: { contains: q.search } }, { entityId: q.search }] }
          : {}),
        ...(createdAt ? { createdAt } : {}),
      };
      const [total, rows] = await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
        }),
      ]);
      const [biz, users] = await Promise.all([
        this.businessNames(rows.map((r) => r.businessId)),
        this.userNames(rows.map((r) => r.actorUserId)),
      ]);
      return {
        source: 'changes',
        items: rows.map((r) => ({
          id: r.id,
          business: {
            id: r.businessId,
            name: biz.get(r.businessId) ?? r.businessId,
          },
          user: r.actorUserId
            ? {
                id: r.actorUserId,
                name: users.get(r.actorUserId) ?? r.actorUserId,
              }
            : null,
          module: r.entity,
          action: r.action,
          resource: `${r.entity}:${r.entityId}`,
          before: r.before,
          after: r.after,
          createdAt: r.createdAt,
        })),
        total,
        page,
        pageSize,
      };
    }
    if (q.source === 'events') {
      const where: Prisma.EventWhereInput = {
        ...(ids ? { businessId: { in: ids } } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.type ? { name: q.type } : {}),
        ...(createdAt ? { createdAt } : {}),
      };
      const [total, rows] = await Promise.all([
        this.prisma.event.count({ where }),
        this.prisma.event.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
        }),
      ]);
      const [biz, users] = await Promise.all([
        this.businessNames(rows.map((r) => r.businessId)),
        this.userNames(rows.map((r) => r.userId)),
      ]);
      return {
        source: 'events',
        items: rows.map((r) => ({
          id: r.id,
          business: r.businessId
            ? { id: r.businessId, name: biz.get(r.businessId) ?? r.businessId }
            : null,
          user: r.userId
            ? { id: r.userId, name: users.get(r.userId) ?? r.userId }
            : null,
          action: r.name,
          details: r.properties,
          createdAt: r.createdAt,
        })),
        total,
        page,
        pageSize,
      };
    }
    const where: Prisma.ActivityEventWhereInput = {
      ...(ids ? { businessId: { in: ids } } : {}),
      ...(q.userId ? { actorUserId: q.userId } : {}),
      ...(q.type
        ? { type: q.type as Prisma.EnumActivityEventTypeFilter['equals'] }
        : {}),
      ...(q.search
        ? {
            OR: [
              { description: { contains: q.search } },
              { entityId: q.search },
            ],
          }
        : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.activityEvent.count({ where }),
      this.prisma.activityEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);
    const [biz, users] = await Promise.all([
      this.businessNames(rows.map((r) => r.businessId)),
      this.userNames(rows.map((r) => r.actorUserId)),
    ]);
    return {
      source: 'activity',
      items: rows.map((r) => ({
        id: r.id,
        business: {
          id: r.businessId,
          name: biz.get(r.businessId) ?? r.businessId,
        },
        user: r.actorUserId
          ? {
              id: r.actorUserId,
              name: users.get(r.actorUserId) ?? r.actorUserId,
            }
          : null,
        module: r.type,
        action: r.description,
        resource: r.entityType ? `${r.entityType}:${r.entityId ?? ''}` : null,
        amount: r.amount == null ? null : num(r.amount),
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** CSV export — permission-gated (`activity.export`) and audited by the caller. Max 10k rows. */
  async activityCsv(
    q: Parameters<AdminMonitoringService['activity']>[0],
    ctx: AdminAuditContext,
  ) {
    const result = await this.activity({ ...q, page: '1', pageSize: '10000' });
    await this.audit.record(this.prisma, ctx, {
      action: 'activity.exported',
      resourceType: 'export',
      resourceId: result.source,
      businessId: q.businessId ?? null,
      after: { rows: result.items.length, filters: q },
      reason: 'Activity CSV export',
    });
    const items = result.items as Record<string, unknown>[];
    return toCsv(
      ['id', 'createdAt', 'business', 'user', 'module', 'action', 'resource'],
      items.map((i) => [
        i.id,
        i.createdAt,
        (i.business as { name?: string } | null)?.name ?? '',
        (i.user as { name?: string } | null)?.name ?? '',
        i.module ?? '',
        i.action,
        i.resource ?? '',
      ]),
    );
  }

  // --------------------------------------------------------------- security

  async securityOverview(q: RangeQuery) {
    const range = rangeOrDefault(q, 7);
    const now = new Date();
    const activeSince = new Date(Date.now() - 7 * 86_400_000);
    const [
      byType,
      bySeverity,
      activeSessions,
      locked,
      mfaUsers,
      totalUsers,
      suspendedUsers,
      adminChanges,
      recentHigh,
      adminSessions,
    ] = await Promise.all([
      this.prisma.securityEvent.groupBy({
        by: ['type'],
        where: { createdAt: range },
        _count: { _all: true },
      }),
      this.prisma.securityEvent.groupBy({
        by: ['severity'],
        where: { createdAt: range },
        _count: { _all: true },
      }),
      this.prisma.session.count({
        where: { revokedAt: null, lastUsedAt: { gte: activeSince } },
      }),
      this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      this.prisma.user.count({ where: { twoFactorEnabled: true } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { platformStatus: 'suspended' } }),
      this.prisma.platformAuditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 10,
      }),
      this.prisma.securityEvent.findMany({
        where: { createdAt: range, severity: { in: ['high', 'critical'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 20,
      }),
      this.prisma.platformAdminSession.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    const count = (t: string) =>
      byType.find((b) => b.type === t)?._count._all ?? 0;
    const firstEvent = await this.prisma.securityEvent.findFirst({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true },
    });
    return {
      range: { from: range.gte ?? null, to: range.lte ?? null },
      trackingSince: firstEvent?.createdAt ?? null,
      logins: {
        successful: count('login_success') + count('login_new_device'),
        failed:
          count('login_failed') +
          count('login_unknown_account') +
          count('two_factor_failed'),
        newDevice: count('login_new_device'),
        lockouts: count('account_locked'),
        blockedSuspended: count('login_blocked_suspended'),
      },
      admin: {
        failed: count('admin_login_failed') + count('admin_totp_failed'),
        lockouts: count('admin_locked'),
        activeSessions: adminSessions,
      },
      permissionDenied: count('permission_denied'),
      rateLimited: count('rate_limited'),
      bySeverity: Object.fromEntries(
        bySeverity.map((s) => [s.severity, s._count._all]),
      ),
      byType: Object.fromEntries(byType.map((s) => [s.type, s._count._all])),
      activeSessions,
      lockedAccounts: locked,
      suspendedUsers,
      mfa: { enabled: mfaUsers, total: totalUsers },
      recentAlerts: recentHigh,
      recentAdminChanges: adminChanges,
      notDetected: [
        'Unusual-location sign-ins (no IP geolocation source is configured)',
      ],
    };
  }

  async securityEvents(
    q: PageQuery &
      RangeQuery & {
        type?: string;
        severity?: string;
        businessId?: string;
        userId?: string;
        ip?: string;
        search?: string;
      },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const ids = await this.scope(q.businessId);
    const createdAt = dateRange(q.from, q.to);
    const where: Prisma.SecurityEventWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(ids ? { businessId: { in: ids } } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.ip ? { ipAddress: q.ip } : {}),
      ...(q.search ? { identifier: { contains: q.search } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.securityEvent.count({ where }),
      this.prisma.securityEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);
    const [biz, users] = await Promise.all([
      this.businessNames(rows.map((r) => r.businessId)),
      this.userNames(rows.map((r) => r.userId)),
    ]);
    return {
      items: rows.map((r) => ({
        ...r,
        business: r.businessId
          ? { id: r.businessId, name: biz.get(r.businessId) ?? r.businessId }
          : null,
        user: r.userId
          ? { id: r.userId, name: users.get(r.userId) ?? r.userId }
          : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async sessions(
    q: PageQuery & { businessId?: string; userId?: string; search?: string },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const ids = await this.scope(q.businessId);
    const where: Prisma.SessionWhereInput = {
      revokedAt: null,
      ...(ids ? { businessId: { in: ids } } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.search
        ? {
            OR: [
              { ipAddress: { contains: q.search } },
              { user: { email: { contains: q.search } } },
              { user: { name: { contains: q.search } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        orderBy: [{ lastUsedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastUsedAt: true,
          user: { select: { id: true, name: true, email: true } },
          business: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  // ----------------------------------------------------------- integrations

  async integrations(
    q: PageQuery & { provider?: string; status?: string; businessId?: string },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const ids = await this.scope(q.businessId);
    const where: Prisma.IntegrationWhereInput = {
      ...(ids ? { businessId: { in: ids } } : {}),
      ...(q.provider
        ? { provider: q.provider as Prisma.IntegrationWhereInput['provider'] }
        : {}),
      ...(q.status
        ? { status: q.status as Prisma.IntegrationWhereInput['status'] }
        : { status: { not: 'not_connected' } }),
    };
    const [total, rows, byProvider] = await Promise.all([
      this.prisma.integration.count({ where }),
      this.prisma.integration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        // `tokens` and `meta` are never selected — credentials stay out of the console (PRD §14).
        select: {
          id: true,
          businessId: true,
          provider: true,
          status: true,
          connectedAt: true,
          lastSyncAt: true,
          pausedAt: true,
          updatedAt: true,
          business: { select: { name: true } },
        },
      }),
      this.prisma.integration.groupBy({
        by: ['provider', 'status'],
        _count: { _all: true },
      }),
    ]);
    const lastLogs = rows.length
      ? await this.prisma.integrationSyncLog.findMany({
          where: {
            OR: rows.map((r) => ({
              businessId: r.businessId,
              provider: r.provider,
            })),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 500,
          select: {
            businessId: true,
            provider: true,
            success: true,
            message: true,
            createdAt: true,
            recordsFailed: true,
          },
        })
      : [];
    return {
      summary: byProvider.map((b) => ({
        provider: b.provider,
        status: b.status,
        count: b._count._all,
      })),
      items: rows.map((r) => {
        const logs = lastLogs.filter(
          (l) => l.businessId === r.businessId && l.provider === r.provider,
        );
        const lastSuccess = logs.find((l) => l.success);
        const lastError = logs.find((l) => !l.success);
        return {
          id: r.id,
          business: { id: r.businessId, name: r.business.name },
          provider: r.provider,
          status: r.status,
          connectedAt: r.connectedAt,
          lastSyncAt: r.lastSyncAt,
          pausedAt: r.pausedAt,
          lastSuccessfulSyncAt: lastSuccess?.createdAt ?? null,
          lastError: lastError
            ? {
                at: lastError.createdAt,
                message: lastError.message,
                recordsFailed: lastError.recordsFailed,
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }
}
