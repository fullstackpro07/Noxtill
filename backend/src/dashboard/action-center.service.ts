import {
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CREDIT_NOTABLE_OVERDUE_DAYS } from './dashboard.constants';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import { parseDisabled } from '../business-modules/business-modules.service';
import { AppException } from '../common/filters/app.exception';
import { ProcurementService } from '../procurement/procurement.service';
import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  CommerceExperimentStatus,
  CommerceListingDraftStatus,
  CommerceRiskCaseStatus,
  CommerceRiskSeverity,
  CommerceSubscriptionStatus,
  CommerceWorkOrderStatus,
  FeedbackStatus,
  Role,
  SeoContentBriefStatus,
  StockTransferStatus,
} from '@prisma/client';
import { StockTransfersService } from '../branches/stock-transfers.service';
import { FinanceJournalsService } from '../profit/finance-journals.service';
import { SeoContentService } from '../marketing/seo-content.service';

interface RawActionItem {
  type: ActionItemType;
  entityId: string;
  priority: ActionItemPriority;
  title: string;
  reason: string;
  occurredAt: Date;
  dueAt?: Date | null;
  deepLink: string;
  /** Only source records with a real assignment concept carry this; unassigned sources stay null. */
  assigneeStaffId?: string | null;
  /** Decision items must go through their owning module's canonical approval service. */
  approvalAction?:
    | 'commerce_rfq_award'
    | 'commerce_supplier_claim'
    | 'inventory_branch_transfer'
    | 'finance_journal'
    | 'seo_content_brief';
  canDecide?: boolean;
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
 * "Failed payment" and "Expiring warranty" (named in the spec's filter list) are disclosed as out
 * of scope: neither concept has any backing data model anywhere in this codebase yet.
 */
@Injectable()
export class ActionCenterService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly procurement: ProcurementService,
    private readonly stockTransfers: StockTransfersService,
    @Optional() private readonly financeJournals?: FinanceJournalsService,
    @Optional() private readonly seoContent?: SeoContentService,
  ) {}

