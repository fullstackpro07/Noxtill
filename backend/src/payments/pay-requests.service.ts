import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayRequest, PaymentMethod, Prisma } from '@prisma/client';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { AppException } from '../common/filters/app.exception';
import {
  PayActor,
  PayContextService,
  corrId,
  dec,
  num,
  r2,
} from './pay-context.service';
import { PayMessagingService, PayChannel } from './pay-messaging.service';
import { PayStripeService } from './pay-stripe.service';
import {
  PAY_ERRORS,
  PayEnv,
  REQUEST_OPEN,
  providerDef,
} from './payments.constants';

export interface CreateRequest {
  env: PayEnv;
  customerId: string;
  contact: 'whatsapp' | 'sms' | 'email' | 'none';
  linkType?: 'Order' | 'Invoice' | 'Booking' | 'Credit balance' | null;
  linkId?: string | null;
  amountType: 'Fixed' | 'Flexible';
  amount?: number | null;
  currency: string;
  allowPartial?: boolean;
  description: string;
  reference?: string | null;
  dueOn?: string | null;
  expiresDays?: number | null;
  methods?: string[];
  note?: string | null;
  redirectUrl?: string | null;
  template?: string | null;
}

const LINK_MODULE: Record<string, string> = {
  Order: 'Orders',
  Invoice: 'Orders',
  Booking: 'Bookings',
  'Credit balance': 'Credit',
};

/**
 * Payment requests and their public links. The link token is an HMAC over (request id, nonce):
 * opaque, never sequential, and only its SHA-256 hash is stored. A request is Paid only when a
 * provider confirms a payment (verified webhook / sync) or a person records a payment that
 * arrived another way — never because the customer opened the page.
 */
