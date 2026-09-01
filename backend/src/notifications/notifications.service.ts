import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NotificationChannel,
  NotificationEvent,
} from './notification-preferences.constants';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import {
  CAPABILITIES,
  Capability,
} from '../common/capabilities/capabilities.constants';

const LIST_LIMIT = 50;
/** The business-wide-default sentinel — see `NotificationPreference.userId`'s schema doc comment for why this isn't NULL. */
const DEFAULT_SCOPE = '';

export interface CreateNotificationInput {
  title: string;
  body: string;
  link?: string;
}

/**
 * User-facing notification inbox (INT-012) — distinct from the write-only
 * `Event` analytics sink (BE-072). Scoped to both the tenant AND the
 * specific recipient user, since one owner's export shouldn't show up in
 * another staff member's bell.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(userId: string) {
    return this.tenantPrisma.client.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  /**
   * Called internally by other services (e.g. the account-zip processor) — not itself an HTTP
   * write. `event` (UPD-BE-122) is optional so a caller that hasn't been migrated to the real
   * event catalog yet still works exactly as before (always creates); a real event key gets
   * checked against real preferences first and is silently skipped if the recipient turned this
   * event's `in_app` channel off — that's the only real delivery transport internal alerts have
   * today, see `notification-preferences.constants.ts`'s doc comment.
   */
  async create(
    businessId: string,
    userId: string,
    input: CreateNotificationInput,
    event?: NotificationEvent,
  ) {
    if (event && !(await this.isEnabled(businessId, userId, event, 'in_app'))) {
      return null;
    }
    return this.tenantPrisma.client.notification.create({
      data: { businessId, userId, ...input },
    });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.tenantPrisma.client.notification.findUnique(
      {
        where: { id },
      },
    );
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    return this.tenantPrisma.client.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /** Real per-staff-override-over-business-default resolution — a missing row (neither default nor override) means enabled, so no pre-existing recipient is silently muted by this ticket. */
  async isEnabled(
    businessId: string,
    userId: string,
    event: NotificationEvent,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const [override, businessDefault] = await Promise.all([
      this.tenantPrisma.client.notificationPreference.findUnique({
        where: {
          businessId_userId_event_channel: {
            businessId,
            userId,
            event,
            channel,
          },
        },
      }),
      this.tenantPrisma.client.notificationPreference.findUnique({
        where: {
          businessId_userId_event_channel: {
            businessId,
            userId: DEFAULT_SCOPE,
            event,
            channel,
          },
        },
      }),
    ]);
    return (override ?? businessDefault)?.enabled ?? true;
  }

  /** The real event×channel matrix (UPD-BE-122): business-wide defaults, plus this staff member's own overrides if `userId` is given. A missing row reads as enabled. */
  async getPreferenceMatrix(businessId: string, userId?: string) {
    const [defaults, overrides] = await Promise.all([
      this.tenantPrisma.client.notificationPreference.findMany({
        where: { businessId, userId: DEFAULT_SCOPE },
      }),
      userId
        ? this.tenantPrisma.client.notificationPreference.findMany({
            where: { businessId, userId },
          })
        : Promise.resolve([]),
    ]);

    const rows: {
      event: NotificationEvent;
      channel: NotificationChannel;
      enabledByDefault: boolean;
      overridden: boolean;
      enabled: boolean;
    }[] = [];
    for (const event of NOTIFICATION_EVENTS) {
      for (const channel of NOTIFICATION_CHANNELS) {
        const def = defaults.find(
          (d) => d.event === event && d.channel === channel,
        );
        const override = overrides.find(
          (o) => o.event === event && o.channel === channel,
        );
        const enabledByDefault = def?.enabled ?? true;
        rows.push({
          event,
          channel,
          enabledByDefault,
          overridden: !!override,
          enabled: override?.enabled ?? enabledByDefault,
        });
      }
    }
    return rows;
  }

  /** Writes the business default (`dto.userId` omitted) or a named staff member's override. */
  async setPreferences(
    businessId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const scope = dto.userId ?? DEFAULT_SCOPE;
    if (dto.userId) {
      const link = await this.tenantPrisma.client.businessUser.findFirst({
        where: { businessId, userId: dto.userId },
      });
      if (!link) {
        throw new NotFoundException(
          'That user is not a member of this business',
        );
      }
    }

    await this.tenantPrisma.client.$transaction(
      dto.preferences.map((pref) =>
        this.tenantPrisma.client.notificationPreference.upsert({
          where: {
            businessId_userId_event_channel: {
              businessId,
              userId: scope,
              event: pref.event,
              channel: pref.channel,
            },
          },
          create: {
            businessId,
            userId: scope,
            event: pref.event,
            channel: pref.channel,
            enabled: pref.enabled,
          },
          update: { enabled: pref.enabled },
        }),
      ),
    );

    return this.getPreferenceMatrix(businessId, dto.userId);
  }

  /** A staff member may always read/write their own override. Anything else — someone else's
   * override, or the business-wide default (`targetUserId` omitted) — needs real staff-managing
   * capability, so a staff member can't quietly mute the business default for everyone. */
  assertSelfOrManaging(
    callerUserId: string,
    callerCapabilities: Capability[],
    targetUserId: string | undefined,
  ): void {
    if (targetUserId && targetUserId === callerUserId) return;
    if (
      !callerCapabilities.includes(CAPABILITIES.ROLES_MANAGE) &&
      !callerCapabilities.includes(CAPABILITIES.STAFF_MANAGE)
    ) {
      throw new ForbiddenException(
        targetUserId
          ? "Can't set another staff member's notification preferences"
          : 'Ask the owner or a manager to change the business-wide default',
      );
    }
  }
}
