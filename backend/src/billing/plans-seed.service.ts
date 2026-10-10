import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PLANS, LEGACY_PLAN_KEYS } from './billing.constants';

/**
 * Seeds the canonical plans (BE-064) idempotently — upsert by `key` so
 * re-running on every boot is harmless. Pure DB work, no Stripe dependency,
 * so it always succeeds even if Stripe itself isn't configured.
 *
 * A plan from the previous lineup is renamed to its replacement first (same row, so businesses on
 * it stay attached). When a plan's price changes, its `stripePriceId` is cleared: Stripe prices are
 * immutable, so StripeSyncService then creates a new price at the new amount. Subscriptions already
 * running keep the Stripe price they were sold at.
 */
@Injectable()
export class PlansSeedService implements OnModuleInit {
  private readonly logger = new Logger(PlansSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run in background — do NOT await. Awaiting DB queries in onModuleInit
    // blocks NestJS bootstrap past Hostinger's 3-second listen() deadline.
    void this.seed();
  }

  private async seed() {
    try {
      for (const [legacyKey, key] of Object.entries(LEGACY_PLAN_KEYS)) {
        const legacy = await this.prisma.plan.findUnique({
          where: { key: legacyKey },
        });
        if (!legacy) continue;
        const current = await this.prisma.plan.findUnique({ where: { key } });
        if (!current) {
          await this.prisma.plan.update({
            where: { id: legacy.id },
            data: { key },
          });
        } else {
          // Both exist: move anyone still on the legacy row over, then drop it.
          await this.prisma.business.updateMany({
            where: { planId: legacy.id },
            data: { planId: current.id },
          });
          await this.prisma.plan.delete({ where: { id: legacy.id } });
        }
      }
      for (const plan of DEFAULT_PLANS) {
        const existing = await this.prisma.plan.findUnique({
          where: { key: plan.key },
        });
        const priceChanged =
          !!existing && Number(existing.price) !== Number(plan.price);
        await this.prisma.plan.upsert({
          where: { key: plan.key },
          create: plan,
          update: {
            name: plan.name,
            price: plan.price,
            msgQuota: plan.msgQuota,
            userLimit: plan.userLimit,
            ...(priceChanged ? { stripePriceId: null } : {}),
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to seed plans: ${(error as Error).message}`);
    }
  }
}
