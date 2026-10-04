import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CREDIT_NOTABLE_OVERDUE_DAYS } from './dashboard.constants';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  FeedbackStatus,
  AmDowntime,
  AmWorkOrder,
  FsApproval,
  PayApproval,
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
  /** Staff module v2 (UPD-BE-STAFF-07): only a `complaint` item carries a real assignee — every
   * other type (low_stock/overdue_credit/unreplied_review) has no staff-attribution concept in
   * the backend, so this stays null for those rather than guessing. */
  assigneeStaffId?: string | null;
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
  // Credit aging fix (UPD-INT-006): mysql2 decodes this as a real JS `bigint` through
  // v_credit_balances's window-function CTE — never compare/arithmetic it directly.
  days_outstanding: bigint;
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
 * "Failed payment" comes from Payments & Billing recovery cases. "Expiring warranty" (named in the
 * spec's filter list) is disclosed as out of scope: it has no backing data model yet.
 */
@Injectable()
export class ActionCenterService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

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
        assigneeStaffId: item.assigneeStaffId ?? null,
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

    const [
      complaints,
      lowStock,
      overdueCredit,
      unrepliedReviews,
      finance,
      payments,
      assets,
      field,
    ] = await Promise.all([
      this.complaintItems(businessId, null),
      this.lowStockItems(businessId),
      this.overdueCreditItems(businessId),
      this.unrepliedReviewItems(businessId),
      this.financeApprovalItems(businessId, role),
      this.paymentItems(businessId, role),
      this.assetItems(businessId, role),
      this.fieldItems(businessId, role),
    ]);
    return [
      ...complaints,
      ...lowStock,
      ...overdueCredit,
      ...unrepliedReviews,
      ...finance,
      ...payments,
      ...assets,
      ...field,
    ];
  }

  /**
   * Field Service: pending manager approvals (overtime dispatch, cancellations, reopen, high-value
   * parts), open jobs past their SLA, and unassigned Emergency / Urgent jobs. Keyed by the group root.
   */
  private async fieldItems(
    businessId: string,
    role: Role,
  ): Promise<RawActionItem[]> {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!biz) return [];
    const root = biz.parentId ?? biz.id;
    if (
      !(await this.prisma.fsSettings.findUnique({
        where: { businessId: root },
      }))
    )
      return [];
    const open = [
      'Open',
      'Awaiting Approval',
      'Approved',
      'Scheduled',
      'Assigned',
      'Dispatched',
      'En Route',
      'Arrived',
      'In Progress',
      'Paused',
      'Awaiting Parts',
    ];
    const [approvals, breached, unassigned] = await Promise.all([
      role === Role.owner || role === Role.manager
        ? this.prisma.fsApproval.findMany({
            where: { businessId: root, status: 'Pending' },
            orderBy: { createdAt: 'asc' },
            take: 50,
          })
        : Promise.resolve([] as FsApproval[]),
      this.prisma.fsWorkOrder.findMany({
        where: {
          businessId: root,
          status: { in: open },
          slaDueAt: { lt: new Date() },
        },
        orderBy: { slaDueAt: 'asc' },
        take: 50,
      }),
      this.prisma.fsWorkOrder.findMany({
        where: {
          businessId: root,
          techUserId: null,
          priority: { in: ['Emergency', 'Urgent'] },
          status: {
            in: ['Open', 'Approved', 'Scheduled', 'Awaiting Approval'],
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
    ]);
    return [
      ...approvals.map((a) => ({
        type: ActionItemType.field_approval,
        entityId: a.id,
        priority: ActionItemPriority.normal,
        title: `Field approval · ${a.kind}`,
        reason: a.what,
        occurredAt: a.createdAt,
        deepLink: '/field-service',
      })),
      ...breached.map((w) => ({
        type: ActionItemType.field_sla_breach,
        entityId: w.id,
        priority: ActionItemPriority.urgent,
        title: `SLA breached · ${w.number}`,
        reason: `${w.priority} · ${w.status} · due ${w.slaDueAt!.toISOString().slice(0, 16).replace('T', ' ')}`,
        occurredAt: w.slaDueAt!,
        deepLink: `/field-service/work-orders/${w.id}`,
      })),
      ...unassigned.map((w) => ({
        type: ActionItemType.field_unassigned_urgent,
        entityId: w.id,
        priority: ActionItemPriority.urgent,
        title: `Unassigned ${w.priority.toLowerCase()} job · ${w.number}`,
        reason: w.scope.slice(0, 100),
        occurredAt: w.createdAt,
        deepLink: '/field-service/dispatch',
      })),
    ];
  }

  /**
   * Assets & Maintenance: overdue preventive plans, critical assets down past their escalation
   * threshold (Asset Settings › Criticality), and work orders waiting in Draft for approval
   * (Owner). Keyed by the group root, like Finance and Payments.
   */
  private async assetItems(
    businessId: string,
    role: Role,
  ): Promise<RawActionItem[]> {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!biz) return [];
    const root = biz.parentId ?? biz.id;
    const settings = await this.prisma.amSettings.findUnique({
      where: { businessId: root },
    });
    if (!settings) return [];
    const crit = (
      (
        settings.config as {
          criticality?: { level: string; escalateHours: number | null }[];
        }
      )?.criticality ?? []
    ).find((c) => c.level === 'Critical');
    const today = new Date(
      new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
    );
    const [plans, down, drafts] = await Promise.all([
      this.prisma.amPmPlan.findMany({
        where: { businessId: root, status: 'Active', nextDueOn: { lt: today } },
        orderBy: { nextDueOn: 'asc' },
        take: 50,
      }),
      crit?.escalateHours != null
        ? this.prisma.amDowntime.findMany({
            where: {
              businessId: root,
              endAt: null,
              startAt: {
                lte: new Date(Date.now() - crit.escalateHours * 3_600_000),
              },
            },
          })
        : Promise.resolve([] as AmDowntime[]),
      role === Role.owner
        ? this.prisma.amWorkOrder.findMany({
            where: { businessId: root, status: 'Draft' },
            orderBy: { createdAt: 'asc' },
            take: 50,
          })
        : Promise.resolve([] as AmWorkOrder[]),
    ]);
    const assetIds = [
      ...new Set([
        ...plans.map((p) => p.assetId),
        ...down.map((d) => d.assetId),
        ...drafts.map((w) => w.assetId),
      ]),
    ];
    const assets = assetIds.length
      ? await this.prisma.amAsset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, number: true, name: true, criticality: true },
        })
      : [];
    const A = new Map(assets.map((a) => [a.id, a]));
    return [
      ...plans
        .filter((p) => A.has(p.assetId))
        .map((p) => ({
          type: ActionItemType.asset_pm_overdue,
          entityId: p.id,
          priority:
            A.get(p.assetId)!.criticality === 'Critical'
              ? ActionItemPriority.urgent
              : ActionItemPriority.normal,
          title: `Overdue maintenance · ${A.get(p.assetId)!.number}`,
          reason: `${p.name} · due ${p.nextDueOn?.toISOString().slice(0, 10) ?? '—'}`,
          occurredAt: p.nextDueOn ?? p.createdAt,
          deepLink: '/assets-maintenance/preventive-maintenance',
        })),
      ...down
        .filter((d) => A.get(d.assetId)?.criticality === 'Critical')
        .map((d) => ({
          type: ActionItemType.asset_down_critical,
          entityId: d.id,
          priority: ActionItemPriority.urgent,
          title: `Critical asset down · ${A.get(d.assetId)!.number}`,
          reason: `${A.get(d.assetId)!.name} · ${d.cause} · since ${d.startAt.toISOString().slice(0, 16).replace('T', ' ')}`,
          occurredAt: d.startAt,
          deepLink: `/assets-maintenance/assets/${d.assetId}`,
        })),
      ...drafts
        .filter((w) => A.has(w.assetId))
        .map((w) => ({
          type: ActionItemType.asset_wo_approval,
          entityId: w.id,
          priority: ActionItemPriority.normal,
          title: `Approve work order ${w.number}`,
          reason: `${A.get(w.assetId)!.number} · ${w.type} · ${w.scope.slice(0, 80)}`,
          occurredAt: w.createdAt,
          deepLink: '/assets-maintenance/work-orders',
        })),
    ];
  }

  /**
   * Payments & Billing: Owner approvals (refund execution / dispute response / high-risk policy),
   * dispute evidence deadlines inside the policy warning window, and open failed-payment cases.
   * Payments is keyed by the group root, like Finance.
   */
  private async paymentItems(
    businessId: string,
    role: Role,
  ): Promise<RawActionItem[]> {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!biz) return [];
    const root = biz.parentId ?? biz.id;
    const settings = await this.prisma.paySettings.findUnique({
      where: { businessId: root },
    });
    if (!settings) return [];
    const warnDays = Number(
      (settings.policy as { disputes?: { warnDays?: number } })?.disputes
        ?.warnDays ?? 3,
    );
    const [approvals, disputes, cases] = await Promise.all([
      role === Role.owner
        ? this.prisma.payApproval.findMany({
            where: { businessId: root, status: 'Pending' },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([] as PayApproval[]),
      this.prisma.payDispute.findMany({
        where: {
          businessId: root,
          env: 'live',
          status: 'Needs Response',
          dueBy: { lte: new Date(Date.now() + warnDays * 86_400_000) },
        },
      }),
      this.prisma.payRecoveryCase.findMany({
        where: {
          businessId: root,
          status: { in: ['Scheduled', 'Waiting on customer', 'Manual Review'] },
        },
        orderBy: { lastAttemptAt: 'desc' },
        take: 50,
      }),
    ]);
    const txs = cases.length
      ? await this.prisma.payTransaction.findMany({
          where: { id: { in: cases.map((c) => c.txId) }, env: 'live' },
          select: { id: true, number: true, amount: true, currency: true },
        })
      : [];
    const txById = new Map(txs.map((t) => [t.id, t]));
    return [
      ...approvals.map((a) => ({
        type: ActionItemType.payment_approval,
        entityId: a.id,
        priority: ActionItemPriority.urgent,
        title: `Approve: ${a.title}`,
        reason: a.rule,
        occurredAt: a.createdAt,
        deepLink: `/payments?approval=${a.id}`,
      })),
      ...disputes.map((d) => ({
        type: ActionItemType.payment_dispute_due,
        entityId: d.id,
        priority: ActionItemPriority.urgent,
        title: `Dispute evidence due · ${Number(d.amount).toFixed(2)} ${d.currency}`,
        reason: `${d.reason} · due ${d.dueBy?.toISOString().slice(0, 10) ?? '—'}`,
        occurredAt: d.openedAt,
        deepLink: `/payments/disputes?open=dsp:${d.id}`,
      })),
      ...cases
        .filter((c) => txById.has(c.txId))
        .map((c) => {
          const t = txById.get(c.txId)!;
          return {
            type: ActionItemType.payment_failed,
            entityId: c.id,
            priority:
              c.status === 'Manual Review'
                ? ActionItemPriority.urgent
                : ActionItemPriority.normal,
            title: `Failed payment ${t.number} · ${Number(t.amount).toFixed(2)} ${t.currency}`,
            reason: `${c.category} (${c.rawCode}) · ${c.status}`,
            occurredAt: c.lastAttemptAt,
            deepLink: `/payments/recovery?open=rcv:${c.id}`,
          };
        }),
    ];
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
      assigneeStaffId: row.assignedTo,
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

    return rows.map((row) => {
      const daysOutstanding = Number(row.days_outstanding);
      return {
        type: ActionItemType.overdue_credit,
        entityId: row.customer_id,
        priority:
          daysOutstanding >= CREDIT_NOTABLE_OVERDUE_DAYS * 2
            ? ActionItemPriority.urgent
            : ActionItemPriority.normal,
        title: `${row.name} — ${Number(row.balance)} owed`,
        reason: `${daysOutstanding} days overdue`,
        occurredAt: row.last_entry_at,
        deepLink: '/credit',
      };
    });
  }

  /**
   * Finance approvals waiting on this person: an Owner sees every pending one; a Manager (who holds
   * finance.approve by default) sees those at the Finance Manager level. The ledger belongs to the
   * business group's root, so this reads it there rather than through the branch-scoped client.
   */
  private async financeApprovalItems(
    businessId: string,
    role: Role,
  ): Promise<RawActionItem[]> {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!biz) return [];
    const rows = await this.prisma.finApproval.findMany({
      where: {
        businessId: biz.parentId ?? biz.id,
        status: 'Pending',
        ...(role === Role.owner ? {} : { approverRole: 'Finance Manager' }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      type: ActionItemType.finance_approval,
      entityId: row.id,
      priority:
        row.approverRole === 'Finance Manager'
          ? ActionItemPriority.normal
          : ActionItemPriority.urgent,
      title: `Approve: ${row.title}`,
      reason: `${row.rule}${row.amount != null ? ` · ${Number(row.amount).toFixed(2)}` : ''}`,
      occurredAt: row.createdAt,
      deepLink: `/finance?open=${row.subjectType}:${row.subjectId}`,
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
