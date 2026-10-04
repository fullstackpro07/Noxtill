import { HttpStatus, Injectable } from '@nestjs/common';
import { PayDispute } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, num } from './pay-context.service';
import { PayApprovalsService } from './pay-approvals.service';
import { PayIdempotencyService } from './pay-idempotency.service';
import { PayStripeService } from './pay-stripe.service';
import { PayAiService } from './pay-ai.service';
import { ProviderTimeoutError } from './providers/stripe.transport';
import { DISPUTE_OPEN, PAY_ERRORS } from './payments.constants';

interface Candidate {
  module: string;
  entityType: string;
  entityId: string;
  entityRef: string;
  label: string;
  field: string;
  content: string;
}

/**
 * Provider disputes (chargebacks). Evidence can only reference records that exist in Noxtill —
 * the order, a delivery with proof, the customer's conversation, the payment receipt, the
 * membership, a refund — and every item is existence-checked when it is added. AI may draft the
 * response from those facts; it never invents evidence and never submits.
 */
@Injectable()
export class PayDisputesService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly stripe: PayStripeService,
    private readonly approvals: PayApprovalsService,
    private readonly idem: PayIdempotencyService,
    private readonly ai: PayAiService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const d = await this.db.payDispute.findFirst({
      where: { id, businessId: rootId },
    });
    if (!d)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Dispute not found',
        HttpStatus.NOT_FOUND,
      );
    return d;
  }

  /** Real Noxtill records that could support this dispute. */
  async candidates(rootId: string, d: PayDispute): Promise<Candidate[]> {
    const out: Candidate[] = [];
    const tx = d.txId
      ? await this.db.payTransaction.findUnique({ where: { id: d.txId } })
      : null;
    if (tx)
      out.push({
        module: 'Payments & Billing',
        entityType: 'Payment transaction',
        entityId: tx.id,
        entityRef: tx.number,
        label: `Charge receipt ${tx.number} · ${tx.methodBrand ?? tx.method}${tx.methodLast4 ? ` ••••${tx.methodLast4}` : ''}`,
        field: 'uncategorized_text',
        content: `Payment ${tx.number} of ${num(tx.amount).toFixed(2)} ${tx.currency} on ${tx.occurredAt.toISOString().slice(0, 10)} via ${tx.channel}, ${tx.methodBrand ?? tx.method}${tx.methodLast4 ? ` ending ${tx.methodLast4}` : ''}.`,
      });
    const orderId =
      tx?.orderId ??
      (tx?.requestId
        ? (await this.db.payRequest.findUnique({ where: { id: tx.requestId } }))
            ?.linkId
        : null) ??
      null;
    const order = orderId
      ? await this.db.order
          .findUnique({
            where: { id: orderId },
            include: { items: { select: { qty: true, name: true } } },
          })
          .catch(() => null)
      : null;
    if (order) {
      out.push({
        module: 'Orders',
        entityType: 'Order',
        entityId: order.id,
        entityRef: `#${order.orderNo}`,
        label: `Order #${order.orderNo} · ${order.status}`,
        field: 'product_description',
        content: `Order #${order.orderNo} (${order.status}) placed ${order.createdAt.toISOString().slice(0, 10)}: ${order.items
          .map((i) => `${i.qty}× ${i.name}`)
          .join(', ')
          .slice(0, 400)}. Total ${num(order.total).toFixed(2)}.`,
      });
      const del = await this.db.delivery.findFirst({
        where: { orderId: order.id },
      });
      if (del && (del.deliveredAt || del.proofAt))
        out.push({
          module: 'Delivery & Riders',
          entityType: 'Delivery proof',
          entityId: del.id,
          entityRef: `Delivery ${del.id.slice(0, 8)}`,
          label: `Proof of delivery${del.proofSignatureKey ? ' (signature' : ''}${del.proofPhotoKey ? (del.proofSignatureKey ? ' + photo)' : ' (photo)') : del.proofSignatureKey ? ')' : ''} · ${(del.deliveredAt ?? del.proofAt)!.toISOString().slice(0, 10)}`,
          field: 'shipping_date',
          content: `Delivered ${(del.deliveredAt ?? del.proofAt)!.toISOString().slice(0, 10)} to ${del.addressLine ?? 'the customer address'}${del.proofLat ? ` (GPS ${num(del.proofLat)}, ${num(del.proofLng)})` : ''}${del.proofSignatureKey ? ', signature captured' : ''}${del.proofPhotoKey ? ', photo captured' : ''}.`,
        });
    }
    if (tx?.customerId) {
      const conv = await this.db.inboxConversation.findFirst({
        where: { customerId: tx.customerId },
        orderBy: { lastMessageAt: 'desc' },
      });
      if (conv)
        out.push({
          module: 'Unified Inbox',
          entityType: 'Conversation',
          entityId: conv.id,
          entityRef: `${conv.channel} conversation`,
          label: `${conv.channel} conversation with ${conv.contactName ?? 'the customer'} · last ${conv.lastMessageAt?.toISOString().slice(0, 10) ?? '—'}`,
          field: 'customer_communication_text',
          content: `Customer conversation on ${conv.channel}${conv.lastMessagePreview ? `; latest message: "${conv.lastMessagePreview.slice(0, 200)}"` : ''}.`,
        });
      const prior = await this.db.payTransaction.count({
        where: {
          businessId: rootId,
          customerId: tx.customerId,
          status: 'Succeeded',
          id: { not: tx.id },
        },
      });
      if (prior)
        out.push({
          module: 'Payments & Billing',
          entityType: 'Customer history',
          entityId: tx.customerId,
          entityRef: `${prior} prior payments`,
          label: `Customer paid successfully ${prior} other time(s) without dispute`,
          field: 'uncategorized_text',
          content: `The same customer completed ${prior} other successful payment(s) with this business.`,
        });
      const mem = await this.db.membership.findFirst({
        where: { customerId: tx.customerId },
        include: { plan: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      if (mem)
        out.push({
          module: 'Customers',
          entityType: 'Membership',
          entityId: mem.id,
          entityRef: mem.plan.name,
          label: `Membership ${mem.plan.name} · ${mem.status}`,
          field: 'cancellation_rebuttal',
          content: `Membership "${mem.plan.name}" status ${mem.status}${mem.currentPeriodEnd ? `, paid through ${mem.currentPeriodEnd.toISOString().slice(0, 10)}` : ''}.`,
        });
    }
    if (tx) {
      const rf = await this.db.payRefund.findFirst({
        where: { txId: tx.id },
        orderBy: { createdAt: 'desc' },
      });
      if (rf)
        out.push({
          module: 'Payments & Billing',
          entityType: 'Refund',
          entityId: rf.id,
          entityRef: rf.number,
          label: `Refund ${rf.number} · ${num(rf.amount).toFixed(2)} ${rf.currency} · ${rf.status}`,
          field: 'refund_refusal_explanation',
          content: `Refund ${rf.number} of ${num(rf.amount).toFixed(2)} ${rf.currency} is ${rf.status}.`,
        });
    }
    return out;
  }

  /** What a strong response needs for this reason, matched against the records that exist. */
  async seedEvidence(rootId: string, d: PayDispute) {
    if (await this.db.payDisputeEvidence.count({ where: { disputeId: d.id } }))
      return;
    const cands = await this.candidates(rootId, d);
    const r = d.reason.toLowerCase();
    const need: [string, string, 'Required' | 'Recommended'][] = r.includes(
      'not received',
    )
      ? [
          ['Order', 'Order record', 'Required'],
          ['Delivery proof', 'Proof of delivery', 'Required'],
          ['Conversation', 'Customer conversation', 'Recommended'],
          ['Payment transaction', 'Charge receipt', 'Required'],
        ]
      : r.includes('fraud')
        ? [
            ['Order', 'Order record', 'Required'],
            [
              'Payment transaction',
              'Charge receipt with card details',
              'Required',
            ],
            ['Customer history', 'Prior successful payments', 'Recommended'],
          ]
        : r.includes('duplicate')
          ? [
              [
                'Payment transaction',
                'Both charges with distinct orders',
                'Required',
              ],
              ['Order', 'Separate order record', 'Required'],
            ]
          : r.includes('subscription')
            ? [
                ['Membership', 'Membership record', 'Required'],
                ['Conversation', 'Customer conversation', 'Recommended'],
              ]
            : r.includes('credit not processed')
              ? [
                  ['Refund', 'Refund record', 'Required'],
                  ['Order', 'Order record', 'Required'],
                ]
              : [
                  ['Order', 'Order record', 'Required'],
                  ['Payment transaction', 'Charge receipt', 'Required'],
                  ['Conversation', 'Customer conversation', 'Recommended'],
                ];
    for (const [type, label, req] of need) {
      const c = cands.find((x) => x.entityType === type);
      await this.db.payDisputeEvidence.create({
        data: {
          businessId: rootId,
          disputeId: d.id,
          module: c?.module ?? '—',
          entityType: type,
          entityId: c?.entityId ?? '',
          entityRef: c?.entityRef ?? '—',
          label: c ? c.label : `${label} — no source record found in Noxtill`,
          requirement: req,
          status: c ? 'Added' : 'Missing',
          field: c?.field ?? null,
          content: c?.content ?? null,
          addedById: c ? 'System' : null,
          addedAt: c ? new Date() : null,
        },
      });
    }
  }

  async addEvidence(a: PayActor, id: string, keys: string[]) {
    this.ctx.need(a, 'dispute', 'Adding dispute evidence');
    const d = await this.must(a.rootId, id);
    if (!['Needs Response', 'Warning'].includes(d.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `This dispute is ${d.status} — evidence can’t change now.`,
        HttpStatus.CONFLICT,
      );
    const cands = await this.candidates(a.rootId, d);
    const ev = await this.db.payDisputeEvidence.findMany({
      where: { disputeId: d.id },
    });
    let added = 0;
    for (const k of keys) {
      const c = cands.find((x) => `${x.entityType}:${x.entityId}` === k);
      if (!c) continue; // only records that exist right now
      const slot = ev.find(
        (e) => e.entityType === c.entityType && e.status === 'Missing',
      );
      if (slot)
        await this.db.payDisputeEvidence.update({
          where: { id: slot.id },
          data: {
            module: c.module,
            entityId: c.entityId,
            entityRef: c.entityRef,
            label: c.label,
            status: 'Added',
            field: c.field,
            content: c.content,
            addedById: a.userId,
            addedAt: new Date(),
          },
        });
      else if (
        !ev.some(
          (e) => e.entityType === c.entityType && e.entityId === c.entityId,
        )
      )
        await this.db.payDisputeEvidence.create({
          data: {
            businessId: a.rootId,
            disputeId: d.id,
            module: c.module,
            entityType: c.entityType,
            entityId: c.entityId,
            entityRef: c.entityRef,
            label: c.label,
            requirement: 'Recommended',
            status: 'Added',
            field: c.field,
            content: c.content,
            addedById: a.userId,
            addedAt: new Date(),
          },
        });
      added++;
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Dispute evidence added',
      'dispute',
      d.id,
      `${added} record(s)`,
    );
    return added;
  }

  async draft(a: PayActor, id: string) {
    this.ctx.need(a, 'dispute', 'Drafting a dispute response');
    const d = await this.must(a.rootId, id);
    const ev = await this.db.payDisputeEvidence.findMany({
      where: { disputeId: d.id, status: { not: 'Missing' } },
    });
    const res = await this.ai.disputeDraft(a.rootId, [
      `Dispute reason: ${d.reason}`,
      `Amount: ${num(d.amount).toFixed(2)} ${d.currency}`,
      ...ev.map((e) => e.content ?? e.label),
    ]);
    await this.db.payDispute.update({
      where: { id: d.id },
      data: {
        draft: `${res.text}\n\n— ${res.source === 'AI' ? 'Drafted by AI from the evidence above. Review before submitting.' : 'Built from the evidence above (AI unavailable).'}`,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Dispute response drafted',
      'dispute',
      d.id,
      res.source,
    );
    return res;
  }

  private async evidencePayload(
    rootId: string,
    d: PayDispute,
    response: string,
  ) {
    const ev = await this.db.payDisputeEvidence.findMany({
      where: { disputeId: d.id, status: { not: 'Missing' } },
    });
    const tx = d.txId
      ? await this.db.payTransaction.findUnique({ where: { id: d.txId } })
      : null;
    const cust = tx?.customerId
      ? await this.db.customer.findUnique({
          where: { id: tx.customerId },
          select: { name: true, email: true },
        })
      : null;
    const pick = (f: string) =>
      ev
        .filter((e) => e.field === f)
        .map((e) => e.content)
        .filter(Boolean)
        .join(' ');
    const out: Record<string, string> = {};
    if (cust?.name) out.customer_name = cust.name;
    if (cust?.email) out.customer_email_address = cust.email;
    if (pick('product_description'))
      out.product_description = pick('product_description').slice(0, 1500);
    if (pick('cancellation_rebuttal'))
      out.cancellation_rebuttal = pick('cancellation_rebuttal').slice(0, 1500);
    if (pick('refund_refusal_explanation'))
      out.refund_refusal_explanation = pick('refund_refusal_explanation').slice(
        0,
        1500,
      );
    const del = ev.find((e) => e.entityType === 'Delivery proof');
    if (del) {
      const row = await this.db.delivery.findUnique({
        where: { id: del.entityId },
      });
      if (row?.deliveredAt)
        out.shipping_date = row.deliveredAt.toISOString().slice(0, 10);
      if (row?.addressLine)
        out.shipping_address = row.addressLine.slice(0, 300);
    }
    out.uncategorized_text = [
      response,
      ...ev
        .filter((e) =>
          [
            'uncategorized_text',
            'customer_communication_text',
            'shipping_date',
          ].includes(e.field ?? ''),
        )
        .map((e) => e.content),
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 19000);
    return out;
  }

  async submit(
    a: PayActor,
    id: string,
    response: string,
    acceptWeaker: boolean,
  ) {
    this.ctx.need(a, 'dispute', 'Submitting a dispute response');
    const d = await this.must(a.rootId, id);
    if (!['Needs Response', 'Warning'].includes(d.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `This dispute is ${d.status}.`,
        HttpStatus.CONFLICT,
      );
    if (!response.trim())
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Write the final response.',
        HttpStatus.BAD_REQUEST,
      );
    const missing = await this.db.payDisputeEvidence.count({
      where: { disputeId: d.id, requirement: 'Required', status: 'Missing' },
    });
    if (missing && !acceptWeaker)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `${missing} required evidence item(s) are missing. Add them or confirm you accept the weaker case.`,
        HttpStatus.BAD_REQUEST,
      );
    const pol = await this.ctx.policy(a.rootId);
    if (num(d.amount) > pol.disputes.submitApprovalAbove && !a.approve) {
      await this.db.payDispute.update({
        where: { id: d.id },
        data: { status: 'Approval Required', response },
      });
      const ap = await this.approvals.request(a.rootId, a, {
        kind: 'dispute',
        subjectId: d.id,
        title: `Dispute response · ${num(d.amount).toFixed(2)} ${d.currency} · ${d.reason}`,
        amount: num(d.amount),
        rule: `Dispute responses above ${pol.disputes.submitApprovalAbove} need the Owner (Payments › Settings › Disputes)`,
        payload: { acceptWeaker },
      });
      await this.db.payDispute.update({
        where: { id: d.id },
        data: { approvalId: ap.id },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Dispute response sent for approval',
        'dispute',
        d.id,
        d.providerDisputeId,
      );
      return { status: 'Approval Required' };
    }
    return this.send(a, d, response);
  }

  async approveSubmission(a: PayActor, id: string) {
    const d = await this.must(a.rootId, id);
    if (d.status !== 'Approval Required')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `This dispute is ${d.status}.`,
        HttpStatus.CONFLICT,
      );
    const ap = await this.approvals.pending(a.rootId, 'dispute', d.id);
    if (ap) await this.approvals.decide(a, ap.id, true);
    else this.ctx.need(a, 'approve', 'Approving a dispute response');
    return this.send(a, { ...d, status: 'Needs Response' }, d.response ?? '');
  }

  private async send(a: PayActor, d: PayDispute, response: string) {
    const conn = await this.db.payConnection.findUnique({
      where: { id: d.connectionId },
    });
    this.stripe.assertCan(conn, 'stripe', 'supportsDisputesAPI');
    const key = `dispute:${d.id}:submit`;
    const { replay } = await this.idem.begin(a.rootId, key, 'dispute_submit', {
      dispute: d.providerDisputeId,
    });
    if (replay)
      throw new AppException(
        PAY_ERRORS.IDEMPOTENT_REPLAY,
        'This response was already submitted — providers accept one response.',
        HttpStatus.CONFLICT,
      );
    try {
      const out = await this.stripe.disputeUpdate(
        conn!,
        d.providerDisputeId,
        await this.evidencePayload(a.rootId, d, response),
        true,
        key,
      );
      await this.idem.finish(key, 'done', { status: out.status }, out.id);
      await this.db.payDispute.update({
        where: { id: d.id },
        data: { status: 'Under Review', submittedAt: new Date(), response },
      });
      await this.db.payDisputeEvidence.updateMany({
        where: { disputeId: d.id, status: 'Added' },
        data: { status: 'Submitted' },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Dispute response submitted',
        'dispute',
        d.id,
        `${d.providerDisputeId} → ${out.status}`,
      );
      return { status: 'Under Review' };
    } catch (e) {
      await this.idem.finish(
        key,
        e instanceof ProviderTimeoutError ? 'unknown' : 'failed',
        { error: (e as Error).message },
      );
      throw new AppException(
        PAY_ERRORS.PROVIDER_ERROR,
        `Stripe didn’t accept the response: ${(e as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async accept(a: PayActor, id: string, reason: string) {
    this.ctx.need(a, 'dispute', 'Accepting a dispute');
    const d = await this.must(a.rootId, id);
    if (!['Needs Response', 'Warning', 'Approval Required'].includes(d.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `This dispute is ${d.status}.`,
        HttpStatus.CONFLICT,
      );
    const conn = await this.db.payConnection.findUnique({
      where: { id: d.connectionId },
    });
    this.stripe.assertCan(conn, 'stripe', 'supportsDisputesAPI');
    const key = `dispute:${d.id}:close`;
    await this.idem.begin(a.rootId, key, 'dispute_close', {
      dispute: d.providerDisputeId,
    });
    try {
      await this.stripe.disputeClose(conn!, d.providerDisputeId, key);
      await this.idem.finish(key, 'done');
    } catch (e) {
      await this.idem.finish(key, 'failed', { error: (e as Error).message });
      throw new AppException(
        PAY_ERRORS.PROVIDER_ERROR,
        `Stripe didn’t close the dispute: ${(e as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    await this.db.payDispute.update({
      where: { id: d.id },
      data: { status: 'Accepted (lost)', outcome: 'Accepted' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Dispute accepted',
      'dispute',
      d.id,
      reason,
    );
  }

  async assign(a: PayActor, id: string, userId: string) {
    this.ctx.need(a, 'dispute', 'Assigning a dispute');
    const d = await this.must(a.rootId, id);
    const members = await this.ctx.members(a.rootId);
    const who = members.find((m) => m.id === userId);
    if (!who)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Pick a team member.',
        HttpStatus.BAD_REQUEST,
      );
    await this.db.payDispute.update({
      where: { id: d.id },
      data: { ownerId: userId },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Dispute assigned',
      'dispute',
      d.id,
      who.name,
    );
  }

  isOpen(d: PayDispute) {
    return DISPUTE_OPEN.includes(d.status);
  }
}
