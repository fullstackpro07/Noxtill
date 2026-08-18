import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CREDIT_NOTABLE_OVERDUE_DAYS } from './dashboard.constants';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  FeedbackStatus,
  Role,
} from '@prisma/client';

interface RawActionItem {
  type: ActionItemType;
  entityId: string;
  priority: ActionItemPriority;
  title: string;
  reason: string;
  occurredAt: Date;
  deepLink: string;
}

interface LowStockRow {
  id: string;
  name: string;
  stock_qty: number;
  low_stock_threshold: number;
}

interface DebtorRow {
  customer_id: string;
  name: string;
  balance: string;
  days_outstanding: number;
  last_entry_at: Date;
}

/** Composite id the API surfaces per item — `type:entityId` — since a synthesized row has no DB
 * id of its own until someone acts on it (see ActionItemState's doc comment). */
function encodeId(type: ActionItemType, entityId: string): string {
  return `${type}:${entityId}`;
}
function decodeId(id: string): { type: ActionItemType; entityId: string } {
  const separator = id.indexOf(':');
  return {
    type: id.slice(0, separator) as ActionItemType,
    entityId: id.slice(separator + 1),
  };
}

const SNOOZE_DURATIONS_MS: Record<
  SnoozeActionItemDto['duration'],
  () => number
> = {
  '1h': () => 60 * 60 * 1000,
  tomorrow: () => 24 * 60 * 60 * 1000,
  next_week: () => 7 * 24 * 60 * 60 * 1000,
};

/**
 * Action Center (UPD-BE-004): every item is freshly queried from its real source table on every
 * call — the same read-only synthesis discipline as the Staff Inbox from v1 INT-009 — then
 * cross-referenced against `ActionItemState` to drop anything completed/dismissed/still-snoozed.
 * "Failed payment" and "Expiring warranty" (named in the spec's filter list) are disclosed as out
 * of scope: neither concept has any backing data model anywhere in this codebase yet.
 */
