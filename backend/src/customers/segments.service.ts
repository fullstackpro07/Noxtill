import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import {
  segmentApprovalState,
  segmentDefinitionHash,
} from './segment-approval.util';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { SegmentRulesDto } from './dto/segment-rules.dto';
import {
  SegmentRules,
  excludeErasedCustomers,
  rulesToWhere,
} from './segment-rules.util';
import { Prisma } from '@prisma/client';

const NEW_CUSTOMER_WINDOW_DAYS = 30;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Customer segments (BE-041, extended by UPD-BE-098). Two coexisting concepts, one method:
 * `getSegment(key)` — the legacy hardcoded vip/new/lapsed/tag keys `CampaignsService` already
 * depends on — now ALSO resolves a real persisted `Segment.id`, so campaign targeting works for
 * either kind through the exact same code path, no caller changes required.
 */
@Injectable()
export class SegmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async getSegment(key: string) {
    if (UUID_RE.test(key)) {
      const segment = await this.tenantPrisma.client.segment.findUnique({
        where: { id: key },
      });
      if (segment) {
        if (segmentApprovalState(segment) === 'changed')
          throw new AppException(
            'CUSTOMER_SEGMENT_APPROVAL_INVALIDATED',
            'This agent-created Segment changed after approval. Re-review its proposal before using it as an audience.',
            HttpStatus.CONFLICT,
          );
        const members = await this.tenantPrisma.client.customer.findMany({
          where: excludeErasedCustomers(
            rulesToWhere(segment.rules as unknown as SegmentRules),
          ),
          orderBy: { name: 'asc' },
        });
        return { key, count: members.length, members };
      }
    }

