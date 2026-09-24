import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { MAX_ROUTING_RULES } from './voice.constants';
import {
  CreateRoutingRuleDto,
  ReorderRoutingRulesDto,
  UpdateRoutingRuleDto,
} from './dto/routing-rule.dto';

/**
 * AI Phone, full — a business's own routing rules (Queue & Routing screen), evaluated for real by
 * `VoiceCallService` on every caller turn (see `evaluateRoutingRules` there). CRUD only; the actual
 * matching logic lives with the call-handling webhook because it runs off unauthenticated Twilio
 * requests with no CLS tenant bound, same reasoning as every other raw-`PrismaService` read in
 * `voice-call.service.ts`.
 */
@Injectable()
export class VoiceRoutingRulesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(businessId: string) {
    void businessId; // TenantPrismaService already scopes every query to CLS's businessId.
    return this.tenantPrisma.client.voiceRoutingRule.findMany({
      orderBy: { position: 'asc' },
    });
  }

  async create(businessId: string, dto: CreateRoutingRuleDto) {
    const count = await this.tenantPrisma.client.voiceRoutingRule.count();
    if (count >= MAX_ROUTING_RULES) {
      throw new AppException(
        'VOICE_ROUTING_RULE_LIMIT',
        `You can keep at most ${MAX_ROUTING_RULES} routing rules`,
        HttpStatus.BAD_REQUEST,
      );
    }
    this.assertMatchValue(dto.triggerKind, dto.matchValue);
    if (dto.action === 'transfer' && !dto.transferNumber) {
      // Fine — it can fall back to the business's own configured transfer number at match time.
    }
    const rows = await this.tenantPrisma.client.$queryRaw<{ next: bigint }[]>`
      SELECT COALESCE(MAX(position), 0) + 1 AS next FROM voice_routing_rules WHERE business_id = ${businessId}
    `;
    const position = Number(rows[0].next);
    return this.tenantPrisma.client.voiceRoutingRule.create({
      data: {
        businessId,
        position,
        name: dto.name,
        triggerKind: dto.triggerKind,
        matchValue: dto.matchValue ?? null,
        action: dto.action,
        transferNumber: dto.transferNumber ?? null,
      },
    });
  }

  async update(businessId: string, id: string, dto: UpdateRoutingRuleDto) {
    const rule = await this.findOwned(businessId, id);
    if (dto.triggerKind || dto.matchValue !== undefined) {
      this.assertMatchValue(
        dto.triggerKind ?? rule.triggerKind,
        dto.matchValue !== undefined ? dto.matchValue : rule.matchValue,
      );
    }
    return this.tenantPrisma.client.voiceRoutingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.triggerKind !== undefined
          ? { triggerKind: dto.triggerKind }
          : {}),
        ...(dto.matchValue !== undefined ? { matchValue: dto.matchValue } : {}),
        ...(dto.action !== undefined ? { action: dto.action } : {}),
        ...(dto.transferNumber !== undefined
          ? { transferNumber: dto.transferNumber }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOwned(businessId, id);
    await this.tenantPrisma.client.voiceRoutingRule.delete({ where: { id } });
    return { id };
  }

  /** Reassigns `position` to match the given order — every existing rule id must be present exactly once. */
  async reorder(businessId: string, dto: ReorderRoutingRulesDto) {
    const existing = await this.tenantPrisma.client.voiceRoutingRule.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));
    const givenIds = new Set(dto.ids);
    if (
      existingIds.size !== givenIds.size ||
      [...existingIds].some((id) => !givenIds.has(id))
    ) {
      throw new AppException(
        'VOICE_ROUTING_RULE_REORDER_MISMATCH',
        'The given order must contain exactly the current rules, once each',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.tenantPrisma.client.$transaction(
      dto.ids.map((id, i) =>
        this.tenantPrisma.client.voiceRoutingRule.update({
          where: { id },
          data: { position: i + 1 },
        }),
      ),
    );
    return this.list(businessId);
  }

  private async findOwned(businessId: string, id: string) {
    const rule = await this.tenantPrisma.client.voiceRoutingRule.findUnique({
      where: { id },
    });
    if (!rule || rule.businessId !== businessId) {
      throw new NotFoundException('Routing rule not found');
    }
    return rule;
  }

  private assertMatchValue(
    triggerKind: string,
    matchValue: string | null | undefined,
  ) {
    const needsMatch = ['keyword', 'topic', 'sentiment'].includes(triggerKind);
    if (needsMatch && !matchValue?.trim()) {
      throw new AppException(
        'VOICE_ROUTING_RULE_MATCH_REQUIRED',
        'This trigger needs a value to match against',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
