import { HttpStatus, Injectable } from '@nestjs/common';
import { InboxRule, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { INBOX_ERROR_CODES } from './inbox.constants';
import { InboxCoreService } from './inbox-core.service';
import { RuleDto, UpdateRuleDto } from './dto/inbox.dto';

const DEFAULT_AWAY =
  'Thanks for your message. We are closed right now and will reply as soon as we open.';

@Injectable()
export class InboxRulesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly core: InboxCoreService,
  ) {}

  private invalid(message: string) {
    return new AppException(
      INBOX_ERROR_CODES.RULE_INVALID,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  /** A rule must be able to do something, and only the things its trigger supports. */
  private validate(
    r: Pick<
      InboxRule,
      | 'trigger'
      | 'minutes'
      | 'tag'
      | 'pinToTop'
      | 'assigneeUserId'
      | 'flag'
      | 'message'
    > & { keywords: string[] },
  ) {
    if (r.trigger === 'keyword') {
      if (r.keywords.filter((k) => k.trim()).length === 0)
        throw this.invalid('Add at least one word to match.');
      if (!r.tag && !r.pinToTop && !r.assigneeUserId && !r.flag)
        throw this.invalid(
          'Choose at least one thing the rule does: tag, move to the top, assign or flag.',
        );
      if (r.message)
        throw this.invalid(
          'Keyword rules cannot send messages — only the away message sends on its own.',
        );
    } else if (r.trigger === 'unanswered') {
      if (!r.minutes)
        throw this.invalid('Set how many minutes without a reply.');
      if (r.message || r.assigneeUserId || r.pinToTop)
        throw this.invalid(
          'An unanswered rule flags the conversation (and can tag it); it cannot send, assign or reorder.',
        );
    } else if (r.trigger === 'out_of_hours') {
      if (!r.message?.trim()) throw this.invalid('Write the away message.');
      if (r.tag || r.assigneeUserId || r.pinToTop || r.flag)
        throw this.invalid('The away rule only sends its message.');
    }
  }

  async create(user: AuthenticatedUser, dto: RuleDto) {
    const keywords = (dto.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    const rule = {
      trigger: dto.trigger,
      minutes: dto.minutes ?? null,
      tag: dto.tag?.trim() || null,
      pinToTop: dto.pinToTop ?? false,
      assigneeUserId: dto.assigneeUserId ?? null,
      flag: dto.trigger === 'unanswered' ? true : (dto.flag ?? false),
      message: dto.message?.trim() || null,
      keywords,
    };
    this.validate(rule);
    if (rule.assigneeUserId)
      await this.core.assertAssignable(user.businessId, rule.assigneeUserId);
    if (rule.trigger === 'out_of_hours') {
      const existing = await this.tenantPrisma.client.inboxRule.findFirst({
        where: { businessId: user.businessId, trigger: 'out_of_hours' },
      });
      if (existing)
        throw this.invalid(
          'There is already an away-message rule. Edit that one instead.',
        );
    }
    return this.tenantPrisma.client.inboxRule.create({
      data: {
        businessId: user.businessId,
        name: dto.name.trim(),
        ...rule,
        keywords: rule.keywords as Prisma.InputJsonValue,
      },
    });
  }

  private async find(user: AuthenticatedUser, id: string) {
    const rule = await this.tenantPrisma.client.inboxRule.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!rule)
      throw new AppException(
        INBOX_ERROR_CODES.RULE_INVALID,
        'Rule not found.',
        HttpStatus.NOT_FOUND,
      );
    return rule;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateRuleDto) {
    const current = await this.find(user, id);
    const next = {
      trigger: current.trigger,
      minutes: dto.minutes !== undefined ? dto.minutes : current.minutes,
      tag: dto.tag !== undefined ? dto.tag?.trim() || null : current.tag,
      pinToTop: dto.pinToTop ?? current.pinToTop,
      assigneeUserId:
        dto.assigneeUserId !== undefined
          ? dto.assigneeUserId
          : current.assigneeUserId,
      flag:
        current.trigger === 'unanswered' ? true : (dto.flag ?? current.flag),
      message:
        dto.message !== undefined
          ? dto.message?.trim() || null
          : current.message,
      keywords:
        dto.keywords !== undefined
          ? dto.keywords.map((k) => k.trim()).filter(Boolean)
          : ((current.keywords as string[]) ?? []),
    };
    this.validate(next);
    if (next.assigneeUserId && next.assigneeUserId !== current.assigneeUserId)
      await this.core.assertAssignable(user.businessId, next.assigneeUserId);
    return this.tenantPrisma.client.inboxRule.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...next,
        keywords: next.keywords as Prisma.InputJsonValue,
      },
    });
  }

  async toggle(user: AuthenticatedUser, id: string) {
    const rule = await this.find(user, id);
    const name = await this.core.personName(user.businessId, user.sub);
    return this.tenantPrisma.client.inboxRule.update({
      where: { id },
      data: rule.active
        ? { active: false, pausedAt: new Date(), pausedByName: name }
        : { active: true, pausedAt: null, pausedByName: null },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.find(user, id);
    await this.tenantPrisma.client.inboxRule.delete({ where: { id } });
    return { ok: true };
  }

  /** Settings → "Send an away message outside hours" drives the single out-of-hours rule. */
  async setAway(user: AuthenticatedUser, on: boolean, message?: string) {
    const existing = await this.tenantPrisma.client.inboxRule.findFirst({
      where: { businessId: user.businessId, trigger: 'out_of_hours' },
      orderBy: { createdAt: 'asc' },
    });
    const name = await this.core.personName(user.businessId, user.sub);
    if (!existing) {
      if (!on) return null;
      return this.tenantPrisma.client.inboxRule.create({
        data: {
          businessId: user.businessId,
          name: 'Out of hours reply',
          trigger: 'out_of_hours',
          message: message?.trim() || DEFAULT_AWAY,
        },
      });
    }
    return this.tenantPrisma.client.inboxRule.update({
      where: { id: existing.id },
      data: {
        ...(message?.trim() ? { message: message.trim() } : {}),
        ...(on
          ? { active: true, pausedAt: null, pausedByName: null }
          : { active: false, pausedAt: new Date(), pausedByName: name }),
      },
    });
  }
}
