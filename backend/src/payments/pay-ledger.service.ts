import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PayContextService, corrId, dec, num, r2 } from './pay-context.service';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  online: 'Online',
  credit: 'Credit',
};

interface Want {
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  sourceRef: string | null;
  branchId: string;
  paymentId?: string;
  orderId?: string;
  depositId?: string;
  customerId: string | null;
  channel: string;
  method: string;
  amount: number;
  currency: string;
  occurredAt: Date;
  initiatedBy: string;
  createdById: string | null;
  providerRef: string | null;
}

/**
 * Projects Noxtill's own money records into the canonical payment ledger (PayTransaction):
 * sale payments, captured booking deposits and customer credit payments (installments included).
 * It is idempotent (one row per source key) and never writes back to the source modules, so their
 * existing wiring is untouched. "credit" sale payments are credit extended — not money collected —
 * and are left out. A source that disappears is marked Cancelled, never silently dropped.
 * Approved returns become succeeded manual refund executions with the payment's refunded amount.
 */
@Injectable()
export class PayLedgerService {
  private readonly logger = new Logger(PayLedgerService.name);

  constructor(private readonly ctx: PayContextService) {}

  private get db() {
    return this.ctx.db;
  }

  async project(
    rootId: string,
  ): Promise<{ created: number; updated: number; cancelled: number }> {
    await this.ctx.ensure(rootId);
    const group = await this.ctx.branches(rootId);
    const ids = group.map((g) => g.id);
    const cur = new Map(group.map((g) => [g.id, g.currency]));
    const base = (await this.ctx.business(rootId)).currency;

    const want: Want[] = [];

    // Payments already represented by a provider transaction (a paid payment request) are skipped.
    const providerLinked = new Set(
      (
        await this.db.payTransaction.findMany({
          where: {
            businessId: rootId,
            origin: 'provider',
            paymentId: { not: null },
          },
          select: { paymentId: true },
        })
      ).map((x) => x.paymentId as string),
    );

    const payments = await this.db.payment.findMany({
      where: {
        order: { businessId: { in: ids }, isQuotation: false },
        method: { not: PaymentMethod.credit },
      },
      include: {
        order: {
          select: {
            id: true,
            businessId: true,
            orderNo: true,
            orderType: true,
            externalProvider: true,
            customerId: true,
            staffUserId: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.ctx.userNames(
      payments.map((p) => p.order.staffUserId),
    );
    for (const p of payments) {
      if (providerLinked.has(p.id)) continue;
      const o = p.order;
      const online = o.orderType === 'online' || !!o.externalProvider;
      want.push({
        sourceKey: `payment:${p.id}`,
        sourceType: 'Order',
        sourceId: o.id,
        sourceRef: `#${o.orderNo}`,
        branchId: o.businessId,
        paymentId: p.id,
        orderId: o.id,
        customerId: o.customerId,
        channel: online ? 'Website' : 'POS',
        method: METHOD_LABEL[p.method],
        amount: num(p.amount),
        currency: cur.get(o.businessId) ?? base,
        occurredAt: p.createdAt,
        initiatedBy: online
          ? 'Customer (self-serve)'
          : ((o.staffUserId ? names.get(o.staffUserId) : null) ?? 'Counter'),
        createdById: o.staffUserId,
        providerRef: p.providerRef,
      });
    }

    const deposits = await this.db.deposit.findMany({
      where: {
        businessId: { in: ids },
        status: { in: ['captured', 'refunded', 'forfeited'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    const appts = deposits.length
      ? await this.db.appointment.findMany({
          where: { id: { in: deposits.map((d) => d.appointmentId) } },
          select: { id: true, bookingNo: true, customerId: true },
        })
      : [];
    const apptBy = new Map(appts.map((a) => [a.id, a]));
    for (const d of deposits) {
      const a = apptBy.get(d.appointmentId);
      want.push({
        sourceKey: `deposit:${d.id}`,
        sourceType: 'Booking',
        sourceId: d.appointmentId,
        sourceRef: a?.bookingNo ? `#${a.bookingNo}` : null,
        branchId: d.businessId,
        depositId: d.id,
        customerId: a?.customerId ?? null,
        channel: 'POS',
        method: METHOD_LABEL[d.method],
        amount: num(d.amount),
        currency: cur.get(d.businessId) ?? base,
        occurredAt: d.createdAt,
        initiatedBy: 'Counter',
        createdById: null,
        providerRef: d.providerRef,
      });
    }

    const credits = await this.db.creditEntry.findMany({
      where: { businessId: { in: ids }, kind: 'payment' },
      include: {
        installment: { select: { id: true, seq: true, planId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const c of credits) {
      // A return refunded to credit is written as a "payment" entry but no money came in — the
      // same rule Finance's sweep uses (orderId set + "Return …" note).
      if (c.orderId && /^Return /.test(c.note ?? '')) continue;
      want.push({
        sourceKey: `credit:${c.id}`,
        sourceType: c.installment ? 'Installment' : 'Credit balance',
        sourceId: c.installment ? c.installment.planId : c.customerId,
        sourceRef: c.installment ? `Installment ${c.installment.seq}` : null,
        branchId: c.businessId,
        customerId: c.customerId,
        channel: 'POS',
        method: c.method ? METHOD_LABEL[c.method] : 'Cash',
        amount: num(c.amount),
        currency: cur.get(c.businessId) ?? base,
        occurredAt: c.createdAt,
        initiatedBy: 'Counter',
        createdById: null,
        providerRef: null,
      });
    }

    const existing = await this.db.payTransaction.findMany({
      where: { businessId: rootId, origin: 'noxtill' },
      select: {
        id: true,
        sourceKey: true,
        amount: true,
        status: true,
        branchId: true,
        customerId: true,
        method: true,
      },
    });
    const byKey = new Map(existing.map((e) => [e.sourceKey, e]));
    const seen = new Set<string>();
    let created = 0;
    let updated = 0;
    const fresh = want.filter((w) => !byKey.has(w.sourceKey));
    if (fresh.length) {
      const first = await this.reserve(rootId, fresh.length);
      const rows: Prisma.PayTransactionCreateManyInput[] = [];
      let n = first;
      for (const w of fresh) {
        const rate = await this.rate(rootId, w.currency, w.occurredAt, base);
        rows.push({
          businessId: rootId,
          branchId: w.branchId,
          env: 'live',
          number: 'PAY-' + String(n++).padStart(6, '0'),
          origin: 'noxtill',
          sourceKey: w.sourceKey,
          sourceType: w.sourceType,
          sourceId: w.sourceId,
          sourceRef: w.sourceRef,
          paymentId: w.paymentId ?? null,
          orderId: w.orderId ?? null,
          depositId: w.depositId ?? null,
          customerId: w.customerId,
          provider: 'manual',
          channel: w.channel,
          method: w.method,
          status: 'Succeeded',
          authStatus: '—',
          captureStatus: 'Captured',
          amount: dec(w.amount),
          captured: dec(w.amount),
          fee: dec(0),
          feeSource: 'none',
          currency: w.currency,
          fxRate: rate == null ? null : new Prisma.Decimal(rate),
          fxSource:
            rate == null || w.currency === base
              ? null
              : 'Finance › Exchange rates',
          reportAmount: rate == null ? null : dec(w.amount * rate),
          correlationId: corrId(),
          initiatedBy: w.initiatedBy.slice(0, 120),
          createdById: w.createdById,
          occurredAt: w.occurredAt,
          capturedAt: w.occurredAt,
        });
      }
      for (let i = 0; i < rows.length; i += 200) {
        const r = await this.db.payTransaction.createMany({
          data: rows.slice(i, i + 200),
          skipDuplicates: true,
        });
        created += r.count;
      }
    }
    for (const w of want) {
      seen.add(w.sourceKey);
      const e = byKey.get(w.sourceKey);
      if (!e) continue;
      if (
        r2(num(e.amount)) !== r2(w.amount) ||
        e.status === 'Cancelled' ||
        e.branchId !== w.branchId ||
        e.customerId !== w.customerId ||
        e.method !== w.method
      ) {
        await this.db.payTransaction.update({
          where: { id: e.id },
          data: {
            amount: dec(w.amount),
            captured: dec(w.amount),
            status: 'Succeeded',
            branchId: w.branchId,
            customerId: w.customerId,
            method: w.method,
            failureMessage: null,
          },
        });
        updated++;
      }
    }
    let cancelled = 0;
    for (const e of existing)
      if (!seen.has(e.sourceKey) && e.status !== 'Cancelled') {
        await this.db.payTransaction.update({
          where: { id: e.id },
          data: {
            status: 'Cancelled',
            failureMessage: 'Source record was removed in its own module',
          },
        });
        cancelled++;
      }

    await this.projectReturns(rootId, ids);
    await this.db.paySettings.update({
      where: { businessId: rootId },
      data: { projectedAt: new Date() },
    });
    if (created || updated || cancelled)
      this.logger.debug(
        `projected ${rootId}: +${created} ~${updated} -${cancelled}`,
      );
    return { created, updated, cancelled };
  }

  /**
   * Approved returns refunded outside a provider (cash, credit, store credit) were executed at the
   * counter by Orders; they appear here as succeeded manual refund executions. The payment's
   * refunded amount is the sum of its succeeded executions.
   */
  private async projectReturns(rootId: string, ids: string[]) {
    const returns = await this.db.return.findMany({
      where: { businessId: { in: ids }, status: 'approved' },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of returns) {
      const have = await this.db.payRefund.findUnique({
        where: { returnId: r.id },
      });
      if (have) continue;
      const tx = await this.db.payTransaction.findFirst({
        where: { businessId: rootId, orderId: r.orderId, status: 'Succeeded' },
        orderBy: { amount: 'desc' },
      });
      const number = await this.ctx.number(rootId, 'refund');
      // Card / online returns are executed through Payments (createFromReturn). One approved before
      // Payments existed was never refunded at a provider by Noxtill, so it waits for a person.
      const counter = !['card', 'online'].includes(String(r.refundMethod));
      await this.db.payRefund.create({
        data: {
          businessId: rootId,
          env: 'live',
          number,
          returnId: r.id,
          txId: tx?.id ?? null,
          origin: counter ? 'manual' : 'noxtill',
          approvedAmount: r.refundAmount,
          amount: r.refundAmount,
          currency: tx?.currency ?? (await this.ctx.business(rootId)).currency,
          status: counter ? 'Succeeded' : 'Manual Review',
          failureCode: counter
            ? null
            : 'Approved in Orders before Payments executed refunds — confirm how it was paid out',
          reason: (r.reason ?? 'Return approved in Orders').slice(0, 300),
          method: String(r.refundMethod),
          upstreamById: r.approvedByUserId,
          upstreamAt: r.updatedAt,
          idempotencyKey: `refund:return:${r.id}`,
          submittedAt: counter ? r.updatedAt : null,
          verifiedAt: counter ? r.updatedAt : null,
          executedById: counter ? r.approvedByUserId : null,
        },
      });
    }
    await this.syncRefunded(rootId);
  }

  /** tx.refunded = Σ succeeded refund executions against it (never more than captured). */
  async syncRefunded(rootId: string, txIds?: string[]) {
    const sums = await this.db.payRefund.groupBy({
      by: ['txId'],
      where: {
        businessId: rootId,
        status: 'Succeeded',
        txId: txIds ? { in: txIds } : { not: null },
      },
      _sum: { amount: true },
    });
    for (const s of sums) {
      if (!s.txId) continue;
      const t = await this.db.payTransaction.findUnique({
        where: { id: s.txId },
        select: { captured: true, refunded: true },
      });
      if (!t) continue;
      const v = Math.min(num(t.captured), num(s._sum.amount));
      if (r2(v) !== r2(num(t.refunded)))
        await this.db.payTransaction.update({
          where: { id: s.txId },
          data: { refunded: dec(v) },
        });
    }
  }

  private async reserve(rootId: string, n: number) {
    const s = await this.db.paySettings.update({
      where: { businessId: rootId },
      data: { txSeq: { increment: n } },
      select: { txSeq: true },
    });
    return s.txSeq - n + 1;
  }

  private rates = new Map<string, number | null>();
  private async rate(rootId: string, currency: string, on: Date, base: string) {
    if (currency === base) return 1;
    const k = `${rootId}|${currency}|${on.toISOString().slice(0, 10)}`;
    if (!this.rates.has(k))
      this.rates.set(k, await this.ctx.rateOn(rootId, currency, on, base));
    return this.rates.get(k) ?? null;
  }
}
