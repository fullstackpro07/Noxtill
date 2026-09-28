import { HttpStatus, Injectable } from '@nestjs/common';
import { BrainAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PoliciesService } from '../common/policies/policies.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { CreditReminderService } from '../credit/credit-reminder.service';
import { PurchaseOrdersService } from '../inventory/purchase-orders.service';
import { DeadHoursOfferService } from '../profit/dead-hours-offer.service';
import { CAMPAIGN_TEMPLATE_KEY } from '../marketing/marketing.constants';
import {
  CAPABILITIES,
  SYSTEM_ROLE_CAPABILITIES,
} from '../common/capabilities/capabilities.constants';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BrainContextService, ScopeQuery } from './brain-context.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainDecisionsService } from './brain-decisions.service';
import { BRAIN_ERRORS } from './brain.constants';

export const ACTION_TYPE_LABEL: Record<string, string> = {
  credit_reminders: 'Credit reminders',
  reorder_draft: 'Draft purchase order',
  quiet_offer: 'Quiet-day offer',
  lapsed_followup: 'Follow-up to past buyers',
};

export function capabilityHolders(
  cap: string | null,
  customRoles: { name: string; capabilities: Prisma.JsonValue }[] = [],
): string {
  if (!cap) return 'Anyone';
  const system = (Object.keys(SYSTEM_ROLE_CAPABILITIES) as Role[])
    .filter((r) => (SYSTEM_ROLE_CAPABILITIES[r] as string[]).includes(cap))
    .map((r) => r.charAt(0).toUpperCase() + r.slice(1));
  const custom = customRoles
    .filter(
      (r) =>
        Array.isArray(r.capabilities) &&
        (r.capabilities as string[]).includes(cap),
    )
    .map((r) => r.name);
  const all = [...system, ...custom];
  return all.length === 1 ? `${all[0]} only` : all.join(' or ');
}

/**
 * Action Center. The Brain prepares; a person with the action's own capability approves; a person
 * runs it. Running reuses the module that owns the job (credit reminders, purchase orders, the
 * dead-hours offer, the send gate) — the Brain has no sending or ordering path of its own.
 */
