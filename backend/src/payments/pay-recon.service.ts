import { HttpStatus, Injectable } from '@nestjs/common';
import { PayReconItem, Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, num, r2 } from './pay-context.service';
import { PAY_ERRORS } from './payments.constants';

const DONE = ['Matched', 'Resolved', 'Ignored'];

/**
 * Provider reconciliation: what the provider says (its balance transactions) against what Noxtill
 * says (the sale, request, deposit, credit payment or membership a payment belongs to). Matching
 * order: exact provider reference → Noxtill metadata on the charge → constrained suggestion
 * (same currency and amount, ±15 minutes, same customer). Amount alone never matches, and a
 * suggestion is never applied without a person confirming it. This is not bank reconciliation —
 * that stays in Finance & Accounting.
 */
@Injectable()
export class PayReconService {
  constructor(private readonly ctx: PayContextService) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const r = await this.db.payReconItem.findFirst({
      where: { id, businessId: rootId },
    });
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Reconciliation item not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  /** Build / refresh items from provider balance transactions and run the matcher. */
  async autoMatch(rootId: string) {
    const pol = await this.ctx.policy(rootId);
    const bts = await this.db.payBalanceTxn.findMany({
      where: {
        businessId: rootId,
        env: 'live',
        type: { in: ['charge', 'payment', 'refund'] },
      },
      orderBy: { occurredAt: 'asc' },
    });
    // The business's own median fee rate is the baseline for "unexpected fee" checks.
    const rates = bts
      .filter((b) => b.type !== 'refund' && num(b.amount) > 0)
      .map((b) => num(b.fee) / num(b.amount))
      .sort((x, y) => x - y);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
    let created = 0;
    for (const b of bts) {
      const existing = await this.db.payReconItem.findUnique({
        where: { balanceTxnId: b.id },
      });
      if (
        existing &&
        DONE.includes(existing.status) &&
        existing.matchMethod !== 'Exact provider ID'
      )
        continue;
      const tx = b.txId
        ? await this.db.payTransaction.findUnique({ where: { id: b.txId } })
        : null;
      const refund =
        b.type === 'refund' && b.sourceObjectId
          ? await this.db.payRefund.findUnique({
              where: { providerRefundId: b.sourceObjectId },
            })
          : null;
      let status = 'Pending';
      let method: string | null = null;
      let conf: string | null = null;
      let noxtillGross: number | null = null;
      let noxtillFee: number | null = null;
      let txId: string | null = null;
      let note: string | null = null;
      let cand: string | null = null;
      let why: string | null = null;
      if (b.type === 'refund') {
        if (refund) {
          txId = refund.txId;
          noxtillGross = -num(refund.amount);
          status =
            Math.abs(r2(num(b.amount) - noxtillGross)) < 0.005
              ? 'Matched'
              : 'Amount Mismatch';
          method =
            refund.origin === 'provider'
              ? 'Exact provider ID'
              : 'Metadata mapping';
          conf = 'High';
          if (refund.origin === 'provider')
            note = 'Refund issued in the Stripe Dashboard, outside Noxtill';
        } else status = 'Unmatched Provider';
      } else if (tx) {
        txId = tx.id;
        noxtillFee = tx.fee == null ? null : num(tx.fee);
        // The Noxtill side is the source record the payment belongs to, not the imported charge.
        const src = tx.paymentId
          ? await this.db.payment.findUnique({ where: { id: tx.paymentId } })
          : null;
        noxtillGross = src
          ? num(src.amount)
          : tx.requestId ||
              tx.depositId ||
              tx.mandateId ||
              tx.sourceType !== 'Provider'
            ? num(tx.captured)
            : null;
        if (noxtillGross == null) {
          status = 'Unmatched Provider';
          note =
            'Charge on the provider that no Noxtill sale, request, deposit or membership explains';
          const c = await this.suggest(
            rootId,
            tx.currency,
            num(b.amount),
            b.occurredAt,
            tx.customerId,
          );
          if (c) {
            status = 'Suggested';
            cand = c.id;
            conf = c.conf;
            why = c.why;
          }
        } else {
          method =
            tx.paymentId || tx.depositId
              ? 'Exact provider ID'
              : 'Metadata mapping';
          conf = 'High';
          const feeOff =
            median != null &&
            num(b.amount) > 0 &&
            Math.abs(num(b.fee) / num(b.amount) - median) / median >
              pol.payout.feeVariancePct / 100;
          status =
            Math.abs(r2(num(b.amount) - noxtillGross)) >= 0.005
              ? 'Amount Mismatch'
              : feeOff
                ? 'Fee Mismatch'
                : 'Matched';
          if (status === 'Fee Mismatch')
            note = `Fee ${((num(b.fee) / num(b.amount)) * 100).toFixed(2)}% vs your usual ${(median! * 100).toFixed(2)}% (alert above ${pol.payout.feeVariancePct}% variance)`;
        }
      } else status = 'Unmatched Provider';
      const data = {
        connectionId: b.connectionId,
        env: b.env,
        batchRef: b.payoutRef,
        providerRef: b.sourceObjectId ?? b.providerTxnId,
        txId,
        type: b.type === 'refund' ? 'Refund' : 'Charge',
        providerGross: b.amount,
        noxtillGross:
          noxtillGross == null
            ? null
            : new Prisma.Decimal(noxtillGross.toFixed(2)),
        providerFee: b.fee,
        noxtillFee:
          noxtillFee == null ? null : new Prisma.Decimal(noxtillFee.toFixed(2)),
        currency: b.currency,
        occurredAt: b.occurredAt,
        status,
        matchMethod: method,
        confidence: conf,
        candidateTxId: cand,
        suggestionWhy: why,
        note,
      };
      if (existing) {
        if (!DONE.includes(existing.status) || status !== existing.status)
          await this.db.payReconItem.update({
            where: { id: existing.id },
            data: existing.resolution
              ? { ...data, status: existing.status }
              : data,
          });
      } else {
        await this.db.payReconItem.create({
          data: { businessId: rootId, balanceTxnId: b.id, ...data },
        });
        created++;
      }
    }
    // Noxtill payments that claim a provider charge the provider never reported.
    const claimed = await this.db.payTransaction.findMany({
      where: {
        businessId: rootId,
        env: 'live',
        provider: 'stripe',
        status: 'Succeeded',
        occurredAt: { lt: new Date(Date.now() - 3 * 86400000) },
      },
    });
    for (const t of claimed) {
      const seen = await this.db.payBalanceTxn.findFirst({
        where: { sourceObjectId: t.providerChargeId ?? '__' },
        select: { id: true },
      });
      if (seen) continue;
      const k = `nx:${t.id}`;
      const ex = await this.db.payReconItem.findFirst({
        where: { businessId: rootId, providerRef: k },
      });
      if (ex) continue;
      await this.db.payReconItem.create({
        data: {
          businessId: rootId,
          connectionId: t.connectionId ?? '',
          env: 'live',
          providerRef: k,
          txId: t.id,
          type: 'Charge',
          noxtillGross: t.captured,
          noxtillFee: t.fee,
          currency: t.currency,
          occurredAt: t.occurredAt,
          status: 'Unmatched Noxtill',
          note: 'Succeeded in Noxtill but no provider balance transaction after 3 days',
        },
      });
      created++;
    }
    return { created };
  }