  async list(
    businessId: string,
    role: Role,
    businessUserId: string | null,
    filters: { priority?: ActionItemPriority; type?: ActionItemType },
    viewerUserId?: string,
  ) {
    const raw = await this.gatherRawItems(
      businessId,
      role,
      businessUserId,
      viewerUserId,
    );
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
        dueAt: item.dueAt?.toISOString() ?? null,
        deepLink: item.deepLink,
        assigneeStaffId: item.assigneeStaffId ?? null,
        ...(item.approvalAction ? { approvalAction: item.approvalAction } : {}),
        ...(item.approvalAction ? { canDecide: item.canDecide ?? false } : {}),
      }))
      .sort((a, b) => {
        const priorityRank: Record<ActionItemPriority, number> = {
          urgent: 0,
          normal: 1,
          low: 2,
        };
        const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
        if (byPriority !== 0) return byPriority;
        const dueA = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
        const dueB = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
        return dueA !== dueB ? dueA - dueB : b.ageMs - a.ageMs;
      });

    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [completedActionItems, completedCustomerFollowUps] =
      await Promise.all([
        this.tenantPrisma.client.actionItemState.count({
          where: {
            businessId,
            status: ActionItemStatus.completed,
            updatedAt: { gte: weekStart },
          },
        }),
        this.tenantPrisma.client.customerFollowUpTask.count({
          where: {
            businessId,
            status: 'completed',
            completedAt: { gte: weekStart },
          },
        }),
      ]);

    return {
      items,
      counts: {
        urgent: items.filter((i) => i.priority === 'urgent').length,
        open: items.length,
        completedThisWeek: completedActionItems + completedCustomerFollowUps,
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

  approveProcurementRequestAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.procurement_request || !entityId) {
      throw new AppException(
        'PROCUREMENT_ACTION_NOT_FOUND',
        'Purchase approval action not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.procurement.decideRequest(businessId, actorUserId, entityId, {
      decision: 'approve',
    });
  }

  rejectProcurementRequestAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
    reason: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.procurement_request || !entityId) {
      throw new AppException(
        'PROCUREMENT_ACTION_NOT_FOUND',
        'Purchase approval action not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.procurement.decideRequest(businessId, actorUserId, entityId, {
      decision: 'reject',
      reason,
    });
  }

  approveInventoryAgentTransferAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.inventory_transfer_approval || !entityId) {
      throw new AppException(
        'INVENTORY_TRANSFER_ACTION_NOT_FOUND',
        'Inventory transfer approval action not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.stockTransfers.approve(businessId, entityId, actorUserId);
  }

  rejectInventoryAgentTransferAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
    reason: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.inventory_transfer_approval || !entityId) {
      throw new AppException(
        'INVENTORY_TRANSFER_ACTION_NOT_FOUND',
        'Inventory transfer approval action not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.stockTransfers.reject(
      businessId,
      entityId,
      actorUserId,
      reason,
    );
  }

  approveFinanceJournalAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
    reason: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.finance_journal || !entityId) {
      throw new AppException(
        'FINANCE_JOURNAL_ACTION_NOT_FOUND',
        'Finance journal approval action not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!this.financeJournals) {
      throw new NotFoundException('Finance journal action not found');
    }
    return this.financeJournals.decideFromActionCenter(
      businessId,
      actorUserId,
      entityId,
      'approved',
      reason,
    );
  }

  rejectFinanceJournalAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
    reason: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.finance_journal || !entityId) {
      throw new AppException(
        'FINANCE_JOURNAL_ACTION_NOT_FOUND',
        'Finance journal approval action not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!this.financeJournals) {
      throw new NotFoundException('Finance journal action not found');
    }
    return this.financeJournals.decideFromActionCenter(
      businessId,
      actorUserId,
      entityId,
      'rejected',
      reason,
    );
  }

  async decideSeoAgentContentBriefAction(
    businessId: string,
    actorUserId: string,
    actionId: string,
    decision: 'approve' | 'send_back',
    reason: string,
  ) {
    const { type, entityId } = decodeId(actionId);
    if (type !== ActionItemType.seo_content_brief || !entityId) {
      throw new AppException(
        'SEO_AGENT_BRIEF_ACTION_NOT_FOUND',
        'SEO Agent content approval was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!this.seoContent) {
      throw new AppException(
        'SEO_AGENT_BRIEF_ACTION_UNAVAILABLE',
        'SEO content approval is not available right now.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const brief = await this.tenantPrisma.client.seoContentBrief.findFirst({
      where: {
        id: entityId,
        businessId,
        briefSource: 'specialist_agent',
        status: SeoContentBriefStatus.approval_required,
      },
      select: { id: true },
    });
    if (!brief) {
      throw new AppException(
        'SEO_AGENT_BRIEF_ACTION_NOT_FOUND',
        'This SEO Agent content draft is no longer waiting for review.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.seoContent.transition(
      businessId,
      actorUserId,
      brief.id,
      decision === 'approve'
        ? SeoContentBriefStatus.approved
        : SeoContentBriefStatus.drafting,
      reason,
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
    if (type === ActionItemType.procurement_request) {
      throw new AppException(
        'PROCUREMENT_ACTION_REQUIRES_DECISION',
        'Purchase requests must be approved or rejected; they cannot be dismissed or snoozed.',
        HttpStatus.CONFLICT,
      );
    }
    if (type === ActionItemType.inventory_transfer_approval) {
      throw new AppException(
        'INVENTORY_TRANSFER_REQUIRES_DECISION',
        'Inventory Agent transfer drafts must be approved or rejected through the canonical stock-transfer action.',
        HttpStatus.CONFLICT,
      );
    }
    if (type === ActionItemType.finance_journal) {
      throw new AppException(
        'FINANCE_JOURNAL_REQUIRES_DECISION',
        'Finance journals must be approved or rejected with a reason; they cannot be dismissed or snoozed.',
        HttpStatus.CONFLICT,
      );
    }
    if (type === ActionItemType.seo_content_brief) {
      throw new AppException(
        'SEO_AGENT_BRIEF_REQUIRES_DECISION',
        'SEO Agent content drafts must be approved or sent back with a review note; they cannot be dismissed or snoozed.',
        HttpStatus.CONFLICT,
      );
    }
    if (type === ActionItemType.customer_segment) {
      throw new AppException(
        'CUSTOMER_SEGMENT_ACTION_REQUIRES_DECISION',
        'Review the exact segment proposal, then approve, reject or withdraw it. It cannot be dismissed or snoozed.',
        HttpStatus.CONFLICT,
      );
    }
    if (type === ActionItemType.customer_follow_up) {
      throw new AppException(
        'CUSTOMER_FOLLOW_UP_REQUIRES_CRM_ACTION',
        'Customer follow-up tasks must be completed through their assigned-task action; they cannot be dismissed.',
        HttpStatus.CONFLICT,
      );
    }
    if (
      type === ActionItemType.commerce &&
      (entityId.startsWith('agent_tool_award:') ||
        entityId.startsWith('agent_tool_supplier_claim:'))
    ) {
      throw new AppException(
        'COMMERCE_AGENT_APPROVAL_REQUIRES_DECISION',
        entityId.startsWith('agent_tool_supplier_claim:')
          ? 'Commerce Agent supplier claims must be approved or rejected through the canonical agent approval action.'
          : 'Commerce Agent quote awards must be approved or rejected through the canonical agent approval action.',
        HttpStatus.CONFLICT,
      );
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
    viewerUserId?: string,
  ): Promise<RawActionItem[]> {
    // Staff see complaints and customer follow-ups assigned to their active business membership.
    if (role === Role.staff) {
      const [complaints, customerFollowUps] = await Promise.all([
        this.complaintItems(businessId, businessUserId),
        this.customerFollowUpItems(businessId, businessUserId),
      ]);
      return [...complaints, ...customerFollowUps];
    }

    const [
      complaints,
      lowStock,
      overdueCredit,
      unrepliedReviews,
      commerce,
      procurementRequests,
      customerSegments,
      customerFollowUps,
      inventoryTransfers,
      financeJournals,
      seoContentBriefs,
    ] = await Promise.all([
      this.complaintItems(businessId, null),
      this.lowStockItems(businessId),
      this.overdueCreditItems(businessId),
      this.unrepliedReviewItems(businessId),
      this.commerceItems(businessId, viewerUserId),
      this.procurementRequestItems(businessId),
      this.customerSegmentItems(businessId),
      this.customerFollowUpItems(businessId, null),
      this.inventoryAgentTransferItems(businessId),
      this.financeJournalItems(businessId, viewerUserId),
      this.seoAgentContentBriefItems(businessId),
    ]);
    return [
      ...complaints,
      ...lowStock,
      ...overdueCredit,
      ...unrepliedReviews,
      ...commerce,
      ...procurementRequests,
      ...customerSegments,
      ...customerFollowUps,
      ...inventoryTransfers,
      ...financeJournals,
      ...seoContentBriefs,
    ];
  }

  private async seoAgentContentBriefItems(
    businessId: string,
  ): Promise<RawActionItem[]> {
    const db = this.tenantPrisma.client;
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business?.parentId
        ? business.parent?.disabledModules
        : business?.disabledModules,
    );
    if (disabled.includes('marketing')) return [];
    const briefs = await db.seoContentBrief.findMany({
      where: {
        businessId,
        briefSource: 'specialist_agent',
        status: SeoContentBriefStatus.approval_required,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, topic: true, keywordText: true, updatedAt: true },
    });
    return briefs.map((brief) => ({
      type: ActionItemType.seo_content_brief,
      entityId: brief.id,
      priority: ActionItemPriority.normal,
      title: `SEO Agent · content draft: ${brief.topic}`,
      reason: `${brief.keywordText ? `Tracked keyword: ${brief.keywordText} · ` : ''}Review the draft and approve it or send it back. Approval does not publish to the website.`,
      occurredAt: brief.updatedAt,
      deepLink: '/marketing/seo-autopilot/content',
      approvalAction: 'seo_content_brief',
    }));
  }

  private async financeJournalItems(
    businessId: string,
    viewerUserId?: string,
  ): Promise<RawActionItem[]> {
    if (!this.financeJournals) return [];
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business?.parentId
        ? business.parent?.disabledModules
        : business?.disabledModules,
    );
    if (disabled.includes('profit')) return [];
    const entries = await this.financeJournals.pendingApprovalItems(businessId);
    return entries.map((entry) => ({
      type: ActionItemType.finance_journal,
      entityId: entry.id,
      priority: ActionItemPriority.normal,
      title: `Finance journal · ${entry.reference}`,
      reason: `${entry.currencyCode} ${entry.total} · ${entry.entryDate.toISOString().slice(0, 10)}`,
      occurredAt: entry.submittedAt ?? entry.entryDate,
      deepLink: `/profit/journals?entryId=${encodeURIComponent(entry.id)}`,
      approvalAction: 'finance_journal',
      canDecide: entry.createdByUserId !== viewerUserId,
    }));
  }

  private async inventoryAgentTransferItems(
    businessId: string,
  ): Promise<RawActionItem[]> {
    const db = this.tenantPrisma.client;
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business?.parentId
        ? business.parent?.disabledModules
        : business?.disabledModules,
    );
    if (disabled.includes('inventory') || disabled.includes('branches')) {
      return [];
    }

    // Stock transfers span branch businesses, so the model is intentionally not tenant-extended.
    // This query uses an explicit source-business predicate and only selects Inventory Agent rows.
    const transfers = await db.stockTransfer.findMany({
      where: {
        sourceBusinessId: businessId,
        status: StockTransferStatus.pending,
        sourceSpecialistAgentRecommendation: {
          is: { agentKey: 'inventory_intelligence' },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        createdAt: true,
        destBusiness: { select: { name: true } },
        sourceSpecialistAgentRecommendation: {
          select: { title: true },
        },
        items: { select: { qty: true } },
      },
    });

    return transfers.map((transfer) => ({
      type: ActionItemType.inventory_transfer_approval,
      entityId: transfer.id,
      priority: ActionItemPriority.normal,
      title: `Inventory Agent · Branch transfer to ${transfer.destBusiness.name}`,
      reason: `${transfer.items.length} line(s) · Recommendation: ${transfer.sourceSpecialistAgentRecommendation?.title ?? 'Inventory review'}`,
      occurredAt: transfer.createdAt,
      deepLink: '/branches/transfers',
      approvalAction: 'inventory_branch_transfer',
      canDecide: true,
    }));
  }

  private async customerFollowUpItems(
    businessId: string,
    assignedToOnly: string | null,
  ): Promise<RawActionItem[]> {
    const db = this.tenantPrisma.client;
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business?.parentId
        ? business.parent?.disabledModules
        : business?.disabledModules,
    );
    if (disabled.includes('customers')) return [];
    const rows = await db.customerFollowUpTask.findMany({
      where: {
        businessId,
        status: 'open',
        ...(assignedToOnly ? { assigneeStaffId: assignedToOnly } : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        customerId: true,
        title: true,
        reason: true,
        priority: true,
        assigneeStaffId: true,
        dueAt: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      type: ActionItemType.customer_follow_up,
      entityId: row.id,
      priority: row.priority,
      title: `${row.title} · ${row.customer.name}`,
      reason: row.reason,
      occurredAt: row.createdAt,
      dueAt: row.dueAt,
      deepLink: `/customers/${row.customerId}`,
      assigneeStaffId: row.assigneeStaffId,
    }));
  }

  private async customerSegmentItems(
    businessId: string,
  ): Promise<RawActionItem[]> {
    const db = this.tenantPrisma.client;
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    if (
      parseDisabled(
        business?.parentId
          ? business.parent?.disabledModules
          : business?.disabledModules,
      ).includes('customers')
    )
      return [];
    const rows = await db.specialistAgentRecommendation.findMany({
      where: {
        businessId,
        agentKey: 'customer_intelligence',
        status: 'segment_submitted',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, title: true, createdAt: true, details: true },
    });
    return rows.map((row) => ({
      type: ActionItemType.customer_segment,
      entityId: row.id,
      priority: ActionItemPriority.normal,
      title: `Customer segment approval · ${row.title}`,
      reason:
        'Review the submitted rule version, live match counts and consent exclusions. Approval saves a Segment only; it does not send messages.',
      occurredAt: row.createdAt,
      deepLink: `/customers/segments#segment-draft-${row.id}`,
    }));
  }

  private async procurementRequestItems(
    businessId: string,
  ): Promise<RawActionItem[]> {
    const db = this.tenantPrisma.client;
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business?.parentId
        ? business.parent?.disabledModules
        : business?.disabledModules,
    );
    if (disabled.includes('procurement')) return [];

    const requests = await db.procurementRequest.findMany({
      where: { businessId, status: 'submitted' },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        reason: true,
        urgency: true,
        currency: true,
        createdAt: true,
        submittedAt: true,
        requester: { select: { name: true } },
        items: {
          select: { quantity: true, estimatedUnitCost: true },
        },
      },
    });

    return requests.map((request) => {
      const estimate = request.items.reduce(
        (sum, item) =>
          sum + Number(item.quantity) * Number(item.estimatedUnitCost),
        0,
      );
      return {
        type: ActionItemType.procurement_request,
        entityId: request.id,
        priority:
          request.urgency === 'urgent'
            ? ActionItemPriority.urgent
            : request.urgency === 'low'
              ? ActionItemPriority.low
              : ActionItemPriority.normal,
        title: `Purchase request from ${request.requester.name}`,
        reason: `${request.items.length} line(s) · ${estimate.toFixed(2)} ${request.currency} · ${request.reason}`,
        occurredAt: request.submittedAt ?? request.createdAt,
        deepLink: `/procurement/requests#request-${request.id}`,
      };
    });
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

  /**
   * Autonomous Commerce work waiting on a person, from the commerce records themselves: listings
   * awaiting approval, experiments awaiting a decision, open high-severity risk cases, work orders on
   * quality hold and subscription renewals that are due. Hidden when the business turned the
   * Autonomous Commerce module off.
   */
  private async commerceItems(
    businessId: string,
    viewerUserId?: string,
  ): Promise<RawActionItem[]> {
    const db = this.tenantPrisma.client;
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business?.parentId
        ? business.parent?.disabledModules
        : business?.disabledModules,
    );
    if (disabled.includes('autonomous-commerce')) return [];
    const now = new Date();
    const [drafts, experiments, risks, holds, renewals] = await Promise.all([
      db.commerceListingDraft.findMany({
        where: {
          businessId,
          status: CommerceListingDraftStatus.review_required,
        },
        select: {
          id: true,
          channel: true,
          updatedAt: true,
          product: { select: { name: true } },
        },
        take: 100,
      }),
      db.commerceExperiment.findMany({
        where: { businessId, status: CommerceExperimentStatus.stopped },
        select: { id: true, name: true, stoppedAt: true, updatedAt: true },
        take: 100,
      }),
      db.commerceRiskCase.findMany({
        where: {
          businessId,
          severity: CommerceRiskSeverity.high,
          status: {
            in: [
              CommerceRiskCaseStatus.open,
              CommerceRiskCaseStatus.investigating,
            ],
          },
        },
        select: {
          id: true,
          ruleKey: true,
          entityLabel: true,
          firstDetectedAt: true,
        },
        take: 100,
      }),
      db.commerceWorkOrder.findMany({
        where: { businessId, status: CommerceWorkOrderStatus.quality_hold },
        select: {
          id: true,
          qtyPlanned: true,
          updatedAt: true,
          product: { select: { name: true } },
        },
        take: 100,
      }),
      db.commerceSubscription.findMany({
        where: {
          businessId,
          status: CommerceSubscriptionStatus.active,
          nextRenewalAt: { lte: now },
        },
        select: {
          id: true,
          nextRenewalAt: true,
          customer: { select: { name: true } },
        },
        take: 100,
      }),
    ]);
    const agentApprovals = await db.commerceAgentToolRun.findMany({
      where: {
        businessId,
        toolKey: { in: ['award_rfq_quote', 'submit_supplier_claim'] },
        outcome: 'pending_approval',
        actorUserId: { not: null },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        toolKey: true,
        actorUserId: true,
        createdAt: true,
      },
    });
    const item = (
      kind: string,
      id: string,
      priority: ActionItemPriority,
      title: string,
      reason: string,
      occurredAt: Date,
      deepLink: string,
    ): RawActionItem => ({
      type: ActionItemType.commerce,
      entityId: `${kind}:${id}`,
      priority,
      title,
      reason,
      occurredAt,
      deepLink,
    });
    return [
      ...drafts.map((row) =>
        item(
          'listing_draft',
          row.id,
          ActionItemPriority.normal,
          `Approve listing: ${row.product.name}`,
          `${row.channel} draft is waiting for review`,
          row.updatedAt,
          '/autonomous-commerce/listing-builder',
        ),
      ),
      ...experiments.map((row) =>
        item(
          'experiment',
          row.id,
          ActionItemPriority.normal,
          `Decide experiment: ${row.name}`,
          'Stopped — results frozen, waiting for adopt / revert / inconclusive',
          row.stoppedAt ?? row.updatedAt,
          '/autonomous-commerce/experiment-lab',
        ),
      ),
      ...risks.map((row) =>
        item(
          'risk_case',
          row.id,
          ActionItemPriority.urgent,
          `High-risk case: ${row.entityLabel}`,
          `Open high-severity ${row.ruleKey.replaceAll('_', ' ')} case`,
          row.firstDetectedAt,
          '/autonomous-commerce/risk-compliance',
        ),
      ),
      ...holds.map((row) =>
        item(
          'quality_hold',
          row.id,
          ActionItemPriority.urgent,
          `Quality hold: ${row.qtyPlanned} × ${row.product.name}`,
          'Finished goods are held and cannot be sold until released',
          row.updatedAt,
          '/autonomous-commerce/production',
        ),
      ),
      ...renewals.map((row) =>
        item(
          'renewal',
          row.id,
          ActionItemPriority.normal,
          `Renewal due: ${row.customer.name}`,
          `Subscription renewal was due ${row.nextRenewalAt.toISOString().slice(0, 10)}`,
          row.nextRenewalAt,
          '/autonomous-commerce/subscriptions-preorders',
        ),
      ),
      ...agentApprovals.map((run) => {
        const isSupplierClaim = run.toolKey === 'submit_supplier_claim';
        return {
          type: ActionItemType.commerce,
          entityId: `${isSupplierClaim ? 'agent_tool_supplier_claim' : 'agent_tool_award'}:${run.id}`,
          priority: ActionItemPriority.normal,
          title: isSupplierClaim
            ? 'Commerce Agent · supplier claim needs approval'
            : 'Commerce Agent · RFQ quote award needs approval',
          reason: isSupplierClaim
            ? 'A second authorized user must review this claim submission. Approval marks it submitted for follow-up; it does not contact the supplier.'
            : 'A second authorized user must review the exact quote award request. Approval creates a draft purchase order only.',
          occurredAt: run.createdAt,
          deepLink: `/autonomous-commerce/agent-tools#run-${run.id}`,
          approvalAction: isSupplierClaim
            ? ('commerce_supplier_claim' as const)
            : ('commerce_rfq_award' as const),
          canDecide: run.actorUserId !== viewerUserId,
        };
      }),
    ];
  }
}