@Injectable()
export class BrainActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PoliciesService,
    private readonly context: BrainContextService,
    private readonly detectors: BrainDetectorsService,
    private readonly decisions: BrainDecisionsService,
    private readonly sendGate: SendGateService,
    private readonly creditReminders: CreditReminderService,
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly deadHours: DeadHoursOfferService,
  ) {}

  private async actorName(userId: string) {
    return (
      (
        await this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        })
      )?.name ?? 'Someone'
    );
  }

  async list(user: AuthenticatedUser) {
    const [rows, customRoles] = await Promise.all([
      this.prisma.brainAction.findMany({
        where: { businessId: user.businessId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.customRole.findMany({
        where: { businessId: user.businessId },
        select: { name: true, capabilities: true },
      }),
    ]);
    const can = new Map<string, boolean>();
    for (const cap of new Set(
      rows.map((r) => r.requiredCapability).filter((c): c is string => !!c),
    ))
      can.set(cap, await this.policies.actorCan(cap));
    return rows.map((a) => ({
      id: a.id,
      type: a.type,
      typeLabel: ACTION_TYPE_LABEL[a.type] ?? a.type,
      findingKey: a.findingKey,
      title: a.title,
      detail: a.detail,
      body:
        typeof (a.payload as Record<string, unknown>)?.body === 'string'
          ? ((a.payload as Record<string, unknown>).body as string)
          : null,
      recipients: Array.isArray(
        (a.payload as Record<string, unknown>)?.customerIds,
      )
        ? ((a.payload as Record<string, unknown>).customerIds as string[])
            .length
        : null,
      status: a.status,
      blockedReason: a.blockedReason,
      result: a.result,
      perm: capabilityHolders(a.requiredCapability, customRoles),
      canApprove: a.requiredCapability
        ? (can.get(a.requiredCapability) ?? false)
        : true,
      preparedBy: a.preparedByName,
      approvedBy: a.approvedByName,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      executedAt: a.executedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private async find(
    user: AuthenticatedUser,
    id: string,
  ): Promise<BrainAction> {
    const a = await this.prisma.brainAction.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!a)
      throw new AppException(
        BRAIN_ERRORS.NOT_FOUND,
        'Action not found.',
        HttpStatus.NOT_FOUND,
      );
    return a;
  }

  /** Prepares the action a finding proposes. Re-reads the finding first, so the payload is current. */
  async prepare(user: AuthenticatedUser, findingKey: string, q: ScopeQuery) {
    const open = await this.prisma.brainAction.findFirst({
      where: {
        businessId: user.businessId,
        findingKey,
        status: { in: ['prepared', 'approved', 'blocked'] },
      },
    });
    if (open) return { id: open.id, existing: true };
    const ctx = await this.context.build(user, q);
    const reading = await this.detectors.read(ctx);
    const finding = reading.findings.find((f) => f.key === findingKey);
    if (!finding)
      throw new AppException(
        BRAIN_ERRORS.GONE,
        'That finding is no longer true, so there is nothing to prepare.',
        HttpStatus.CONFLICT,
      );
    if (!finding.action)
      throw new AppException(
        BRAIN_ERRORS.NO_ACTION,
        'This finding has no action Noxtill can prepare — follow the recommendation instead.',
        HttpStatus.BAD_REQUEST,
      );
    const p = finding.action;
    const payload: Record<string, unknown> = { ...p.payload };
    let detail = p.detail;
    if (p.type === 'quiet_offer') {
      try {
        const draft = await this.deadHours.generate();
        payload.body = draft.offerText;
        detail = `${p.detail} Drafted for ${draft.windowLabel || `${String(payload.weekday)}s`} — edit the wording before approving.`;
      } catch (error) {
        payload.body = `This ${String(payload.weekday)}, come and see us at ${ctx.business.name}.`;
        detail = `${p.detail} The AI draft could not be made (${(error as Error).message}), so a plain message was written instead — edit it before approving.`;
      }
    }
    if (p.type === 'reorder_draft' && payload.businessId !== user.businessId) {
      p.blockedReason =
        p.blockedReason ??
        'This product belongs to another branch. Switch to that branch to draft its purchase order.';
    }
    const name = await this.actorName(user.sub);
    const action = await this.prisma.brainAction.create({
      data: {
        businessId: user.businessId,
        findingKey,
        type: p.type,
        title: p.title,
        detail,
        payload: payload as Prisma.InputJsonValue,
        requiredCapability: p.capability,
        status: p.blockedReason ? 'blocked' : 'prepared',
        blockedReason: p.blockedReason ?? null,
        preparedByUserId: user.sub,
        preparedByName: name,
      },
    });
    await this.decisions.log(user.businessId, {
      findingKey,
      actionId: action.id,
      title: p.title,
      decision: 'prepared',
      actor: { id: user.sub, name },
    });
    return { id: action.id, existing: false };
  }

  async edit(user: AuthenticatedUser, id: string, body: string) {
    const a = await this.find(user, id);
    if (!['prepared', 'blocked'].includes(a.status))
      throw new AppException(
        BRAIN_ERRORS.WRONG_STATE,
        'Only an action that has not been approved can be edited.',
        HttpStatus.CONFLICT,
      );
    const payload = {
      ...(a.payload as Record<string, unknown>),
      body: body.trim(),
    };
    await this.prisma.brainAction.update({
      where: { id },
      data: { payload: payload },
    });
    return { ok: true };
  }

  private async assertCan(a: BrainAction) {
    if (
      a.requiredCapability &&
      !(await this.policies.actorCan(a.requiredCapability))
    ) {
      throw new AppException(
        BRAIN_ERRORS.NOT_ALLOWED,
        'You do not have the permission this action needs.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async approve(user: AuthenticatedUser, id: string) {
    const a = await this.find(user, id);
    if (a.status === 'blocked')
      throw new AppException(
        BRAIN_ERRORS.WRONG_STATE,
        a.blockedReason ?? 'This action is blocked.',
        HttpStatus.CONFLICT,
      );
    if (a.status !== 'prepared')
      throw new AppException(
        BRAIN_ERRORS.WRONG_STATE,
        'Only a prepared action can be approved.',
        HttpStatus.CONFLICT,
      );
    await this.assertCan(a);
    const name = await this.actorName(user.sub);
    await this.prisma.brainAction.update({
      where: { id },
      data: {
        status: 'approved',
        approvedByUserId: user.sub,
        approvedByName: name,
        approvedAt: new Date(),
      },
    });
    await this.decisions.log(user.businessId, {
      findingKey: a.findingKey,
      actionId: id,
      title: a.title,
      decision: 'approved',
      actor: { id: user.sub, name },
    });
    return { ok: true };
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const a = await this.find(user, id);
    if (!['prepared', 'approved', 'blocked'].includes(a.status))
      throw new AppException(
        BRAIN_ERRORS.WRONG_STATE,
        'This action has already finished.',
        HttpStatus.CONFLICT,
      );
    const name = await this.actorName(user.sub);
    await this.prisma.brainAction.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.decisions.log(user.businessId, {
      findingKey: a.findingKey,
      actionId: id,
      title: a.title,
      decision: 'cancelled',
      actor: { id: user.sub, name },
    });
    return { ok: true };
  }

  /** Runs an approved action through the module that owns the job. */
  async run(user: AuthenticatedUser, id: string) {
    const a = await this.find(user, id);
    if (a.status !== 'approved')
      throw new AppException(
        BRAIN_ERRORS.WRONG_STATE,
        'Approve the action before running it.',
        HttpStatus.CONFLICT,
      );
    await this.assertCan(a);
    const p = a.payload as Record<string, unknown>;
    const name = await this.actorName(user.sub);
    let result: string;
    try {
      if (a.type === 'credit_reminders') {
        const r = await this.creditReminders.bulkRemind(
          user.businessId,
          (p.customerIds as string[]) ?? [],
          'gentle',
        );
        result = `${r.sent} reminder${r.sent === 1 ? '' : 's'} queued${r.skipped ? `, ${r.skipped} skipped (opted out or nothing owed)` : ''}.`;
      } else if (a.type === 'reorder_draft') {
        if (!p.supplierId)
          throw new Error('No supplier is on record for this product.');
        const po = await this.purchaseOrders.create(user.businessId, user.sub, {
          supplierId: p.supplierId as string,
          note: 'Drafted by Business Brain',
          items: [
            {
              productId: p.productId as string,
              qty: Number(p.qty),
              unitCost: Number(p.unitCost),
            },
          ],
        });
        result = `Draft purchase order created (${(po as { id: string }).id.slice(0, 8)}). Nothing was sent to the supplier — send it from Inventory → Purchases.`;
      } else if (a.type === 'quiet_offer') {
        const campaign = await this.deadHours.send(
          typeof p.segment === 'string' ? p.segment : 'all',
          typeof p.body === 'string' ? p.body : '',
        );
        result = `Offer sent to ${campaign.sentCount} customer${campaign.sentCount === 1 ? '' : 's'}. It appears in Marketing → Campaigns.`;
      } else if (a.type === 'lapsed_followup') {
        result = await this.sendFollowup(
          user.businessId,
          (p.customerIds as string[]) ?? [],
          typeof p.body === 'string' ? p.body : '',
        );
      } else throw new Error(`Unknown action type ${a.type}`);
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      await this.prisma.brainAction.update({
        where: { id },
        data: { status: 'failed', result: message, executedAt: new Date() },
      });
      await this.decisions.log(user.businessId, {
        findingKey: a.findingKey,
        actionId: id,
        title: a.title,
        decision: 'failed',
        reason: message,
        actor: { id: user.sub, name },
      });
      throw new AppException(
        BRAIN_ERRORS.RUN_FAILED,
        message,
        HttpStatus.BAD_GATEWAY,
      );
    }
    await this.prisma.brainAction.update({
      where: { id },
      data: { status: 'done', result, executedAt: new Date() },
    });
    await this.decisions.log(user.businessId, {
      findingKey: a.findingKey,
      actionId: id,
      title: a.title,
      decision: 'ran',
      reason: result,
      actor: { id: user.sub, name },
    });
    return { result };
  }

  /** Same shape as the dead-hours offer: a real Campaign row plus one marketing message per reachable customer. */
  private async sendFollowup(
    businessId: string,
    customerIds: string[],
    body: string,
  ): Promise<string> {
    const customers = await this.prisma.customer.findMany({
      where: { businessId, id: { in: customerIds }, optedOut: false },
      select: { id: true, name: true },
    });
    if (!customers.length)
      throw new Error(
        'None of these customers can be messaged any more (opted out or removed).',
      );
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { msgQuota: true, msgUsed: true },
    });
    if (customers.length > business.msgQuota - business.msgUsed)
      throw new Error(
        `This needs ${customers.length} messages but only ${business.msgQuota - business.msgUsed} remain this month.`,
      );
    const campaign = await this.prisma.campaign.create({
      data: {
        businessId,
        segment: 'Business Brain: past buyers',
        templateKey: CAMPAIGN_TEMPLATE_KEY,
        body,
      },
    });
    let sent = 0;
    for (const c of customers) {
      await this.sendGate
        .send({
          businessId,
          customerId: c.id,
          templateKey: CAMPAIGN_TEMPLATE_KEY,
          variables: { body: body.replace(/{{\s*customerName\s*}}/g, c.name) },
          campaignId: campaign.id,
        })
        .then(() => {
          sent += 1;
        })
        .catch(() => undefined);
    }
    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { sentCount: sent },
    });
    return `${sent} of ${customers.length} messages queued${sent < customers.length ? ' (the rest were refused by your message limits)' : ''}. It appears in Marketing → Campaigns.`;
  }

  /** Blocked actions whose reason no longer holds (e.g. restocked) move back to prepared. */
  async refreshBlocked(user: AuthenticatedUser, q: ScopeQuery) {
    const blocked = await this.prisma.brainAction.findMany({
      where: { businessId: user.businessId, status: 'blocked' },
    });
    if (!blocked.length) return;
    const ctx = await this.context.build(user, q);
    const reading = await this.detectors.read(ctx);
    for (const a of blocked) {
      const f = reading.findings.find((g) => g.key === a.findingKey);
      if (f?.action && !f.action.blockedReason && a.type !== 'reorder_draft') {
        await this.prisma.brainAction.update({
          where: { id: a.id },
          data: { status: 'prepared', blockedReason: null },
        });
      }
    }
  }

  static readonly CAPS = CAPABILITIES;
}
