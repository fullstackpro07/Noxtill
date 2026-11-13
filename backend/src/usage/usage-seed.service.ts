import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import {
  ALERT_THRESHOLDS,
  METER_SEEDS,
  PLAN_SEEDS,
  PRICE_SEEDS,
  VIDEO_PLAN_LIMITS,
  PLAN_LIMITS,
  INTELLIGENCE_RUN_LIMITS,
  ZERO_INCLUDED_CAPACITY,
} from './usage.constants';

/**
 * Seeds the Usage & Limits catalog at boot (spec §3.4: plans are data). Inserts only what is
 * MISSING — a plan, entitlement, meter or price an operator has since edited in the database is
 * never overwritten by a deploy. Then gives every group root that has no subscription row one
 * (paying → active, everyone else → a 14-day trial; see EntitlementsService.ensureSubscription).
 */
@Injectable()
export class UsageSeedService implements OnModuleInit {
  private readonly logger = new Logger(UsageSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // Background, never awaited: blocking bootstrap on DB work breaks the host's listen() deadline.
    void this.seed()
      .then(() => this.backfillSubscriptions())
      .catch((error: Error) =>
        this.logger.error(`Usage seed failed: ${error.message}`),
      );
  }

  async seed(): Promise<void> {
    for (const p of PLAN_SEEDS) {
      // PlansSeedService (billing) seeds the same rows concurrently at boot; tolerate either order.
      const existing = await this.prisma.plan
        .findUnique({ where: { key: p.key } })
        .then(async (found) => {
          if (found) return found;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return this.prisma.plan.findUnique({ where: { key: p.key } });
        });
      const plan = existing
        ? await this.prisma.plan.update({
            where: { id: existing.id },
            // Only backfill the fields this system introduced, and only while still unset.
            data: {
              ...(existing.yearlyPrice == null && p.yearly != null
                ? { yearlyPrice: p.yearly }
                : {}),
              ...(existing.displayOrder === 0 && p.displayOrder !== 0
                ? { displayOrder: p.displayOrder }
                : {}),
              ...(existing.trialDays === 0 && p.trialDays !== 0
                ? { trialDays: p.trialDays }
                : {}),
              ...(!p.purchasable && existing.purchasable
                ? { purchasable: false }
                : {}),
            },
          })
        : await this.prisma.plan.create({
            data: {
              key: p.key,
              name: p.name,
              price: p.monthly ?? 0,
              yearlyPrice: p.yearly,
              msgQuota: 0,
              userLimit: p.users ?? 0,
              displayOrder: p.displayOrder,
              trialDays: p.trialDays,
              purchasable: p.purchasable,
            },
          });
      const rows: Prisma.PlanEntitlementCreateManyInput[] = [
        {
          planId: plan.id,
          metricCode: 'users',
          kind: 'capacity',
          includedQuantity: p.users,
          resetRule: 'none',
        },
        {
          planId: plan.id,
          metricCode: 'locations',
          kind: 'capacity',
          includedQuantity: p.locations,
          resetRule: 'none',
        },
        {
          planId: plan.id,
          metricCode: 'ai_credits',
          kind: 'allowance',
          includedQuantity: p.credits,
          resetRule: p.creditsReset,
        },
        {
          planId: plan.id,
          metricCode: 'ai_phone_receptionist',
          kind: 'feature',
          includedQuantity:
            p.receptionist == null ? null : p.receptionist ? 1 : 0,
          resetRule: 'none',
        },
        ...(VIDEO_PLAN_LIMITS[p.key]
          ? [
              {
                planId: plan.id,
                metricCode: 'video_minutes',
                kind: 'allowance',
                includedQuantity: VIDEO_PLAN_LIMITS[p.key].minutes,
                resetRule: 'period',
              },
              {
                planId: plan.id,
                metricCode: 'video_participants',
                kind: 'capacity',
                includedQuantity: VIDEO_PLAN_LIMITS[p.key].participants,
                resetRule: 'none',
              },
              {
                planId: plan.id,
                metricCode: 'video_recording_minutes',
                kind: 'allowance',
                includedQuantity: VIDEO_PLAN_LIMITS[p.key].recordingMinutes,
                resetRule: 'period',
              },
            ]
          : []),
        ...(p.key in INTELLIGENCE_RUN_LIMITS
          ? [
              {
                planId: plan.id,
                metricCode: 'intelligence_runs',
                kind: 'allowance',
                includedQuantity: INTELLIGENCE_RUN_LIMITS[p.key],
                resetRule: 'period',
              },
            ]
          : []),
        ...ZERO_INCLUDED_CAPACITY.map((metricCode) => ({
          planId: plan.id,
          metricCode,
          kind: 'capacity',
          includedQuantity: p.key === 'enterprise' ? null : 0,
          resetRule: 'none',
        })),
        // Allowances the product owner hasn't set per plan yet (spec §21 #5): not_configured.
        ...Object.entries(PLAN_LIMITS)
          .filter(([, l]) => p.key in l.byPlan)
          .map(([metricCode, l]) => ({
            planId: plan.id,
            metricCode,
            kind: l.kind,
            includedQuantity: l.byPlan[p.key],
            resetRule: l.resetRule,
          })),
        ...['automation_runs', 'seo_keywords', 'esign_transactions', 'websites']
          .filter((m) => !(m in PLAN_LIMITS))
          .map((metricCode) => ({
            planId: plan.id,
            metricCode,
            kind: metricCode === 'websites' ? 'capacity' : 'allowance',
            includedQuantity: null,
            resetRule: ['storage_bytes', 'seo_keywords', 'websites'].includes(
              metricCode,
            )
              ? 'none'
              : 'period',
          })),
      ];
      await this.prisma.planEntitlement.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
    // The legacy $0 plan keeps resolving for anyone still pointing at it, but is no longer sold.
    await this.prisma.plan.updateMany({
      where: { key: 'basic', status: 'active' },
      data: { status: 'retired', purchasable: false },
    });

    await this.prisma.meterDefinition.createMany({
      data: METER_SEEDS.map((m, i) => ({
        ...m,
        alertThresholds: ALERT_THRESHOLDS,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });

    const priced = await this.prisma.meterPrice.findMany({
      select: { metricCode: true, countryCode: true, numberType: true },
    });
    const have = new Set(
      priced.map((p) => `${p.metricCode}|${p.countryCode}|${p.numberType}`),
    );
    const missing = PRICE_SEEDS.filter(
      (p) =>
        !have.has(
          `${p.metricCode}|${p.countryCode ?? ''}|${p.numberType ?? ''}`,
        ),
    );
    if (missing.length) {
      const effectiveFrom = new Date('2026-11-01T00:00:00.000Z');
      await this.prisma.meterPrice.createMany({
        data: missing.map((p) => ({
          metricCode: p.metricCode,
          countryCode: p.countryCode ?? '',
          numberType: p.numberType ?? '',
          unitPriceUsd: p.unitPriceUsd,
          per: p.per ?? 1,
          effectiveFrom,
        })),
        skipDuplicates: true,
      });
    }
  }

  async backfillSubscriptions(): Promise<number> {
    const roots = await this.prisma.business.findMany({
      where: {
        parentId: null,
        NOT: {
          id: {
            in: (
              await this.prisma.subscription.findMany({
                select: { businessId: true },
              })
            ).map((s) => s.businessId),
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of roots) {
      try {
        await this.entitlements.ensureSubscription(r.id);
      } catch (error) {
        this.logger.warn(
          `Could not create subscription for ${r.id}: ${(error as Error).message}`,
        );
      }
    }
    if (roots.length)
      this.logger.log(`Created ${roots.length} subscription record(s)`);
    return roots.length;
  }
}
