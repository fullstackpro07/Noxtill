import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../../usage/entitlements.service';
import { BillingService } from '../../billing/billing.service';
import { BusinessModulesService } from '../../business-modules/business-modules.service';
import { BUSINESS_MODULES } from '../../business-modules/business-modules.constants';
import { invalidatePlatformAccessCache } from '../../common/security/platform-access.guard';
import { AdminAuditService } from './admin-audit.service';
import type { AdminAuditContext } from '../super-admin.decorators';
import {
  badRequest,
  dateRange,
  notFound,
  pageArgs,
  PageQuery,
  Paged,
} from '../super-admin.util';

export interface TenantListQuery extends PageQuery {
  search?: string;
  status?: string;
  plan?: string;
  subStatus?: string;
  country?: string;
  createdFrom?: string;
  createdTo?: string;
  inactiveDays?: string;
  sort?: string;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  owner: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  country: string | null;
  plan: { key: string; name: string } | null;
  subscriptionStatus: string | null;
  users: { used: number; allowed: number | null };
  locations: { used: number; allowed: number | null };
  modulesEnabled: number;
  modulesTotal: number;
  createdAt: string;
  lastActivityAt: string | null;
  platformStatus: string;
}

const PLATFORM_STATUSES = ['active', 'suspended', 'archived'] as const;

/**
 * Tenant directory + Tenant 360 (PRD §4, §27). Cross-tenant by design: `PrismaService` with
 * explicit ids, only ever reached through `SuperAdminGuard`. Only branch-group ROOT businesses are
 * tenants; a branch is shown inside its root.
 */
