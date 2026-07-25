import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PLANS } from './billing.constants';

/**
 * Seeds the 4 canonical plans (BE-064) idempotently — upsert by `key` so
 * re-running on every boot is harmless. Pure DB work, no Stripe dependency,
 * so it always succeeds even if Stripe itself isn't configured.
 */
@Injectable()
export class PlansSeedService implements OnModuleInit {
  private readonly logger = new Logger(PlansSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const plan of DEFAULT_PLANS) {
        await this.prisma.plan.upsert({
          where: { key: plan.key },
          create: plan,
          update: {
            name: plan.name,
            price: plan.price,
            msgQuota: plan.msgQuota,
            userLimit: plan.userLimit,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to seed plans: ${(error as Error).message}`);
    }
  }
}
