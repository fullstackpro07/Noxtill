import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../../usage/entitlements.service';
import {
  BusinessModulesService,
  invalidatePlatformModuleCache,
} from '../../business-modules/business-modules.service';
import {
  BUSINESS_MODULE_KEYS,
  BUSINESS_MODULES,
} from '../../business-modules/business-modules.constants';
import { AdminAuditService } from './admin-audit.service';
import { AdminTenantsService } from './admin-tenants.service';
import type { AdminAuditContext } from '../super-admin.decorators';
import { badRequest, notFound, parseDate } from '../super-admin.util';

/** Metric kinds an admin may override. Spend caps are the customer's own money controls and
 * pass-through meters have no allowance, so neither can be overridden (usage spec SC-04). */
const OVERRIDABLE_KINDS = ['capacity', 'allowance', 'feature'];

/**
 * Per-business limits and module access (PRD §8.3, §9). Overrides are explicit audited rows read
 * by `EntitlementsService.includedFor()` — the same function every enforcement path uses — so an
 * override changes what the business can actually do, not just what a screen shows.
 */
@Injectable()
export class AdminEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly modules: BusinessModulesService,
    private readonly tenants: AdminTenantsService,
    private readonly audit: AdminAuditService,
  ) {}

  // ------------------------------------------------------------------ limits

  async limits(id: string) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const [set, overrides, meters] = await Promise.all([
      this.entitlements.resolve(rootId, { fresh: true }),
      this.prisma.entitlementOverride.findMany({
        where: { businessId: rootId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.meterDefinition.findMany({
        orderBy: [{ sortOrder: 'asc' }, { metricCode: 'asc' }],
      }),
    ]);
    const admins = await this.adminNames(
      overrides.flatMap((o) => [o.createdByAdminId, o.revokedByAdminId]),
    );
    const now = new Date();
    return {
      entitlements: set,
      meters: meters.map((m) => ({
        metricCode: m.metricCode,
        displayName: m.displayName,
        unit: m.unit,
        kind: m.kind,
        enforced: m.enforced,
        overridable: OVERRIDABLE_KINDS.includes(m.kind),
      })),
      overrides: overrides.map((o) => ({
        id: o.id,
        metricCode: o.metricCode,
        includedQuantity: Number(o.includedQuantity),
        effectiveFrom: o.effectiveFrom,
        expiresAt: o.expiresAt,
        reason: o.reason,
        createdBy: admins.get(o.createdByAdminId) ?? o.createdByAdminId,
        createdAt: o.createdAt,
        revokedAt: o.revokedAt,
        revokedBy: o.revokedByAdminId
          ? (admins.get(o.revokedByAdminId) ?? o.revokedByAdminId)
          : null,
        state: o.revokedAt
          ? 'revoked'
          : o.expiresAt && o.expiresAt <= now
            ? 'expired'
            : o.effectiveFrom > now
              ? 'scheduled'
              : 'active',
      })),
    };
  }

  async createOverride(
    id: string,
    input: {
      metricCode: string;
      includedQuantity: number;
      effectiveFrom?: string;
      expiresAt?: string;
    },
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    const meter = await this.prisma.meterDefinition.findUnique({
      where: { metricCode: input.metricCode },
    });
    if (!meter) throw badRequest(`Unknown metric "${input.metricCode}".`);
    if (!OVERRIDABLE_KINDS.includes(meter.kind))
      throw badRequest(
        `${meter.displayName} cannot be overridden (it is a ${meter.kind.replace('_', ' ')}).`,
      );
    const qty = Number(input.includedQuantity);
    if (!Number.isFinite(qty) || qty < 0)
      throw badRequest(
        'The new limit must be a number, 0 or more. "Unlimited" is not supported — every allowance is an explicit number.',
      );
    if (meter.kind === 'feature' && qty !== 0 && qty !== 1)
      throw badRequest('A feature override is 1 (on) or 0 (off).');
    if (meter.kind === 'capacity' && !Number.isInteger(qty))
      throw badRequest('A capacity limit must be a whole number.');
    const now = new Date();
    const effectiveFrom = parseDate(input.effectiveFrom) ?? now;
    const expiresAt = parseDate(input.expiresAt) ?? null;
    if (expiresAt && expiresAt <= (effectiveFrom > now ? effectiveFrom : now))
      throw badRequest('The expiry must be after the start.');
    if (meter.metricCode === 'ai_credits' && (effectiveFrom > now || expiresAt))
      throw badRequest(
        'AI credit overrides take effect immediately and stay until revoked (the credit balance is reserved atomically, so it is not re-timed in the background).',
      );

    const set = await this.entitlements.resolve(rootId, { fresh: true });
    const current = set.metrics[meter.metricCode];
    const sub = await this.entitlements.ensureSubscription(rootId);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.entitlementOverride.create({
        data: {
          businessId: rootId,
          metricCode: meter.metricCode,
          includedQuantity: qty,
          effectiveFrom,
          expiresAt,
          reason: text,
          createdByAdminId: ctx.admin.id,
        },
      });
      if (meter.metricCode === 'ai_credits') {
        await tx.creditBalance.updateMany({
          where: { businessId: rootId },
          data: { includedQuantity: Math.round(qty) },
        });
      }
      await tx.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId: ctx.admin.id,
          actorType: 'admin',
          changeType: 'override',
          before: {
            metric: meter.metricCode,
            included: current?.included ?? null,
            planIncluded: this.entitlements.planIncludedFor(
              sub,
              meter.metricCode,
            ),
          },
          after: {
            metric: meter.metricCode,
            included: qty,
            effectiveFrom: effectiveFrom.toISOString(),
            expiresAt: expiresAt?.toISOString() ?? null,
          },
          reason: `Super Admin: ${text}`,
        },
      });
      await this.entitlements.bumpVersion(rootId, tx);
      await this.audit.record(tx, ctx, {
        action: 'limit.override_set',
        resourceType: 'entitlement_override',
        resourceId: row.id,
        businessId: rootId,
        before: {
          metric: meter.metricCode,
          included: current?.included ?? null,
        },
        after: {
          metric: meter.metricCode,
          included: qty,
          effectiveFrom,
          expiresAt,
        },
        reason: text,
      });
      return row;
    });
    await this.entitlements.invalidate(rootId);
    return created;
  }

  async revokeOverride(
    id: string,
    overrideId: string,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    const row = await this.prisma.entitlementOverride.findUnique({
      where: { id: overrideId },
    });
    if (!row || row.businessId !== rootId) throw notFound('Override');
    if (row.revokedAt) throw badRequest('That override was already revoked.');
    const sub = await this.entitlements.ensureSubscription(rootId);
    await this.prisma.$transaction(async (tx) => {
      await tx.entitlementOverride.update({
        where: { id: row.id },
        data: { revokedAt: new Date(), revokedByAdminId: ctx.admin.id },
      });
      if (row.metricCode === 'ai_credits') {
        // Back to the plan's allowance (or another still-active credit override).
        const other = sub.overrides?.find(
          (o) => o.metricCode === 'ai_credits' && o.id !== row.id,
        );
        const plan = this.entitlements.planIncludedFor(sub, 'ai_credits');
        await tx.creditBalance.updateMany({
          where: { businessId: rootId },
          data: {
            includedQuantity: Math.round(
              other ? Number(other.includedQuantity) : (plan ?? 0),
            ),
          },
        });
      }
      await tx.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId: ctx.admin.id,
          actorType: 'admin',
          changeType: 'override',
          before: {
            metric: row.metricCode,
            included: Number(row.includedQuantity),
          },
          after: { metric: row.metricCode, revoked: true },
          reason: `Super Admin: ${text}`,
        },
      });
      await this.entitlements.bumpVersion(rootId, tx);
      await this.audit.record(tx, ctx, {
        action: 'limit.override_revoked',
        resourceType: 'entitlement_override',
        resourceId: row.id,
        businessId: rootId,
        before: {
          metric: row.metricCode,
          included: Number(row.includedQuantity),
        },
        after: { revoked: true },
        reason: text,
      });
    });
    await this.entitlements.invalidate(rootId);
    return { revoked: true };
  }

  // ----------------------------------------------------------------- modules

  async registry() {
    const now = new Date();
    const [states, overrides, roots] = await Promise.all([
      this.prisma.platformModuleState.findMany(),
      this.prisma.moduleAccessOverride.groupBy({
        by: ['moduleKey', 'state'],
        where: {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        _count: { _all: true },
      }),
      this.prisma.business.findMany({
        where: { parentId: null },
        select: { disabledModules: true },
      }),
    ]);
    const ownerOff = new Map<string, number>();
    for (const r of roots) {
      if (!Array.isArray(r.disabledModules)) continue;
      for (const k of r.disabledModules)
        if (typeof k === 'string') ownerOff.set(k, (ownerOff.get(k) ?? 0) + 1);
    }
    return {
      totalBusinesses: roots.length,
      alwaysOn: [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'settings', label: 'Settings' },
      ],
      modules: BUSINESS_MODULES.map((m) => {
        const st = states.find((s) => s.moduleKey === m.key);
        const count = (state: string) =>
          overrides.find((o) => o.moduleKey === m.key && o.state === state)
            ?._count._all ?? 0;
        return {
          ...m,
          globallyDisabled: st?.globallyDisabled ?? false,
          globalReason: st?.reason ?? null,
          updatedAt: st?.updatedAt ?? null,
          turnedOffByOwners: ownerOff.get(m.key) ?? 0,
          suspendedFor: count('suspended'),
          restrictedFor: count('restricted'),
        };
      }),
    };
  }

  async setGlobal(
    key: string,
    disabled: boolean,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    if (!BUSINESS_MODULE_KEYS.has(key)) throw badRequest('Unknown module.');
    const text = AdminAuditService.requireReason(reason);
    const before = await this.prisma.platformModuleState.findUnique({
      where: { moduleKey: key },
    });
    if ((before?.globallyDisabled ?? false) === disabled)
      throw badRequest(
        `This module is already ${disabled ? 'disabled' : 'available'} globally.`,
      );
    await this.audit.run(
      ctx,
      (tx) =>
        tx.platformModuleState.upsert({
          where: { moduleKey: key },
          create: {
            moduleKey: key,
            globallyDisabled: disabled,
            reason: disabled ? text : null,
            updatedByAdminId: ctx.admin.id,
          },
          update: {
            globallyDisabled: disabled,
            reason: disabled ? text : null,
            updatedByAdminId: ctx.admin.id,
          },
        }),
      () => ({
        action: disabled ? 'module.global_disabled' : 'module.global_enabled',
        resourceType: 'module',
        resourceId: key,
        before: { globallyDisabled: before?.globallyDisabled ?? false },
        after: { globallyDisabled: disabled },
        reason: text,
      }),
    );
    invalidatePlatformModuleCache();
    return this.registry();
  }

  async tenantModules(id: string) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const [list, history, sub] = await Promise.all([
      this.modules.list(rootId),
      this.prisma.moduleAccessOverride.findMany({
        where: { businessId: rootId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.entitlements.ensureSubscription(rootId),
    ]);
    const admins = await this.adminNames(
      history.flatMap((h) => [h.createdByAdminId, h.revokedByAdminId]),
    );
    const ownerOff = new Set(
      list.modules.filter((m) => !m.enabled).map((m) => m.key),
    );
    return {
      plan: sub.plan.name,
      modules: list.modules.map((m) => ({
        key: m.key,
        label: m.label,
        group: m.group,
        description: m.description,
        // Effective state, most restrictive first (PRD §9.3).
        state: m.platform
          ? m.platform.state
          : ownerOff.has(m.key)
            ? 'disabled_by_business'
            : 'enabled_by_subscription',
        platform: m.platform,
      })),
      history: history.map((h) => ({
        ...h,
        createdBy: admins.get(h.createdByAdminId) ?? h.createdByAdminId,
        revokedBy: h.revokedByAdminId
          ? (admins.get(h.revokedByAdminId) ?? h.revokedByAdminId)
          : null,
      })),
    };
  }

  async setTenantModule(
    id: string,
    key: string,
    input: { state: 'suspended' | 'restricted' | 'clear'; expiresAt?: string },
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    if (!BUSINESS_MODULE_KEYS.has(key)) throw badRequest('Unknown module.');
    if (!['suspended', 'restricted', 'clear'].includes(input.state))
      throw badRequest('State must be suspended, restricted or clear.');
    const text = AdminAuditService.requireReason(reason);
    const expiresAt = parseDate(input.expiresAt) ?? null;
    if (expiresAt && expiresAt <= new Date())
      throw badRequest('The expiry must be in the future.');
    const active = await this.prisma.moduleAccessOverride.findMany({
      where: { businessId: rootId, moduleKey: key, revokedAt: null },
    });
    if (input.state === 'clear' && !active.length)
      throw badRequest(
        'Noxtill has not restricted this module for this business.',
      );
    await this.prisma.$transaction(async (tx) => {
      if (active.length)
        await tx.moduleAccessOverride.updateMany({
          where: { id: { in: active.map((a) => a.id) } },
          data: { revokedAt: new Date(), revokedByAdminId: ctx.admin.id },
        });
      let createdId: string | null = null;
      if (input.state !== 'clear') {
        createdId = (
          await tx.moduleAccessOverride.create({
            data: {
              businessId: rootId,
              moduleKey: key,
              state: input.state,
              reason: text,
              expiresAt,
              createdByAdminId: ctx.admin.id,
            },
          })
        ).id;
      }
      await this.audit.record(tx, ctx, {
        action:
          input.state === 'clear'
            ? 'module.access_restored'
            : input.state === 'suspended'
              ? 'module.suspended'
              : 'module.restricted',
        resourceType: 'module',
        resourceId: createdId ?? key,
        businessId: rootId,
        before: active.map((a) => ({ state: a.state, expiresAt: a.expiresAt })),
        after: { module: key, state: input.state, expiresAt },
        reason: text,
      });
    });
    invalidatePlatformModuleCache();
    return this.tenantModules(rootId);
  }

  private async adminNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map<string, string>();
    const rows = await this.prisma.platformAdmin.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