    const where = this.whereForKey(key);
    const members = await this.tenantPrisma.client.customer.findMany({
      where: excludeErasedCustomers(where),
      orderBy: { name: 'asc' },
    });
    return { key, count: members.length, members };
  }

  // MySQL migration: `tags` is a JSON array now (Prisma's MySQL connector has no native array
  // column type), so every tag-membership check uses the Json filter API's `array_contains`
  // instead of the old scalar-list `has` operator.
  private whereForKey(key: string): Prisma.CustomerWhereInput {
    switch (key) {
      case 'all':
        return {};
      case 'vip':
        return { tags: { array_contains: ['VIP'] } };
      case 'lapsed':
        return { tags: { array_contains: ['Lapsed'] } };
      case 'new': {
        const since = new Date(
          Date.now() - NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );
        return { createdAt: { gte: since } };
      }
      default:
        return { tags: { array_contains: [key] } };
    }
  }

  /** Real, persisted segments (UPD-BE-098). `spend` (Marketing module v2's Audiences tab) is the
   * real sum of `lifetimeSpend` across today's matching members — what this group has already
   * spent, not a forecast of what a campaign to them would earn. */
  async list() {
    const segments = await this.tenantPrisma.client.segment.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      segments.map(async (segment) => {
        const where = excludeErasedCustomers(
          rulesToWhere(segment.rules as unknown as SegmentRules),
        );
        const [count, spend] = await Promise.all([
          this.tenantPrisma.client.customer.count({ where }),
          this.tenantPrisma.client.customer.aggregate({
            where,
            _sum: { lifetimeSpend: true },
          }),
        ]);
        return {
          ...segment,
          agentApprovalState: segmentApprovalState(segment),
          count,
          spend: Number(spend._sum.lifetimeSpend ?? 0),
        };
      }),
    );
  }

  create(
    businessId: string,
    dto: CreateSegmentDto,
    client: Pick<TenantPrismaService['client'], 'segment'> = this.tenantPrisma
      .client,
    recommendationId?: string,
  ) {
    return client.segment.create({
      data: {
        businessId,
        name: dto.name,
        rules: dto.rules as unknown as Prisma.InputJsonValue,
        ...(recommendationId
          ? {
              sourceAgentRecommendationId: recommendationId,
              agentApprovedVersion: 1,
              agentApprovedDefinitionHash: segmentDefinitionHash(
                dto.name,
                dto.rules,
                1,
              ),
            }
          : {}),
      },
    });
  }

  async update(id: string, dto: UpdateSegmentDto, actorUserId?: string) {
    const existing = await this.findSegment(id);
    if (dto.name === undefined && dto.rules === undefined) return existing;
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const claimed = await tx.segment.updateMany({
        where: { id, version: existing.version },
        data: {
          name: dto.name,
          rules: dto.rules
            ? (dto.rules as unknown as Prisma.InputJsonValue)
            : undefined,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new AppException(
          'CUSTOMER_SEGMENT_TARGET_CHANGED',
          'The Segment changed. Reload before editing it.',
          HttpStatus.CONFLICT,
        );
      const updated = await tx.segment.findUniqueOrThrow({ where: { id } });
      if (existing.sourceAgentRecommendationId)
        await tx.auditLog.create({
          data: {
            businessId: existing.businessId,
            actorUserId,
            entity: 'Segment',
            entityId: id,
            action: 'customer_agent.segment_approval_invalidated',
            after: {
              version: updated.version,
              recommendationId: existing.sourceAgentRecommendationId,
            },
          },
        });
      return updated;
    });
  }

  async applyApprovedDefinition(
    id: string,
    businessId: string,
    expectedVersion: number,
    dto: CreateSegmentDto,
    client: Pick<TenantPrismaService['client'], 'segment'>,
  ) {
    const version = expectedVersion + 1;
    const claimed = await client.segment.updateMany({
      where: { id, businessId, version: expectedVersion },
      data: {
        name: dto.name,
        rules: dto.rules as unknown as Prisma.InputJsonValue,
        version,
        agentApprovedVersion: version,
        agentApprovedDefinitionHash: segmentDefinitionHash(
          dto.name,
          dto.rules,
          version,
        ),
      },
    });
    if (claimed.count !== 1)
      throw new AppException(
        'CUSTOMER_SEGMENT_TARGET_CHANGED',
        'The target Segment changed. Reopen and review a fresh proposal.',
        HttpStatus.CONFLICT,
      );
    return client.segment.findUniqueOrThrow({ where: { id, businessId } });
  }

  async remove(id: string): Promise<void> {
    await this.findSegment(id);
    await this.tenantPrisma.client.segment.delete({ where: { id } });
  }

  async duplicate(businessId: string, id: string) {
    const segment = await this.findSegment(id);
    return this.tenantPrisma.client.segment.create({
      data: {
        businessId,
        name: `${segment.name} (copy)`,
        rules: segment.rules as Prisma.InputJsonValue,
      },
    });
  }

  /** Live matching count for a rule set still being edited — not yet saved. */
  async previewCount(
    rules: SegmentRulesDto,
    client: Pick<TenantPrismaService['client'], 'customer'> = this.tenantPrisma
      .client,
  ) {
    const count = await client.customer.count({
      where: excludeErasedCustomers(rulesToWhere(rules)),
    });
    return { count };
  }

  /**
   * AI-persona-suggestion popup (UPD-FE-082) — a real Claude call through the shared
   * rate-limited/cost-capped infra, given the rules' own values (never fabricated client-side).
   * Falls back to a plain, honest label if the model's response can't be parsed as JSON.
   */
  async suggestPersona(businessId: string, rules: SegmentRulesDto) {
    const summary = this.describeRules(rules);
    const prompt = [
      'A small business owner is building a customer segment with these rules:',
      summary,
      'Suggest a short, memorable persona name (2-4 words, no quotes) and a one-sentence description of who this segment represents.',
      'Return ONLY JSON: {"name": string, "description": string}',
    ].join('\n');

    const raw = await this.aiInfra.complete(businessId, prompt, 0.7);
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        name?: string;
        description?: string;
      };
      if (parsed.name) {
        return { name: parsed.name, description: parsed.description ?? '' };
      }
    } catch {
      // Fall through to the honest fallback below.
    }
    return { name: 'Custom segment', description: summary };
  }

  private describeRules(rules: SegmentRulesDto): string {
    return rules.conditions
      .map((c) => `${c.field} ${c.operator} ${c.value}`)
      .join(` ${rules.combinator} `);
  }

  private async findSegment(id: string) {
    const segment = await this.tenantPrisma.client.segment.findUnique({
      where: { id },
    });
    if (!segment) {
      throw new NotFoundException('Segment not found');
    }
    return segment;
  }
}
