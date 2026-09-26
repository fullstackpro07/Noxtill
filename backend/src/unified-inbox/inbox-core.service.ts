import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InboxConversation, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEvent } from '../notifications/notification-preferences.constants';
import { AppException } from '../common/filters/app.exception';
import { INBOX_ERROR_CODES } from './inbox.constants';
import { InboxSettingsService } from './inbox-settings.service';
import { workingMinutesBetween } from './inbox-hours.util';

export interface InboxPerson {
  userId: string;
  name: string;
  role: Role;
  roleLabel: string;
}

export interface Actor {
  userId: string | null;
  name: string | null;
}

/**
 * Pieces every inbox service needs. Raw PrismaService + explicit businessId throughout, because
 * the same code runs from webhook/queue processors that have no request tenant.
 */
@Injectable()
export class InboxCoreService {
  private readonly logger = new Logger(InboxCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: InboxSettingsService,
  ) {}

  async event(
    businessId: string,
    kind: string,
    opts: {
      conversationId?: string | null;
      actor?: Actor;
      ruleId?: string;
      detail?: string;
      data?: Prisma.InputJsonValue;
    } = {},
  ) {
    return this.prisma.inboxEvent.create({
      data: {
        businessId,
        kind,
        conversationId: opts.conversationId ?? null,
        actorUserId: opts.actor?.userId ?? null,
        actorName: opts.actor?.name ?? null,
        ruleId: opts.ruleId,
        detail: opts.detail,
        data: opts.data ?? {},
      },
    });
  }

  /** A line in the thread itself (kind `event`) — e.g. "Assigned to Hina by Olivia". */
  async threadEvent(businessId: string, conversationId: string, body: string) {
    return this.prisma.inboxMessage.create({
      data: { businessId, conversationId, kind: 'event', body },
    });
  }

  async people(businessId: string): Promise<InboxPerson[]> {
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId, active: true },
      select: {
        userId: true,
        role: true,
        customRole: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      role: r.role,
      roleLabel:
        r.customRole?.name ?? r.role.charAt(0).toUpperCase() + r.role.slice(1),
    }));
  }

  async personName(
    businessId: string,
    userId: string | null | undefined,
  ): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? null;
  }

  async assertAssignable(businessId: string, userId: string) {
    const member = await this.prisma.businessUser.findFirst({
      where: { businessId, userId, active: true },
    });
    if (!member)
      throw new AppException(
        INBOX_ERROR_CODES.INVALID_ASSIGNEE,
        'That person is not an active member of this business.',
        HttpStatus.BAD_REQUEST,
      );
  }

  /** In-app alerts to owners and managers (the only internal alert transport Noxtill has). */
  async notifyManagers(
    businessId: string,
    event: NotificationEvent,
    title: string,
    body: string,
    link = '/unified-inbox',
  ) {
    const managers = await this.prisma.businessUser.findMany({
      where: {
        businessId,
        active: true,
        role: { in: [Role.owner, Role.manager] },
      },
      select: { userId: true },
    });
    for (const m of managers)
      await this.notifyUser(businessId, m.userId, event, title, body, link);
  }

  async notifyUser(
    businessId: string,
    userId: string,
    event: NotificationEvent,
    title: string,
    body: string,
    link = '/unified-inbox',
  ) {
    try {
      await this.notifications.create(
        businessId,
        userId,
        { title, body, link },
        event,
      );
    } catch (error) {
      this.logger.warn(
        `Inbox notification failed: ${(error as Error).message}`,
      );
    }
  }

  /** Bookkeeping after anything went out to the customer on this conversation. */
  async afterOutbound(
    conversation: InboxConversation,
    text: string,
    at = new Date(),
  ) {
    const data: Prisma.InboxConversationUpdateInput = {
      lastMessageAt: at,
      lastMessagePreview: text.slice(0, 280),
      awaitingReplySince: null,
      flaggedAt: null,
      unreadCount: 0,
    };
    if (!conversation.firstReplyAt && conversation.firstInboundAt) {
      const s = await this.settings.get(conversation.businessId);
      data.firstReplyAt = at;
      data.firstReplyMinutes = workingMinutesBetween(
        conversation.firstInboundAt,
        at,
        s.hours,
        s.timezone,
      );
    }
    if (conversation.status !== 'open') {
      data.status = 'open';
      data.snoozedUntil = null;
      data.closedAt = null;
    }
    return this.prisma.inboxConversation.update({
      where: { id: conversation.id },
      data,
    });
  }
}
