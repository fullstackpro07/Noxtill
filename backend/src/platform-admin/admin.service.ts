import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVATION_FUNNEL_EVENTS = [
  'signup_started',
  'signup_completed',
  'first_sale_recorded',
  'first_review_request_sent',
] as const;

/** Cross-tenant platform reporting (BE-072) — every query here is intentionally unscoped. */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async activationFunnel(sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const counts = await Promise.all(
      ACTIVATION_FUNNEL_EVENTS.map(async (name) => ({
        name,
        count: await this.prisma.event.count({
          where: { name, createdAt: { gte: since } },
        }),
      })),
    );
    return counts;
  }

  async events(name?: string, limit = 100) {
    return this.prisma.event.findMany({
      where: name ? { name } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async businessesSummary() {
    const [total, byPlan] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.groupBy({ by: ['planId'], _count: { _all: true } }),
    ]);
    return { total, byPlan };
  }
}