@Injectable()
export class PayRequestsService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly config: ConfigService,
    private readonly stripe: PayStripeService,
    private readonly msg: PayMessagingService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private secret() {
    return (
      this.config.get<string>('PAY_LINK_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'noxtill-pay-links'
    );
  }

  token(id: string, nonce: string) {
    return createHmac('sha256', this.secret())
      .update(`paylink:${id}:${nonce}`)
      .digest('base64url');
  }

  static hashToken(t: string) {
    return createHash('sha256').update(t).digest('hex');
  }

  url(r: Pick<PayRequest, 'id' | 'tokenNonce'>) {
    const fe = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${fe}/pay/${this.token(r.id, r.tokenNonce)}`;
  }

  // ── linked entities (real balances from their own modules) ─────────────

  async linkOptions(rootId: string, customerId: string) {
    const group = (await this.ctx.branches(rootId)).map((b) => b.id);
    const orders = await this.db.order.findMany({
      where: {
        businessId: { in: group },
        customerId,
        isQuotation: false,
        status: { not: 'cancelled' },
      },
      include: { payments: { select: { amount: true, method: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const orderOpts = orders
      .map((o) => ({
        id: o.id,
        ref: `#${o.orderNo}`,
        open: r2(
          num(o.total) -
            o.payments
              .filter((p) => p.method !== 'credit')
              .reduce((s, p) => s + num(p.amount), 0),
        ),
        status: o.status,
      }))
      .filter((o) => o.open > 0.004);
    const appts = await this.db.appointment.findMany({
      where: {
        businessId: { in: group },
        customerId,
        startsAt: { gte: new Date(Date.now() - 86400000) },
        status: { notIn: ['cancelled', 'no_show'] } as never,
      },
      select: { id: true, bookingNo: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
      take: 20,
    });
    const deposits = appts.length
      ? await this.db.deposit.findMany({
          where: {
            appointmentId: { in: appts.map((a) => a.id) },
            status: 'pending',
          },
        })
      : [];
    const credit = await this.creditBalance(group, customerId);
    return {
      Invoice: orderOpts
        .filter((o) => o.status === 'completed')
        .map((o) => ({ id: o.id, ref: o.ref, amount: o.open })),
      Order: orderOpts
        .filter((o) => o.status !== 'completed')
        .map((o) => ({ id: o.id, ref: o.ref, amount: o.open })),
      Booking: appts.map((a) => {
        const d = deposits.find((x) => x.appointmentId === a.id);
        return {
          id: a.id,
          ref: a.bookingNo
            ? `#${a.bookingNo}`
            : a.startsAt.toISOString().slice(0, 10),
          amount: d ? num(d.amount) : null,
        };
      }),
      'Credit balance':
        credit > 0.004
          ? [{ id: customerId, ref: 'Credit balance', amount: credit }]
          : [],
    };
  }

  async creditBalance(group: string[], customerId: string) {
    const rows = await this.db.creditEntry.groupBy({
      by: ['kind'],
      where: { businessId: { in: group }, customerId },
      _sum: { amount: true },
    });
    const v = (k: string) => num(rows.find((r) => r.kind === k)?._sum.amount);
    return r2(v('credit') - v('payment') - v('write_off'));
  }

  private async resolveLink(rootId: string, d: CreateRequest) {
    if (!d.linkType)
      return {
        linkRef: null as string | null,
        branchId: null as string | null,
        open: null as number | null,
      };
    if (!d.linkId)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Pick the ${d.linkType.toLowerCase()} reference.`,
        HttpStatus.BAD_REQUEST,
      );
    const group = (await this.ctx.branches(rootId)).map((b) => b.id);
    if (d.linkType === 'Order' || d.linkType === 'Invoice') {
      const o = await this.db.order.findFirst({
        where: { id: d.linkId, businessId: { in: group } },
        include: { payments: true },
      });
      if (!o)
        throw new AppException(
          PAY_ERRORS.NOT_FOUND,
          'That order isn’t in this business.',
          HttpStatus.NOT_FOUND,
        );
      const open = r2(
        num(o.total) -
          o.payments
            .filter((p) => p.method !== 'credit')
            .reduce((s, p) => s + num(p.amount), 0),
      );
      return { linkRef: `#${o.orderNo}`, branchId: o.businessId, open };
    }
    if (d.linkType === 'Booking') {
      const a = await this.db.appointment.findFirst({
        where: { id: d.linkId, businessId: { in: group } },
      });
      if (!a)
        throw new AppException(
          PAY_ERRORS.NOT_FOUND,
          'That booking isn’t in this business.',
          HttpStatus.NOT_FOUND,
        );
      return {
        linkRef: a.bookingNo
          ? `#${a.bookingNo}`
          : a.startsAt.toISOString().slice(0, 10),
        branchId: a.businessId,
        open: null,
      };
    }
    const bal = await this.creditBalance(group, d.customerId);
    return { linkRef: 'Credit balance', branchId: null, open: bal };
  }

  async create(a: PayActor, d: CreateRequest) {
    this.ctx.need(a, 'request', 'Creating a payment request');
    const pol = await this.ctx.policy(a.rootId);
    const biz = await this.ctx.business(a.rootId);
    const customer = await this.db.customer.findFirst({
      where: {
        id: d.customerId,
        businessId: {
          in: (await this.ctx.branches(a.rootId)).map((b) => b.id),
        },
      },
    });
    if (!customer)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Pick a customer.',
        HttpStatus.BAD_REQUEST,
      );
    if (d.amountType === 'Flexible' && !pol.collection.partialPayments)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Flexible amounts are off in Payments › Settings › Collection policies.',
        HttpStatus.BAD_REQUEST,
      );
    if (d.allowPartial && !pol.collection.partialPayments)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Partial payments are off in Payments › Settings › Collection policies.',
        HttpStatus.BAD_REQUEST,
      );
    const link = await this.resolveLink(a.rootId, d);
    if (d.linkType) {
      const dup = await this.db.payRequest.findFirst({
        where: {
          businessId: a.rootId,
          env: d.env,
          linkType: d.linkType,
          linkId: d.linkId,
          status: { in: REQUEST_OPEN },
        },
      });
      if (dup)
        throw new AppException(
          PAY_ERRORS.DUPLICATE_OPEN_REQUEST,
          `An open request already exists for ${link.linkRef} (${dup.number}). Share or expire it instead of creating a duplicate.`,
          HttpStatus.CONFLICT,
        );
    }
    let amount: number | null = null;
    if (d.amountType === 'Fixed') {
      amount = r2(Number(d.amount ?? 0));
      if (!(amount > 0))
        throw new AppException(
          PAY_ERRORS.INVALID,
          'Enter the amount.',
          HttpStatus.BAD_REQUEST,
        );
      if (
        amount < pol.collection.minRequest ||
        amount > pol.collection.maxRequest
      )
        throw new AppException(
          PAY_ERRORS.AMOUNT_OUT_OF_RANGE,
          `Amount must be between ${pol.collection.minRequest} and ${pol.collection.maxRequest} ${biz.currency} (Payments › Settings).`,
          HttpStatus.BAD_REQUEST,
        );
      if (link.open != null && amount > link.open + 0.004)
        throw new AppException(
          PAY_ERRORS.INVALID,
          `${link.linkRef} only has ${link.open.toFixed(2)} outstanding.`,
          HttpStatus.BAD_REQUEST,
        );
    }
    const methods = await this.allowedMethods(a.rootId, d.env, d.currency);
    const chosen = (
      d.methods?.length ? d.methods : methods.map((m) => m.method)
    ).filter((m) => methods.some((x) => x.method === m));
    if (!chosen.length)
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        `No payment method is enabled for payment links in ${d.currency}. Enable one in Methods & Routing.`,
        HttpStatus.BAD_REQUEST,
      );
    const days = Math.max(
      1,
      Math.min(365, Number(d.expiresDays ?? pol.collection.requestExpiryDays)),
    );
    const nonce = randomBytes(12).toString('hex');
    const id = randomUUID();
    const number = await this.ctx.number(a.rootId, 'request');
    const req = await this.db.payRequest.create({
      data: {
        id,
        businessId: a.rootId,
        branchId: link.branchId ?? customer.businessId,
        env: d.env,
        number,
        customerId: customer.id,
        recipientName: customer.name,
        contact: d.contact,
        linkType: d.linkType ?? null,
        linkId: d.linkType ? d.linkId : null,
        linkRef: link.linkRef,
        amountType: d.amountType,
        amount: amount == null ? null : dec(amount),
        allowPartial: !!d.allowPartial || d.amountType === 'Flexible',
        currency: d.currency,
        description: d.description.slice(0, 300),
        reference: d.reference?.slice(0, 120) || null,
        dueOn: d.dueOn ? new Date(`${d.dueOn}T00:00:00Z`) : null,
        expiresAt: new Date(Date.now() + days * 86400000),
        methods: chosen,
        note: d.note?.slice(0, 1000) || null,
        redirectUrl: d.redirectUrl?.slice(0, 300) || null,
        status: 'Open',
        tokenHash: PayRequestsService.hashToken(this.token(id, nonce)),
        tokenNonce: nonce,
        template: d.template ?? null,
        createdById: a.userId,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Payment request created',
      'request',
      req.id,
      `${req.number} · ${amount == null ? 'flexible' : amount.toFixed(2)} ${req.currency}${link.linkRef ? ` · ${d.linkType} ${link.linkRef}` : ''}`,
    );
    if (d.contact !== 'none') await this.send(a, req.id, d.contact);
    return this.db.payRequest.findUniqueOrThrow({ where: { id: req.id } });
  }

  /** Methods the business has enabled on payment links whose primary provider can take this currency in this env. */
  async allowedMethods(rootId: string, env: PayEnv, currency: string) {
    const cfg = await this.db.payMethodConfig.findMany({
      where: { businessId: rootId, enabled: true },
    });
    const conns = await this.stripe.connections(rootId);
    return cfg
      .filter((m) => {
        const ch = (m.channels as string[]) ?? [];
        if (!ch.includes('Payment Link')) return false;
        if (!m.primary) return false;
        if (m.primary === 'manual') return env === 'live';
        const c = conns.find((x) => x.provider === m.primary && x.env === env);
        if (
          !c ||
          !c.writeEnabled ||
          !['Connected', 'Degraded'].includes(c.status)
        )
          return false;
        return providerDef(m.primary)?.methods.includes(m.method) ?? false;
      })
      .map((m) => ({
        method: m.method,
        provider: m.primary as string,
        currency,
      }));
  }

  async mustRequest(rootId: string, id: string) {
    const r = await this.db.payRequest.findFirst({
      where: { id, businessId: rootId },
    });
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Payment request not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  async send(a: PayActor, id: string, how: string) {
    this.ctx.need(a, 'request', 'Sending a payment request');
    const r = await this.mustRequest(a.rootId, id);
    if (!REQUEST_OPEN.includes(r.status) && r.status !== 'Draft')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `${r.number} is ${r.status} — it can’t be sent.`,
        HttpStatus.CONFLICT,
      );
    if (!r.customerId)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'This request has no customer to send to.',
        HttpStatus.BAD_REQUEST,
      );
    const biz = await this.ctx.business(a.rootId);
    const channel = (
      ['whatsapp', 'sms', 'email'].includes(how) ? how : 'whatsapp'
    ) as PayChannel;
    const res = await this.msg.send({
      customerId: r.customerId,
      templateKey: 'payment_request',
      channel,
      variables: {
        customerName: r.recipientName.split(' ')[0],
        businessName: biz.name,
        amount:
          r.amount == null
            ? 'an amount you choose'
            : `${r.currency} ${num(r.amount).toFixed(2)}`,
        description: r.description,
        payUrl: this.url(r),
      },
    });
    await this.db.payRequestDelivery.create({
      data: {
        businessId: a.rootId,
        requestId: r.id,
        channel: `${res.channel === 'whatsapp' ? 'WhatsApp' : res.channel === 'sms' ? 'SMS' : res.channel === 'email' ? 'Email' : res.channel} (Unified Inbox)`,
        messageId: res.message?.id ?? null,
        status: res.message
          ? PayMessagingService.status(res.message)
          : 'Failed',
        error: res.error,
      },
    });
    if (res.message && ['Open', 'Draft'].includes(r.status))
      await this.db.payRequest.update({
        where: { id: r.id },
        data: { status: 'Sent', sentAt: new Date() },
      });
    await this.ctx.audit(
      a.rootId,
      a,
      res.message ? 'Payment request sent' : 'Payment request not sent',
      'request',
      r.id,
      res.message
        ? `${r.number} via ${res.channel}`
        : `${r.number}: ${res.error}`,
    );
    if (!res.message)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Not sent — ${res.error}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return { channel: res.channel };
  }

  async expire(a: PayActor, id: string, reason?: string) {
    this.ctx.need(a, 'request', 'Expiring a payment request');
    const r = await this.mustRequest(a.rootId, id);
    if (!REQUEST_OPEN.includes(r.status) && r.status !== 'Draft')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `${r.number} is already ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    // Rotating the nonce AND the stored hash revokes the old link immediately.
    const nonce = randomBytes(12).toString('hex');
    await this.db.payRequest.update({
      where: { id },
      data: {
        status: 'Expired',
        closedAt: new Date(),
        tokenNonce: nonce,
        tokenHash: PayRequestsService.hashToken(this.token(id, nonce)),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Payment request expired',
      'request',
      id,
      `${r.number}${reason ? ` · ${reason}` : ''} · captured payments are never reversed`,
    );
  }

  async duplicate(a: PayActor, id: string) {
    const r = await this.mustRequest(a.rootId, id);
    return {
      cus: r.customerId ?? '',
      contact: r.contact,
      ltype: '',
      type: r.amountType,
      amt: r.amount == null ? '' : String(num(r.amount)),
      cur: r.currency,
      partial: r.allowPartial && r.amountType === 'Fixed' ? '1' : '',
      desc: r.description,
      ref: r.reference ?? '',
      exp: String(
        Math.max(
          1,
          Math.round(
            (r.expiresAt.getTime() - r.createdAt.getTime()) / 86400000,
          ),
        ),
      ),
      methods: (r.methods as string[]) ?? [],
      note: r.note ?? '',
      redirect: r.redirectUrl ?? '',
    };
  }

  /** Job: open requests past their expiry become Expired (captured payments stay untouched). */
  async expireDue(rootId?: string) {
    const due = await this.db.payRequest.findMany({
      where: {
        ...(rootId ? { businessId: rootId } : {}),
        status: { in: [...REQUEST_OPEN, 'Draft'] },
        expiresAt: { lt: new Date() },
      },
    });
    for (const r of due) {
      await this.db.payRequest.update({
        where: { id: r.id },
        data: { status: 'Expired', closedAt: new Date() },
      });
      await this.ctx.audit(
        r.businessId,
        'System',
        'Payment request expired',
        'request',
        r.id,
        `${r.number} passed its expiry`,
      );
    }
    return due.length;
  }

  // ── payments against a request ─────────────────────────────────────────

  /**
   * Writes the money into the module that owns the linked entity (a sale Payment, a credit-ledger
   * payment, a captured deposit) and returns the projector key, so the payment ledger, Orders,
   * Credit, Bookings and Finance all see one payment — never two.
   */
  private async writeSource(
    r: PayRequest,
    amount: number,
    method: PaymentMethod,
    providerRef: string | null,
  ) {
    if ((r.linkType === 'Order' || r.linkType === 'Invoice') && r.linkId) {
      const p = await this.db.payment.create({
        data: { orderId: r.linkId, method, amount: dec(amount), providerRef },
      });
      return {
        sourceKey: `payment:${p.id}`,
        paymentId: p.id,
        orderId: r.linkId,
        depositId: null as string | null,
        sourceType: r.linkType,
        sourceId: r.linkId,
      };
    }
    if (r.linkType === 'Credit balance' && r.customerId) {
      const cust = await this.db.customer.findUniqueOrThrow({
        where: { id: r.customerId },
        select: { businessId: true },
      });
      const e = await this.db.creditEntry.create({
        data: {
          businessId: cust.businessId,
          customerId: r.customerId,
          kind: 'payment',
          amount: dec(amount),
          method,
          note: `Payment request ${r.number}`,
        },
      });
      return {
        sourceKey: `credit:${e.id}`,
        paymentId: null,
        orderId: null,
        depositId: null,
        sourceType: 'Credit balance',
        sourceId: r.customerId,
      };
    }
    if (r.linkType === 'Booking' && r.linkId) {
      const dep = await this.db.deposit.findFirst({
        where: { appointmentId: r.linkId, status: 'pending' },
      });
      if (dep) {
        await this.db.deposit.update({
          where: { id: dep.id },
          data: {
            status: 'captured',
            method,
            providerRef,
            amount: dec(amount),
          },
        });
        await this.db.appointment
          .update({
            where: { id: r.linkId },
            data: { depositPaid: { increment: dec(amount) } },
          })
          .catch(() => null);
        return {
          sourceKey: `deposit:${dep.id}`,
          paymentId: null,
          orderId: null,
          depositId: dep.id,
          sourceType: 'Booking',
          sourceId: r.linkId,
        };
      }
      const appt = await this.db.appointment.findUniqueOrThrow({
        where: { id: r.linkId },
        select: { businessId: true },
      });
      const created = await this.db.deposit.create({
        data: {
          businessId: appt.businessId,
          appointmentId: r.linkId,
          amount: dec(amount),
          method,
          status: 'captured',
          providerRef,
        },
      });
      await this.db.appointment
        .update({
          where: { id: r.linkId },
          data: { depositPaid: { increment: dec(amount) } },
        })
        .catch(() => null);
      return {
        sourceKey: `deposit:${created.id}`,
        paymentId: null,
        orderId: null,
        depositId: created.id,
        sourceType: 'Booking',
        sourceId: r.linkId,
      };
    }
    return null;
  }

  /** A person records money that arrived outside a provider (cash, bank transfer) against a request. */
  async recordManual(
    a: PayActor,
    id: string,
    d: {
      amount: number;
      method: 'cash' | 'online' | 'card';
      reference?: string | null;
      note?: string | null;
    },
  ) {
    this.ctx.need(a, 'request', 'Recording a payment');
    const r = await this.mustRequest(a.rootId, id);
    if (r.env !== 'live')
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Test requests are paid with sandbox cards only — nothing manual is recorded in test mode.',
        HttpStatus.BAD_REQUEST,
      );
    if (!REQUEST_OPEN.includes(r.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `${r.number} is ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    const amount = r2(d.amount);
    this.checkAmount(r, amount);
    const src = await this.writeSource(
      r,
      amount,
      d.method,
      d.reference ?? null,
    );
    const base = (await this.ctx.business(a.rootId)).currency;
    const rate = await this.ctx.rateOn(a.rootId, r.currency, new Date(), base);
    const tx = await this.db.payTransaction.create({
      data: {
        businessId: a.rootId,
        branchId: r.branchId,
        env: 'live',
        number: await this.ctx.number(a.rootId, 'tx'),
        origin: 'noxtill',
        sourceKey:
          src?.sourceKey ?? `request:${r.id}:${randomBytes(4).toString('hex')}`,
        sourceType: src?.sourceType ?? 'Payment request',
        sourceId: src?.sourceId ?? r.id,
        sourceRef: r.linkRef ?? r.number,
        paymentId: src?.paymentId ?? null,
        orderId: src?.orderId ?? null,
        depositId: src?.depositId ?? null,
        customerId: r.customerId,
        requestId: r.id,
        provider: 'manual',
        channel: 'Payment Link',
        method:
          d.method === 'cash'
            ? 'Cash'
            : d.method === 'card'
              ? 'Card'
              : 'Bank transfer',
        status: 'Succeeded',
        authStatus: '—',
        captureStatus: 'Captured',
        amount: dec(amount),
        captured: dec(amount),
        fee: dec(0),
        feeSource: 'none',
        currency: r.currency,
        fxRate: rate == null ? null : new Prisma.Decimal(rate),
        reportAmount: rate == null ? null : dec(amount * rate),
        correlationId: corrId(),
        initiatedBy: a.name,
        createdById: a.userId,
        occurredAt: new Date(),
        capturedAt: new Date(),
        failureMessage: d.note?.slice(0, 300) || null,
      },
    });
    await this.applyPaid(r.id, amount);
    await this.ctx.audit(
      a.rootId,
      a,
      'Payment recorded against request',
      'request',
      r.id,
      `${r.number} · ${amount.toFixed(2)} ${r.currency} by ${d.method}${d.reference ? ` · ref ${d.reference}` : ''} · ${tx.number}`,
      tx.correlationId,
    );
    return tx;
  }

  checkAmount(r: PayRequest, amount: number) {
    if (!(amount > 0))
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Enter the amount paid.',
        HttpStatus.BAD_REQUEST,
      );
    if (r.amountType === 'Fixed') {
      const left = r2(num(r.amount) - num(r.amountPaid));
      if (amount > left + 0.004)
        throw new AppException(
          PAY_ERRORS.INVALID,
          `Only ${left.toFixed(2)} ${r.currency} is left on ${r.number}.`,
          HttpStatus.BAD_REQUEST,
        );
      if (!r.allowPartial && Math.abs(amount - left) > 0.004)
        throw new AppException(
          PAY_ERRORS.INVALID,
          `${r.number} must be paid in full (${left.toFixed(2)} ${r.currency}).`,
          HttpStatus.BAD_REQUEST,
        );
    }
  }

  /** Recompute amountPaid / status from the request's succeeded transactions. */
  async applyPaid(requestId: string, _latest?: number) {
    const r = await this.db.payRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const sum = await this.db.payTransaction.aggregate({
      where: { requestId, status: 'Succeeded' },
      _sum: { captured: true },
    });
    const paid = r2(num(sum._sum.captured));
    let status = r.status;
    if (r.amountType === 'Fixed' && paid + 0.004 >= num(r.amount))
      status = 'Paid';
    else if (paid > 0)
      status = r.amountType === 'Flexible' ? 'Paid' : 'Partially Paid';
    await this.db.payRequest.update({
      where: { id: requestId },
      data: {
        amountPaid: dec(paid),
        status,
        ...(status === 'Paid' ? { closedAt: new Date() } : {}),
      },
    });
    return { paid, status };
  }

  /**
   * A provider confirmed a payment that carries this request's metadata: write it into the linked
   * module (with the provider charge as providerRef) and re-key the ledger row to that source.
   */
  async applyProviderPayment(rootId: string, txId: string) {
    const tx = await this.db.payTransaction.findUniqueOrThrow({
      where: { id: txId },
    });
    if (
      !tx.requestId ||
      tx.status !== 'Succeeded' ||
      tx.paymentId ||
      tx.depositId ||
      !tx.sourceKey.startsWith('stripe:')
    ) {
      if (tx.requestId) await this.applyPaid(tx.requestId);
      return;
    }
    const r = await this.db.payRequest.findUniqueOrThrow({
      where: { id: tx.requestId },
    });
    const src =
      r.env === 'live'
        ? await this.writeSource(
            r,
            num(tx.captured),
            'online',
            tx.providerChargeId,
          )
        : null;
    if (src)
      await this.db.payTransaction.update({
        where: { id: tx.id },
        data: {
          sourceKey: src.sourceKey,
          sourceType: src.sourceType,
          sourceId: src.sourceId,
          paymentId: src.paymentId,
          orderId: src.orderId,
          depositId: src.depositId,
          sourceRef: r.linkRef ?? r.number,
        },
      });
    await this.applyPaid(r.id);
    await this.ctx.audit(
      rootId,
      'System',
      'Request payment confirmed by provider',
      'request',
      r.id,
      `${r.number} · ${num(tx.captured).toFixed(2)} ${tx.currency} · ${tx.providerChargeId}`,
      tx.correlationId,
    );
  }

  // ── public page ────────────────────────────────────────────────────────

  async byToken(token: string) {
    const r = await this.db.payRequest.findUnique({
      where: { tokenHash: PayRequestsService.hashToken(token) },
    });
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'This payment link isn’t valid.',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  async publicView(token: string) {
    let r = await this.byToken(token);
    if (REQUEST_OPEN.includes(r.status) && r.expiresAt < new Date()) {
      await this.db.payRequest.update({
        where: { id: r.id },
        data: { status: 'Expired', closedAt: new Date() },
      });
      r = await this.byToken(token);
    }
    const biz = await this.ctx.business(r.businessId);
    const branding = (biz.branding ?? {}) as Record<string, unknown>;
    const methods = (r.methods as string[]) ?? [];
    const online = (
      await this.allowedMethods(r.businessId, r.env as PayEnv, r.currency)
    ).filter((m) => methods.includes(m.method) && m.provider === 'stripe');
    return {
      business: {
        name: biz.name,
        phone: biz.phone,
        address: biz.address,
        logo: typeof branding.logoUrl === 'string' ? branding.logoUrl : null,
      },
      test: r.env === 'test',
      status: r.status,
      amountType: r.amountType,
      amountDue:
        r.amountType === 'Fixed' ? r2(num(r.amount) - num(r.amountPaid)) : null,
      minAmount: (await this.ctx.policy(r.businessId)).collection.minRequest,
      allowPartial: r.allowPartial,
      currency: r.currency,
      description: r.description,
      reference: r.reference,
      dueOn: r.dueOn ? r.dueOn.toISOString().slice(0, 10) : null,
      expiresAt: r.expiresAt.toISOString(),
      methods,
      canPayOnline: online.length > 0 && REQUEST_OPEN.includes(r.status),
      manualMethods: methods.filter((m) => !online.some((o) => o.method === m)),
      note: r.note,
      paid: num(r.amountPaid),
    };
  }

  async publicViewed(token: string) {
    const r = await this.byToken(token);
    if (!REQUEST_OPEN.includes(r.status)) return;
    await this.db.payRequest.update({
      where: { id: r.id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
        ...(r.status === 'Sent' || r.status === 'Open'
          ? { status: 'Viewed' }
          : {}),
      },
    });
  }

  /** Opens a Stripe Checkout session on the merchant's account for this request (or the part being paid). */
  async publicCheckout(token: string, amount?: number | null) {
    const r = await this.byToken(token);
    if (!REQUEST_OPEN.includes(r.status) || r.expiresAt < new Date())
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        r.status === 'Paid'
          ? 'This request is already paid — thank you.'
          : 'This payment link has expired.',
        HttpStatus.CONFLICT,
      );
    const c = await this.stripe.connection(
      r.businessId,
      'stripe',
      r.env as PayEnv,
    );
    const pol = await this.ctx.policy(r.businessId);
    const left =
      r.amountType === 'Fixed' ? r2(num(r.amount) - num(r.amountPaid)) : null;
    const pay = r2(
      r.amountType === 'Flexible' || r.allowPartial
        ? Number(amount ?? left ?? 0)
        : (left ?? 0),
    );
    if (!(pay > 0))
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Enter the amount you want to pay.',
        HttpStatus.BAD_REQUEST,
      );
    if (left != null && pay > left + 0.004)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Only ${left.toFixed(2)} ${r.currency} is due.`,
        HttpStatus.BAD_REQUEST,
      );
    if (pay < pol.collection.minRequest)
      throw new AppException(
        PAY_ERRORS.AMOUNT_OUT_OF_RANGE,
        `The minimum payment is ${pol.collection.minRequest} ${r.currency}.`,
        HttpStatus.BAD_REQUEST,
      );
    const cust = r.customerId
      ? await this.db.customer.findUnique({
          where: { id: r.customerId },
          select: { email: true },
        })
      : null;
    const fe = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const manual =
      pol.collection.captureMode !== 'Automatic' &&
      ((r.linkType === 'Booking' &&
        pol.collection.manualCaptureFor.includes('Booking deposits')) ||
        (pol.collection.manualCaptureFor.includes(
          'Requests above the review threshold',
        ) &&
          pay >= pol.risk.manualReviewAbove));
    const corr = corrId();
    const session = await this.stripe.checkout(c!, {
      amount: pay,
      currency: r.currency,
      name: r.description,
      description: r.reference ?? undefined,
      email: cust?.email ?? null,
      capture: manual ? 'manual' : 'automatic',
      successUrl: r.redirectUrl || `${fe}/pay/${token}?done=1`,
      cancelUrl: `${fe}/pay/${token}`,
      methods: (r.methods as string[]) ?? [],
      metadata: {
        noxtill_business: r.businessId,
        noxtill_request: r.id,
        noxtill_ref: r.number,
        noxtill_customer: r.customerId ?? '',
        noxtill_branch: r.branchId ?? '',
        noxtill_channel: 'Payment Link',
        noxtill_corr: corr,
        noxtill_env: r.env,
      },
      idem: `checkout:${r.id}:${pay.toFixed(2)}:${num(r.amountPaid).toFixed(2)}:${Math.floor(Date.now() / 600000)}`,
    });
    await this.db.payRequest.update({
      where: { id: r.id },
      data: { checkoutSessionId: session.id },
    });
    return { url: session.url };
  }

  moduleOf(linkType: string | null) {
    return linkType ? (LINK_MODULE[linkType] ?? 'Orders') : 'Standalone';
  }
}