@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly modules: BusinessModulesService,
    private readonly audit: AdminAuditService,
    @Optional() private readonly billing?: BillingService,
  ) {}

  async list(q: TenantListQuery): Promise<Paged<TenantRow>> {
    const { page, pageSize, skip, take } = pageArgs(q);
    const and: Prisma.BusinessWhereInput[] = [{ parentId: null }];

    if (q.status && (PLATFORM_STATUSES as readonly string[]).includes(q.status))
      and.push({ platformStatus: q.status });
    if (q.country) and.push({ country: q.country });
    const created = dateRange(q.createdFrom, q.createdTo);
    if (created) and.push({ createdAt: created });

    if (q.plan || q.subStatus) {
      const subs = await this.prisma.subscription.findMany({
        where: {
          ...(q.plan ? { plan: { key: q.plan } } : {}),
          ...(q.subStatus ? { status: q.subStatus } : {}),
        },
        select: { businessId: true },
      });
      and.push({ id: { in: subs.map((s) => s.businessId) } });
    }

    if (q.inactiveDays) {
      const days = Math.max(1, Number(q.inactiveDays) || 30);
      const since = new Date(Date.now() - days * 86_400_000);
      // No session used since `since` anywhere in the group.
      and.push({
        sessions: { none: { lastUsedAt: { gte: since } } },
        branches: {
          none: { sessions: { some: { lastUsedAt: { gte: since } } } },
        },
      });
    }

    const search = q.search?.trim();
    if (search) {
      const subMatch = await this.prisma.subscription.findMany({
        where: {
          OR: [{ id: search }, { stripeSubscriptionId: search }],
        },
        select: { businessId: true },
      });
      and.push({
        OR: [
          { name: { contains: search } },
          { id: search },
          { slug: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
          { stripeSubscriptionId: search },
          { id: { in: subMatch.map((s) => s.businessId) } },
          {
            businessUsers: {
              some: {
                role: 'owner',
                user: {
                  OR: [
                    { name: { contains: search } },
                    { email: { contains: search } },
                    { phone: { contains: search } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.BusinessWhereInput = { AND: and };
    const orderBy: Prisma.BusinessOrderByWithRelationInput[] =
      q.sort === 'name'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : q.sort === 'oldest'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [total, rows] = await Promise.all([
      this.prisma.business.count({ where }),
      this.prisma.business.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          slug: true,
          country: true,
          createdAt: true,
          platformStatus: true,
          disabledModules: true,
          plan: { select: { key: true, name: true } },
        },
      }),
    ]);
    const items = await this.decorate(rows);
    return { items, total, page, pageSize };
  }

  /** Batched per-page facts — a handful of grouped queries, never one resolve() per row. */
  private async decorate(
    rows: {
      id: string;
      name: string;
      slug: string;
      country: string | null;
      createdAt: Date;
      platformStatus: string;
      disabledModules: Prisma.JsonValue;
      plan: { key: string; name: string } | null;
    }[],
  ): Promise<TenantRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const now = new Date();
    const [branches, subs, overrides, purchases, owners, globalOff, modOv] =
      await Promise.all([
        this.prisma.business.findMany({
          where: { parentId: { in: ids } },
          select: { id: true, parentId: true, active: true },
        }),
        this.prisma.subscription.findMany({
          where: { businessId: { in: ids } },
          include: {
            plan: {
              select: {
                key: true,
                name: true,
                entitlements: {
                  where: { metricCode: { in: ['users', 'locations'] } },
                },
              },
            },
          },
        }),
        this.prisma.entitlementOverride.findMany({
          where: {
            businessId: { in: ids },
            metricCode: { in: ['users', 'locations'] },
            revokedAt: null,
            effectiveFrom: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        this.prisma.capacityPurchase.groupBy({
          by: ['businessId', 'metricCode'],
          where: {
            businessId: { in: ids },
            status: 'active',
            recurring: true,
            metricCode: { in: ['users', 'locations'] },
          },
          _sum: { quantity: true },
        }),
        this.prisma.businessUser.findMany({
          where: { businessId: { in: ids }, role: 'owner' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            businessId: true,
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        }),
        this.prisma.platformModuleState.count({
          where: { globallyDisabled: true },
        }),
        this.prisma.moduleAccessOverride.findMany({
          where: {
            businessId: { in: ids },
            state: 'suspended',
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { businessId: true, moduleKey: true },
        }),
      ]);

    const groupOf = new Map<string, string[]>();
    for (const id of ids) groupOf.set(id, [id]);
    for (const b of branches) groupOf.get(b.parentId!)?.push(b.id);
    const allIds = [...groupOf.values()].flat();

    const [members, lastSessions] = await Promise.all([
      this.prisma.businessUser.findMany({
        where: { businessId: { in: allIds }, active: true },
        select: { businessId: true, userId: true },
      }),
      this.prisma.session.groupBy({
        by: ['businessId'],
        where: { businessId: { in: allIds } },
        _max: { lastUsedAt: true },
      }),
    ]);
    const rootOf = new Map<string, string>();
    for (const [root, group] of groupOf)
      for (const g of group) rootOf.set(g, root);

    return rows.map((r) => {
      const group = groupOf.get(r.id) ?? [r.id];
      const sub = subs.find((s) => s.businessId === r.id);
      const allowed = (metric: 'users' | 'locations') => {
        const ov = overrides.find(
          (o) => o.businessId === r.id && o.metricCode === metric,
        );
        const bought =
          purchases.find(
            (p) => p.businessId === r.id && p.metricCode === metric,
          )?._sum.quantity ?? 0;
        if (ov) return Number(ov.includedQuantity) + bought;
        const ent = sub?.plan.entitlements.find((e) => e.metricCode === metric);
        return ent?.includedQuantity == null
          ? null
          : Number(ent.includedQuantity) + bought;
      };
      const people = new Set(
        members
          .filter((m) => rootOf.get(m.businessId) === r.id)
          .map((m) => m.userId),
      );
      const activeLocations =
        1 + branches.filter((b) => b.parentId === r.id && b.active).length;
      const lastActivity = lastSessions
        .filter((s) => group.includes(s.businessId))
        .map((s) => s._max.lastUsedAt)
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const ownerDisabled = Array.isArray(r.disabledModules)
        ? r.disabledModules.length
        : 0;
      const suspended = new Set(
        modOv.filter((m) => m.businessId === r.id).map((m) => m.moduleKey),
      ).size;
      const owner = owners.find((o) => o.businessId === r.id)?.user ?? null;
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        owner,
        country: r.country,
        plan: sub
          ? { key: sub.plan.key, name: sub.plan.name }
          : (r.plan ?? null),
        subscriptionStatus: sub?.status ?? null,
        users: { used: people.size, allowed: allowed('users') },
        locations: { used: activeLocations, allowed: allowed('locations') },
        modulesTotal: BUSINESS_MODULES.length,
        modulesEnabled: Math.max(
          0,
          BUSINESS_MODULES.length - ownerDisabled - suspended - globalOff,
        ),
        createdAt: r.createdAt.toISOString(),
        lastActivityAt: lastActivity?.toISOString() ?? null,
        platformStatus: r.platformStatus,
      };
    });
  }

  async rootIdOrThrow(id: string): Promise<string> {
    const b = await this.prisma.business.findUnique({
      where: { id },
      select: { id: true, parentId: true },
    });
    if (!b) throw notFound('Business');
    return b.parentId ?? b.id;
  }

  async groupIds(rootId: string): Promise<string[]> {
    return this.entitlements.groupIds(rootId);
  }

  /** Tenant 360 overview (PRD §4.2 Overview, §27). */
  async detail(id: string) {
    const rootId = await this.rootIdOrThrow(id);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        website: true,
        country: true,
        city: true,
        address: true,
        currency: true,
        timezone: true,
        createdAt: true,
        onboardingCompletedAt: true,
        platformStatus: true,
        platformStatusReason: true,
        platformStatusAt: true,
        stripeCustomerId: true,
        type: { select: { label: true } },
        branches: {
          select: { id: true, name: true, active: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    const ids = [rootId, ...business.branches.map((b) => b.id)];
    const [
      owner,
      entitlements,
      lastLogin,
      recentActivity,
      notesCount,
      openSecurity,
    ] = await Promise.all([
      this.prisma.businessUser.findFirst({
        where: { businessId: rootId, role: 'owner' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              twoFactorEnabled: true,
              platformStatus: true,
            },
          },
        },
      }),
      this.entitlements.resolve(rootId, { fresh: true }),
      this.prisma.session.findFirst({
        where: { businessId: { in: ids } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: { createdAt: true, lastUsedAt: true, userId: true },
      }),
      this.prisma.activityEvent.findMany({
        where: { businessId: { in: ids } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 10,
      }),
      this.prisma.internalNote.count({ where: { businessId: rootId } }),
      this.prisma.securityEvent.count({
        where: {
          businessId: { in: ids },
          severity: { in: ['high', 'critical'] },
          createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
      }),
    ]);
    const modules = await this.modules.list(rootId);
    return {
      business: {
        ...business,
        hasStripeCustomer: !!business.stripeCustomerId,
        stripeCustomerId: undefined,
        type: business.type?.label ?? null,
      },
      owner: owner?.user ?? null,
      entitlements,
      lastLoginAt: lastLogin?.createdAt.toISOString() ?? null,
      lastActiveAt: lastLogin?.lastUsedAt.toISOString() ?? null,
      recentActivity,
      modules: {
        total: modules.modules.length,
        enabled: modules.modules.length - modules.disabled.length,
        list: modules.modules,
      },
      notesCount,
      highSeverityEvents7d: openSecurity,
    };
  }

  async users(id: string) {
    const rootId = await this.rootIdOrThrow(id);
    const ids = await this.groupIds(rootId);
    const links = await this.prisma.businessUser.findMany({
      where: { businessId: { in: ids } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
        active: true,
        createdAt: true,
        business: { select: { id: true, name: true } },
        customRole: { select: { name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            twoFactorEnabled: true,
            platformStatus: true,
            lockedUntil: true,
          },
        },
      },
    });
    const userIds = [...new Set(links.map((l) => l.user.id))];
    const last = await this.prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { createdAt: true, lastUsedAt: true },
    });
    return links.map((l) => {
      const s = last.find((x) => x.userId === l.user.id);
      return {
        membershipId: l.id,
        role: l.role,
        customRole: l.customRole?.name ?? null,
        membershipActive: l.active,
        location: l.business,
        joinedAt: l.createdAt,
        user: l.user,
        lastLoginAt: s?._max.createdAt ?? null,
        lastActiveAt: s?._max.lastUsedAt ?? null,
      };
    });
  }

  async security(id: string) {
    const rootId = await this.rootIdOrThrow(id);
    const ids = await this.groupIds(rootId);
    const memberIds = (
      await this.prisma.businessUser.findMany({
        where: { businessId: { in: ids } },
        select: { userId: true },
      })
    ).map((m) => m.userId);
    const [events, sessions] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where: {
          OR: [{ businessId: { in: ids } }, { userId: { in: memberIds } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      this.prisma.session.findMany({
        where: { businessId: { in: ids }, revokedAt: null },
        orderBy: [{ lastUsedAt: 'desc' }, { id: 'asc' }],
        take: 100,
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastUsedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);
    return { events, sessions };
  }

  async integrations(id: string) {
    const rootId = await this.rootIdOrThrow(id);
    const ids = await this.groupIds(rootId);
    const [rows, logs] = await Promise.all([
      this.prisma.integration.findMany({
        where: { businessId: { in: ids } },
        // `tokens` is deliberately never selected (PRD §14).
        select: {
          id: true,
          businessId: true,
          provider: true,
          status: true,
          connectedAt: true,
          lastSyncAt: true,
          pausedAt: true,
          updatedAt: true,
        },
        orderBy: [{ provider: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.integrationSyncLog.findMany({
        where: { businessId: { in: ids } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
        select: {
          id: true,
          provider: true,
          success: true,
          recordsProcessed: true,
          recordsFailed: true,
          message: true,
          createdAt: true,
        },
      }),
    ]);
    return { integrations: rows, syncLogs: logs };
  }

  /** Real Stripe invoices when the business has a Stripe customer; [] otherwise (never invented). */
  async invoices(id: string) {
    const rootId = await this.rootIdOrThrow(id);
    if (!this.billing) return { available: false, invoices: [] };
    try {
      return {
        available: true,
        invoices: await this.billing.listInvoices(rootId),
      };
    } catch (error) {
      this.logger.warn(`Invoices for ${rootId}: ${(error as Error).message}`);
      return { available: false, invoices: [] };
    }
  }

  async notes(id: string) {
    const rootId = await this.rootIdOrThrow(id);
    return this.prisma.internalNote.findMany({
      where: { businessId: rootId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async addNote(id: string, body: string, ctx: AdminAuditContext) {
    const rootId = await this.rootIdOrThrow(id);
    const text = (body ?? '').trim();
    if (!text) throw badRequest('A note cannot be empty.');
    return this.audit.run(
      ctx,
      (tx) =>
        tx.internalNote.create({
          data: {
            businessId: rootId,
            adminId: ctx.admin.id,
            adminName: ctx.admin.name,
            body: text.slice(0, 10_000),
          },
        }),
      (note) => ({
        action: 'business.note_added',
        resourceType: 'internal_note',
        resourceId: note.id,
        businessId: rootId,
        after: { length: text.length },
        reason: 'Internal note added',
      }),
    );
  }

  /**
   * Suspend / reactivate / archive (PRD §4.3). Suspension blocks every login, refresh and live
   * token for the whole branch group (PlatformAccessGuard) without touching data. Archive also
   * revokes every open session. Nothing is deleted.
   */
  async setStatus(
    id: string,
    status: string,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    if (!(PLATFORM_STATUSES as readonly string[]).includes(status))
      throw badRequest('Status must be active, suspended or archived.');
    const rootId = await this.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    const before = await this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: { platformStatus: true, platformStatusReason: true },
    });
    if (before.platformStatus === status)
      throw badRequest(`This business is already ${status}.`);
    const ids = await this.groupIds(rootId);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.business.update({
        where: { id: rootId },
        data: {
          platformStatus: status,
          platformStatusReason: status === 'active' ? null : text,
          platformStatusAt: new Date(),
        },
        select: { id: true, platformStatus: true },
      });
      let revoked = 0;
      if (status === 'archived') {
        revoked = (
          await tx.session.updateMany({
            where: { businessId: { in: ids }, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        ).count;
      }
      await this.audit.record(tx, ctx, {
        action:
          status === 'active'
            ? 'business.reactivated'
            : status === 'suspended'
              ? 'business.suspended'
              : 'business.archived',
        resourceType: 'business',
        resourceId: rootId,
        businessId: rootId,
        before,
        after: { platformStatus: status, sessionsRevoked: revoked },
        reason: text,
      });
      return { ...updated, sessionsRevoked: revoked };
    });
    invalidatePlatformAccessCache();
    return result;
  }

  async revokeAllSessions(id: string, reason: string, ctx: AdminAuditContext) {
    const rootId = await this.rootIdOrThrow(id);
    const ids = await this.groupIds(rootId);
    const result = await this.audit.run(
      ctx,
      (tx) =>
        tx.session.updateMany({
          where: { businessId: { in: ids }, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      (r) => ({
        action: 'business.sessions_revoked',
        resourceType: 'business',
        resourceId: rootId,
        businessId: rootId,
        after: { revoked: r.count },
        reason,
      }),
    );
    invalidatePlatformAccessCache();
    return { revoked: result.count };
  }

  async countries(): Promise<string[]> {
    const rows = await this.prisma.business.findMany({
      where: { parentId: null, country: { not: null } },
      distinct: ['country'],
      select: { country: true },
      orderBy: { country: 'asc' },
    });
    return rows.map((r) => r.country!).filter(Boolean);
  }
}
