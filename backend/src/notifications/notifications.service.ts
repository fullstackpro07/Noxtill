import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

const LIST_LIMIT = 50;

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

  /** Called internally by other services (e.g. the account-zip processor) — not itself an HTTP write. */
  async create(
    businessId: string,
    userId: string,
    input: CreateNotificationInput,
  ) {
    return this.tenantPrisma.client.notification.create({
      data: { businessId, userId, ...input },
    });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.tenantPrisma.client.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    return this.tenantPrisma.client.notification.update({
      where: { id },
      data: { read: true },
    });
  }
}