  /** Constrained suggestion: same currency AND amount AND within 15 minutes (+ customer for Medium). */
  private async suggest(
    rootId: string,
    currency: string,
    amount: number,
    at: Date,
    customerId: string | null,
  ) {
    const used = new Set(
      (
        await this.db.payReconItem.findMany({
          where: {
            businessId: rootId,
            txId: { not: null },
            status: { in: DONE },
          },
          select: { txId: true },
        })
      ).map((x) => x.txId),
    );
    const c = await this.db.payTransaction.findMany({
      where: {
        businessId: rootId,
        env: 'live',
        provider: 'manual',
        status: 'Succeeded',
        currency,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        method: { in: ['Card', 'Online', 'Wallet'] },
        occurredAt: {
          gte: new Date(at.getTime() - 15 * 60000),
          lte: new Date(at.getTime() + 15 * 60000),
        },
      },
      take: 5,
    });
    const free = c.filter((t) => !used.has(t.id));
    if (!free.length) return null;
    const same = free.find((t) => customerId && t.customerId === customerId);
    const t = same ?? free[0];
    const mins = Math.round(
      Math.abs(t.occurredAt.getTime() - at.getTime()) / 60000,
    );
    return {
      id: t.id,
      conf: same ? 'Medium' : 'Low',
      why: `Same currency and amount, ${mins} minute(s) apart${same ? ', same customer' : ''} — a card payment recorded at the counter. Suggest only.`,
    };
  }