@Injectable()
export class ActionCenterService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(
    businessId: string,
    role: Role,
    businessUserId: string | null,
    filters: { priority?: ActionItemPriority; type?: ActionItemType },
  ) {
    const raw = await this.gatherRawItems(businessId, role, businessUserId);
    const states = await this.tenantPrisma.client.actionItemState.findMany({
      where: { businessId },
    });
    const stateByKey = new Map(
      states.map((s) => [encodeId(s.type, s.entityId), s]),
    );

    const now = new Date();
    const items = raw
      .filter((item) =>
        filters.priority ? item.priority === filters.priority : true,
      )
      .filter((item) => (filters.type ? item.type === filters.type : true))
      .map((item) => {
        const id = encodeId(item.type, item.entityId);
        const state = stateByKey.get(id);
        return { id, item, state };
      })
      .filter(({ state }) => {
        if (!state) return true;
        if (state.status === ActionItemStatus.snoozed) {
          return state.snoozedUntil ? state.snoozedUntil <= now : false;
        }
        // completed / dismissed rows never resurface.
        return false;
      })
      .map(({ id, item }) => ({
        id,
        type: item.type,
        priority: item.priority,
        title: item.title,
        reason: item.reason,
        ageMs: now.getTime() - item.occurredAt.getTime(),
        occurredAt: item.occurredAt,
        deepLink: item.deepLink,
      }))
      .sort((a, b) => {
        const priorityRank: Record<ActionItemPriority, number> = {
          urgent: 0,
          normal: 1,
          low: 2,
        };
        const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
        return byPriority !== 0 ? byPriority : b.ageMs - a.ageMs;
      });

    const completedThisWeek =
      await this.tenantPrisma.client.actionItemState.count({
        where: {
          businessId,
          status: ActionItemStatus.completed,
          updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      });

    return {
      items,
      counts: {
        urgent: items.filter((i) => i.priority === 'urgent').length,
        open: items.length,
        completedThisWeek,
      },
    };
  }

  async complete(businessId: string, id: string) {
    return this.setStatus(businessId, id, ActionItemStatus.completed);
  }

  async dismiss(businessId: string, id: string) {
    return this.setStatus(businessId, id, ActionItemStatus.dismissed);
  }

  async snooze(businessId: string, id: string, dto: SnoozeActionItemDto) {
    const snoozedUntil = new Date(
      Date.now() + SNOOZE_DURATIONS_MS[dto.duration](),
    );
    return this.setStatus(
      businessId,
      id,
      ActionItemStatus.snoozed,
      snoozedUntil,
    );
  }

  private async setStatus(
    businessId: string,
    id: string,
    status: ActionItemStatus,
    snoozedUntil?: Date,
  ) {
    const { type, entityId } = decodeId(id);
    if (!Object.values(ActionItemType).includes(type)) {
      throw new NotFoundException('Action item not found');
    }

    return this.tenantPrisma.client.actionItemState.upsert({
      where: { businessId_type_entityId: { businessId, type, entityId } },
      create: { businessId, type, entityId, status, snoozedUntil },
      update: { status, snoozedUntil: snoozedUntil ?? null },
    });
  }

  private async gatherRawItems(
    businessId: string,
    role: Role,
    businessUserId: string | null,
  ): Promise<RawActionItem[]> {
    // Staff only see items assigned to them — of the 4 real types, only complaints carry an
    // assignee at all, so a staff caller sees complaints-assigned-to-them and nothing else.
    if (role === Role.staff) {
      return this.complaintItems(businessId, businessUserId);
    }

    const [complaints, lowStock, overdueCredit, unrepliedReviews] =
      await Promise.all([
        this.complaintItems(businessId, null),
        this.lowStockItems(businessId),
        this.overdueCreditItems(businessId),
        this.unrepliedReviewItems(businessId),
      ]);
    return [...complaints, ...lowStock, ...overdueCredit, ...unrepliedReviews];
  }

  private async complaintItems(
    businessId: string,
    assignedToOnly: string | null,
  ): Promise<RawActionItem[]> {
    const rows = await this.tenantPrisma.client.privateFeedback.findMany({
      where: {
        businessId,
        status: { not: FeedbackStatus.resolved },
        ...(assignedToOnly ? { assignedTo: assignedToOnly } : {}),
      },
      include: { customer: true },
    });

    return rows.map((row) => ({
      type: ActionItemType.complaint,
      entityId: row.id,
      priority:
        row.stars <= 2 ? ActionItemPriority.urgent : ActionItemPriority.normal,
      title: `${row.stars}★ complaint${row.customer ? ` from ${row.customer.name}` : ''}`,
      reason: row.message ?? 'No comment left',
      occurredAt: row.createdAt,
      deepLink: '/reviews',
    }));
  }

  private async lowStockItems(businessId: string): Promise<RawActionItem[]> {
    const rows = await this.tenantPrisma.client.$queryRaw<LowStockRow[]>`
      SELECT id, name, stock_qty, low_stock_threshold FROM products
      WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold
      ORDER BY stock_qty ASC
    `;

    return rows.map((row) => ({
      type: ActionItemType.low_stock,
      entityId: row.id,
      priority:
        row.stock_qty <= 0
          ? ActionItemPriority.urgent
          : ActionItemPriority.normal,
      title: row.name,
      reason: `${row.stock_qty} left (threshold ${row.low_stock_threshold})`,
      occurredAt: new Date(),
      deepLink: '/inventory',
    }));
  }

  private async overdueCreditItems(
    businessId: string,
  ): Promise<RawActionItem[]> {
    const rows = await this.tenantPrisma.client.$queryRaw<DebtorRow[]>`
      SELECT v.customer_id, c.name, v.balance, v.days_outstanding, v.last_entry_at
      FROM v_credit_balances v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id = ${businessId} AND v.balance > 0 AND v.days_outstanding >= ${CREDIT_NOTABLE_OVERDUE_DAYS}
      ORDER BY v.days_outstanding DESC
    `;

    return rows.map((row) => ({
      type: ActionItemType.overdue_credit,
      entityId: row.customer_id,
      priority:
        row.days_outstanding >= CREDIT_NOTABLE_OVERDUE_DAYS * 2
          ? ActionItemPriority.urgent
          : ActionItemPriority.normal,
      title: `${row.name} — ${Number(row.balance)} owed`,
      reason: `${row.days_outstanding} days overdue`,
      occurredAt: row.last_entry_at,
      deepLink: '/credit',
    }));
  }

  private async unrepliedReviewItems(
    businessId: string,
  ): Promise<RawActionItem[]> {
    const rows = await this.tenantPrisma.client.externalReview.findMany({
      where: { businessId, repliedAt: null },
    });

    return rows.map((row) => ({
      type: ActionItemType.unreplied_review,
      entityId: row.id,
      priority:
        row.stars <= 2 ? ActionItemPriority.urgent : ActionItemPriority.low,
      title: `${row.stars}★ review${row.author ? ` from ${row.author}` : ''} on ${row.platform}`,
      reason: row.text ?? 'No text left',
      occurredAt: row.createdAt,
      deepLink: '/reviews',
    }));
  }
}
