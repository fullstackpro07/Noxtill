import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import {
  CreateContentItemDto,
  UpdateContentItemDto,
} from './dto/create-content-item.dto';

/**
 * Content Planner (Marketing module v2) — a real, minimal content calendar. `ideas()` is the only
 * "AI" surface: it feeds the shared, rate-limited AI infra the business's own real best-selling
 * products (last 30 days) and its most recent 5-star review, same "never invent the evidence"
 * convention as `MarketingOverviewService.suggestReallocation`. There is no auto-publish pipeline
 * here — saving/scheduling an item is the plan of record a person acts on, not a promise that it
 * goes out on its own.
 */
@Injectable()
export class ContentItemsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
  ) {}

  create(businessId: string, dto: CreateContentItemDto) {
    return this.tenantPrisma.client.contentItem.create({
      data: {
        businessId,
        title: dto.title,
        type: dto.type,
        channel: dto.channel,
        body: dto.body,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
        ownerUserId: dto.ownerUserId,
        aiGenerated: dto.aiGenerated ?? false,
      },
    });
  }

  list() {
    return this.tenantPrisma.client.contentItem.findMany({
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
      include: { ownerUser: { include: { user: true } } },
    });
  }

  async findOne(id: string) {
    const item = await this.tenantPrisma.client.contentItem.findUnique({
      where: { id },
      include: { ownerUser: { include: { user: true } } },
    });
    if (!item) {
      throw new NotFoundException('Content item not found');
    }
    return item;
  }

  async update(id: string, dto: UpdateContentItemDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.contentItem.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        channel: dto.channel,
        body: dto.body,
        scheduledFor:
          dto.scheduledFor !== undefined
            ? dto.scheduledFor
              ? new Date(dto.scheduledFor)
              : null
            : undefined,
        status: dto.status,
        ownerUserId: dto.ownerUserId,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tenantPrisma.client.contentItem.delete({ where: { id } });
  }

  /**
   * Real-evidence content ideas — never a generic tip. Grounded in this business's actual
   * best-sellers (last 30 days of `OrderItem`) and its most recent 5-star `ExternalReview`, exactly
   * the two signals the prompt below cites; if neither exists yet, that's said honestly rather than
   * guessed.
   */
  async ideas(businessId: string): Promise<{ ideas: string[] }> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [topProducts, topReview] = await Promise.all([
      this.tenantPrisma.client.orderItem.groupBy({
        by: ['name'],
        where: { order: { businessId, createdAt: { gte: since } } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 3,
      }),
      this.tenantPrisma.client.externalReview.findFirst({
        where: { businessId, stars: 5 },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (topProducts.length === 0 && !topReview) {
      return {
        ideas: [
          "Not enough real sales or review data yet to ground a content idea — check back once you've had a few sales or reviews.",
        ],
      };
    }

    const evidence: string[] = [];
    if (topProducts.length > 0) {
      evidence.push(
        'Best-selling products in the last 30 days: ' +
          topProducts
            .map((p) => `${p.name} (${p._sum.qty ?? 0} sold)`)
            .join(', '),
      );
    }
    if (topReview) {
      evidence.push(
        `Most recent 5-star review: "${topReview.text ?? ''}" — ${topReview.author ?? 'a customer'}`,
      );
    }

    const prompt = [
      "Here is this business's real recent data:",
      ...evidence,
      '',
      'Suggest exactly 3 short content post ideas (one sentence each) a small business could post on social media or email, each grounded in one of the facts above. Do not invent prices, stock levels or claims not shown above.',
      'Return ONLY a JSON array of 3 strings, nothing else.',
    ].join('\n');

    try {
      const raw = await this.aiInfra.complete(
        businessId,
        prompt,
        0.6,
        'marketing_content_ideas',
      );
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return { ideas: parsed as string[] };
      }
    } catch {
      // Fall through to the honest fallback below.
    }
    return { ideas: evidence.map((e) => `Post about: ${e}`) };
  }
}