  private async log(
    a: PayActor,
    r: PayReconItem,
    action: string,
    reason: string,
    after: Partial<PayReconItem>,
  ) {
    await this.db.payReconResolution.create({
      data: {
        businessId: a.rootId,
        itemId: r.id,
        action,
        reason,
        byId: a.userId,
        before: { status: r.status, txId: r.txId },
        after: after,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `Reconciliation: ${action}`,
      'recon',
      r.id,
      `${r.providerRef} · ${reason}`,
    );
  }

  async match(
    a: PayActor,
    id: string,
    txId: string,
    reason: string,
    confirmLow: boolean,
  ) {
    this.ctx.need(a, 'recon', 'Matching a reconciliation item');
    const r = await this.must(a.rootId, id);
    if (DONE.includes(r.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `Already ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    const t = await this.db.payTransaction.findFirst({
      where: { id: txId, businessId: a.rootId },
    });
    if (!t)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Pick a Noxtill payment.',
        HttpStatus.BAD_REQUEST,
      );
    if (t.currency !== r.currency)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Currencies differ — that can’t be the same payment.',
        HttpStatus.BAD_REQUEST,
      );
    const sameAmount =
      r.providerGross != null &&
      Math.abs(num(r.providerGross) - num(t.captured)) < 0.005;
    const close =
      Math.abs(t.occurredAt.getTime() - r.occurredAt.getTime()) <= 30 * 60000;
    if (!(sameAmount && close) && !confirmLow)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Low-confidence match — confirm you checked the receipt.',
        HttpStatus.BAD_REQUEST,
      );
    const after = {
      status: sameAmount ? 'Matched' : 'Resolved',
      txId: t.id,
      noxtillGross: t.captured,
      matchMethod: 'Manual',
      confidence: sameAmount && close ? 'Medium' : 'Low',
      resolution: reason,
      resolvedById: a.userId,
      resolvedAt: new Date(),
    };
    await this.db.payReconItem.update({ where: { id }, data: after });
    await this.log(a, r, 'Manual match', reason, after);
  }

  async split(a: PayActor, id: string, txIds: string[], reason: string) {
    this.ctx.need(a, 'recon', 'Split-matching a reconciliation item');
    const r = await this.must(a.rootId, id);
    const txs = await this.db.payTransaction.findMany({
      where: { id: { in: txIds }, businessId: a.rootId },
    });
    const sum = r2(txs.reduce((s, t) => s + num(t.captured), 0));
    if (
      r.providerGross == null ||
      Math.abs(sum - num(r.providerGross)) >= 0.005
    )
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Selected payments add up to ${sum.toFixed(2)} but the provider line is ${num(r.providerGross).toFixed(2)} — they must match exactly.`,
        HttpStatus.BAD_REQUEST,
      );
    const after = {
      status: 'Matched',
      splitTxIds: txIds as unknown as Prisma.InputJsonValue,
      matchMethod: 'Split',
      confidence: 'High',
      resolution: reason,
      resolvedById: a.userId,
      resolvedAt: new Date(),
      noxtillGross: new Prisma.Decimal(sum.toFixed(2)),
    };
    await this.db.payReconItem.update({ where: { id }, data: after });
    await this.log(a, r, 'Split match', reason, after as Partial<PayReconItem>);
  }

  async adjust(a: PayActor, id: string, type: string, reason: string) {
    this.ctx.need(a, 'recon', 'Recording a provider adjustment');
    const r = await this.must(a.rootId, id);
    if (DONE.includes(r.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `Already ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    const after = {
      status: 'Resolved',
      resolution: `Provider adjustment · ${type} · ${reason}`,
      resolvedById: a.userId,
      resolvedAt: new Date(),
    };
    await this.db.payReconItem.update({ where: { id }, data: after });
    await this.ctx.outbox(
      a.rootId,
      'provider.adjustment',
      {
        item: r.id,
        providerRef: r.providerRef,
        type,
        difference: num(r.providerGross) - num(r.noxtillGross),
        currency: r.currency,
      },
      ['Finance & Accounting'],
    );
    await this.log(a, r, 'Provider adjustment', `${type}: ${reason}`, after);
  }

  async flagFinance(a: PayActor, id: string, reason: string) {
    this.ctx.need(a, 'recon', 'Flagging for Finance');
    const r = await this.must(a.rootId, id);
    await this.db.payReconItem.update({
      where: { id },
      data: {
        status: 'Manual Review',
        note: `Flagged for Finance review: ${reason}`.slice(0, 300),
      },
    });
    await this.ctx.outbox(
      a.rootId,
      'recon.finance_review',
      { item: r.id, providerRef: r.providerRef, reason },
      ['Finance & Accounting'],
    );
    await this.log(a, r, 'Flagged for Finance review', reason, {
      status: 'Manual Review',
    });
  }

  async ignore(a: PayActor, id: string, reason: string) {
    this.ctx.need(a, 'recon', 'Ignoring a reconciliation item');
    const r = await this.must(a.rootId, id);
    const after = {
      status: 'Ignored',
      resolution: reason,
      resolvedById: a.userId,
      resolvedAt: new Date(),
    };
    await this.db.payReconItem.update({ where: { id }, data: after });
    await this.log(a, r, 'Ignored', reason, after);
  }

  async candidates(rootId: string, r: PayReconItem) {
    const used = new Set(
      (
        await this.db.payReconItem.findMany({
          where: {
            businessId: rootId,
            txId: { not: null },
            status: { in: DONE },
          },
          select: { txId: true },
        })
      ).map((x) => x.txId),
    );
    const list = await this.db.payTransaction.findMany({
      where: {
        businessId: rootId,
        env: 'live',
        currency: r.currency,
        status: 'Succeeded',
        occurredAt: {
          gte: new Date(r.occurredAt.getTime() - 4 * 86400000),
          lte: new Date(r.occurredAt.getTime() + 4 * 86400000),
        },
      },
      take: 60,
    });
    return list
      .filter((t) => !used.has(t.id))
      .sort(
        (x, y) =>
          Math.abs(num(x.captured) - num(r.providerGross)) -
          Math.abs(num(y.captured) - num(r.providerGross)),
      )
      .slice(0, 8)
      .map((t) => {
        const same =
          r.providerGross != null &&
          Math.abs(num(t.captured) - num(r.providerGross)) < 0.005;
        const close =
          Math.abs(t.occurredAt.getTime() - r.occurredAt.getTime()) <=
          30 * 60000;
        return {
          t,
          conf:
            t.providerChargeId && t.providerChargeId === r.providerRef
              ? 'High'
              : same && close
                ? 'Medium'
                : same
                  ? 'Low'
                  : 'Low · amount differs',
        };
      });
  }
}
