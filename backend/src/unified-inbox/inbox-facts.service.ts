import { Injectable } from '@nestjs/common';
import { InboxConversation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';

export interface OrderFact {
  id: string;
  orderNo: number;
  status: string;
  total: number;
  paid: number;
  createdAt: Date;
  delivery: {
    status: string;
    assignedAt: Date | null;
    promisedAt: Date | null;
    deliveredAt: Date | null;
    riderName: string | null;
    failureReason: string | null;
  } | null;
}

export interface BookingFact {
  id: string;
  bookingNo: number | null;
  service: string;
  staff: string | null;
  startsAt: Date;
  status: string;
}

export interface CustomerFacts {
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    createdAt: Date;
    tags: string[];
  };
  ordersCount: number;
  spent: number;
  outstanding: number;
  /** Part of the outstanding balance that has been owed 30+ days — Credit's own "30+" bucket. */
  overdue: number;
  lastPayment: { amount: number; method: string | null; at: Date } | null;
  bookingsCount: number;
  recentOrders: OrderFact[];
  openOrder: OrderFact | null;
  openQuotation: {
    id: string;
    orderNo: number;
    total: number;
    status: string;
    sentAt: Date | null;
  } | null;
  bookings: BookingFact[];
  upcoming: BookingFact | null;
  lastReview: { stars: number; message: string | null; at: Date } | null;
}

export interface ProductFact {
  id: string;
  name: string;
  price: number;
  stock: number;
  isService: boolean;
}

export interface ConversationFacts {
  business: {
    name: string;
    currency: string;
    locale: string;
    timezone: string;
  };
  customer: CustomerFacts | null;
  products: ProductFact[];
}

export interface ContextCard {
  t: string;
  d: string;
  tone: 'green' | 'red' | 'amber' | 'blue' | 'neutral';
}

export interface ContextAction {
  label: string;
  /** In-inbox action the frontend knows how to perform, or a route to open. */
  kind:
    | 'order'
    | 'customer360'
    | 'credit'
    | 'customer'
    | 'bookings'
    | 'create-customer'
    | 'close'
    | 'link';
  ref?: string;
  href?: string;
}

const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'in_progress'];

/**
 * Reads the real records behind a conversation. Explicit `businessId` everywhere (raw
 * PrismaService) because the same facts feed webhook-time AI drafting, where there is no request
 * tenant. Nothing here estimates — a value that is not on a record is simply absent.
 */
@Injectable()
export class InboxFactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locale: LocaleService,
  ) {}

  async business(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { name: true, currency: true, locale: true, timezone: true },
    });
  }

  async forConversation(
    businessId: string,
    conversation: Pick<InboxConversation, 'customerId'>,
    lastInboundText?: string,
  ): Promise<ConversationFacts> {
    const business = await this.business(businessId);
    const customer = conversation.customerId
      ? await this.customerFacts(businessId, conversation.customerId)
      : null;
    const products = lastInboundText
      ? await this.productMentions(businessId, lastInboundText)
      : [];
    return { business, customer, products };
  }

  async customerFacts(
    businessId: string,
    customerId: string,
  ): Promise<CustomerFacts | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        createdAt: true,
        tags: true,
      },
    });
    if (!customer) return null;

    const [
      orderAgg,
      recent,
      quotation,
      credit,
      lastPaymentEntry,
      bookingsCount,
      bookings,
      review,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          businessId,
          customerId,
          isQuotation: false,
          status: { not: 'cancelled' },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.findMany({
        where: { businessId, customerId, isQuotation: false },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          orderNo: true,
          status: true,
          total: true,
          createdAt: true,
          payments: { select: { amount: true, method: true, createdAt: true } },
          delivery: {
            select: {
              status: true,
              assignedAt: true,
              promisedAt: true,
              deliveredAt: true,
              failureReason: true,
              rider: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.order.findFirst({
        where: {
          businessId,
          customerId,
          isQuotation: true,
          quotationStatus: { in: ['sent', 'accepted'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          total: true,
          quotationStatus: true,
          quotationSentAt: true,
        },
      }),
      this.prisma.$queryRaw<
        {
          balance: string | number | null;
          days_outstanding: number | bigint | null;
        }[]
      >`
        SELECT balance, days_outstanding FROM v_credit_balances
        WHERE business_id = ${businessId} AND customer_id = ${customerId}
      `,
      this.prisma.creditEntry.findFirst({
        where: { businessId, customerId, kind: 'payment' },
        orderBy: { createdAt: 'desc' },
        select: { amount: true, method: true, createdAt: true },
      }),
      this.prisma.appointment.count({ where: { businessId, customerId } }),
      this.prisma.appointment.findMany({
        where: { businessId, customerId },
        orderBy: { startsAt: 'desc' },
        take: 6,
        select: {
          id: true,
          bookingNo: true,
          startsAt: true,
          status: true,
          service: { select: { name: true } },
          staffUser: { select: { user: { select: { name: true } } } },
        },
      }),
      this.prisma.reviewRequest.findFirst({
        where: { businessId, customerId, stars: { not: null } },
        orderBy: { respondedAt: 'desc' },
        select: {
          stars: true,
          message: true,
          respondedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const recentOrders: OrderFact[] = recent.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      total: Number(o.total),
      paid: o.payments
        .filter((p) => p.method !== 'credit')
        .reduce((s, p) => s + Number(p.amount), 0),
      createdAt: o.createdAt,
      delivery: o.delivery
        ? {
            status: o.delivery.status,
            assignedAt: o.delivery.assignedAt,
            promisedAt: o.delivery.promisedAt,
            deliveredAt: o.delivery.deliveredAt,
            riderName: o.delivery.rider?.name ?? null,
            failureReason: o.delivery.failureReason,
          }
        : null,
    }));
    const openOrder =
      recentOrders.find(
        (o) =>
          OPEN_ORDER_STATUSES.includes(o.status) ||
          (o.delivery !== null &&
            !['delivered', 'failed'].includes(o.delivery.status) &&
            o.status !== 'cancelled'),
      ) ?? null;

    const balance = credit[0] ? Number(credit[0].balance ?? 0) : 0;
    const days = credit[0] ? Number(credit[0].days_outstanding ?? 0) : 0;
    const outstanding = Math.max(0, balance);

    // Last payment: the newer of a credit repayment or a non-credit order payment.
    const orderPayments = recent.flatMap((o) =>
      o.payments.filter((p) => p.method !== 'credit'),
    );
    const newestOrderPayment = orderPayments.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];
    let lastPayment: CustomerFacts['lastPayment'] = null;
    if (lastPaymentEntry)
      lastPayment = {
        amount: Number(lastPaymentEntry.amount),
        method: lastPaymentEntry.method,
        at: lastPaymentEntry.createdAt,
      };
    if (
      newestOrderPayment &&
      (!lastPayment || newestOrderPayment.createdAt > lastPayment.at)
    ) {
      lastPayment = {
        amount: Number(newestOrderPayment.amount),
        method: newestOrderPayment.method,
        at: newestOrderPayment.createdAt,
      };
    }

    const bookingFacts: BookingFact[] = bookings.map((b) => ({
      id: b.id,
      bookingNo: b.bookingNo,
      service: b.service.name,
      staff: b.staffUser?.user.name ?? null,
      startsAt: b.startsAt,
      status: b.status,
    }));
    const now = Date.now();
    const upcoming =
      [...bookingFacts]
        .filter(
          (b) =>
            b.startsAt.getTime() >= now &&
            ['requested', 'booked', 'confirmed'].includes(b.status),
        )
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;

    return {
      customer: {
        ...customer,
        tags: Array.isArray(customer.tags)
          ? (customer.tags as unknown[]).map(String)
          : [],
      },
      ordersCount: orderAgg._count._all,
      spent: Number(orderAgg._sum.total ?? 0),
      outstanding,
      overdue: outstanding > 0 && days >= 30 ? outstanding : 0,
      lastPayment,
      bookingsCount,
      recentOrders,
      openOrder,
      openQuotation: quotation
        ? {
            id: quotation.id,
            orderNo: quotation.orderNo,
            total: Number(quotation.total),
            status: quotation.quotationStatus ?? 'sent',
            sentAt: quotation.quotationSentAt,
          }
        : null,
      bookings: bookingFacts,
      upcoming,
      lastReview: review?.stars
        ? {
            stars: review.stars,
            message: review.message,
            at: review.respondedAt ?? review.createdAt,
          }
        : null,
    };
  }

  /**
   * Products the customer named exactly (whole product name appears in their message). Exact-name
   * matching only: a partial or fuzzy match would put a product in a draft the customer never asked about.
   */
  async productMentions(
    businessId: string,
    text: string,
  ): Promise<ProductFact[]> {
    const lower = text.toLowerCase();
    if (lower.trim().length < 3) return [];
    const products = await this.prisma.product.findMany({
      where: { businessId, active: true },
      select: {
        id: true,
        name: true,
        sellingPrice: true,
        stockQty: true,
        kind: true,
      },
      orderBy: { name: 'asc' },
      take: 2000,
    });
    return products
      .filter(
        (p) =>
          p.name.trim().length >= 3 &&
          lower.includes(p.name.trim().toLowerCase()),
      )
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.sellingPrice),
        stock: p.stockQty,
        isService: p.kind !== 'product',
      }));
  }

  money(amount: number, business: ConversationFacts['business']): string {
    if (!Number.isInteger(Math.round(amount * 100) / 100)) {
      return this.locale.formatCurrency(amount, business);
    }
    return new Intl.NumberFormat(business.locale, {
      style: 'currency',
      currency: business.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  time(date: Date, business: ConversationFacts['business']): string {
    return new Intl.DateTimeFormat(business.locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: business.timezone,
    }).format(date);
  }

  dateTime(date: Date, business: ConversationFacts['business']): string {
    return new Intl.DateTimeFormat(business.locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: business.timezone,
    }).format(date);
  }

  /** "What this is about" — one card per real record that bears on the conversation. */
  contextCards(facts: ConversationFacts): ContextCard[] {
    const cards: ContextCard[] = [];
    const b = facts.business;
    const c = facts.customer;
    if (c?.openOrder) {
      const o = c.openOrder;
      const d = o.delivery;
      if (d && d.status === 'failed') {
        cards.push({
          t: `Delivery for order #${o.orderNo} failed`,
          d: d.failureReason
            ? `Reason recorded: ${d.failureReason}.`
            : 'No reason was recorded on the delivery.',
          tone: 'red',
        });
      } else if (
        d &&
        ['assigned', 'picked_up', 'en_route'].includes(d.status)
      ) {
        const promised = d.promisedAt
          ? `promised by ${this.time(d.promisedAt, b)}`
          : 'no promised time recorded';
        const rider = d.riderName ? `${d.riderName}, ` : '';
        cards.push({
          t: `Order #${o.orderNo} is ${d.status === 'en_route' ? 'out for delivery' : d.status === 'picked_up' ? 'picked up' : 'with a rider'}`,
          d: `${rider}${d.assignedAt ? `assigned ${this.time(d.assignedAt, b)}, ` : ''}${promised}.`,
          tone:
            d.promisedAt && d.promisedAt.getTime() < Date.now()
              ? 'amber'
              : 'green',
        });
      } else {
        cards.push({
          t: `Order #${o.orderNo} is ${o.status.replace('_', ' ')}`,
          d: `${this.money(o.total, b)}, placed ${this.dateTime(o.createdAt, b)}.`,
          tone: 'blue',
        });
      }
      const due = Math.max(0, o.total - o.paid);
      cards.push(
        due <= 0.005
          ? {
              t: 'Paid in full',
              d: `${this.money(o.total, b)} paid. Nothing outstanding on this order.`,
              tone: 'green',
            }
          : {
              t: `${this.money(due, b)} not yet paid on order #${o.orderNo}`,
              d: `${this.money(o.paid, b)} of ${this.money(o.total, b)} received so far.`,
              tone: 'amber',
            },
      );
    }
    if (c && c.outstanding > 0) {
      cards.push({
        t: `${this.money(c.outstanding, b)} outstanding on credit`,
        d:
          c.overdue > 0
            ? 'Owed for 30 days or more.'
            : c.lastPayment
              ? `Last payment ${this.money(c.lastPayment.amount, b)} on ${this.dateTime(c.lastPayment.at, b)}.`
              : 'No payment recorded yet.',
        tone: c.overdue > 0 ? 'red' : 'amber',
      });
    }
    if (c?.upcoming) {
      const u = c.upcoming;
      cards.push({
        t: `Booking${u.bookingNo ? ` #${u.bookingNo}` : ''} · ${this.dateTime(u.startsAt, b)}`,
        d: `${u.service}${u.staff ? ` with ${u.staff}` : ''}, ${u.status}.`,
        tone: 'blue',
      });
    }
    if (c?.openQuotation) {
      const q = c.openQuotation;
      cards.push({
        t: `Quotation #${q.orderNo} · ${this.money(q.total, b)}`,
        d:
          q.status === 'accepted'
            ? 'Accepted and not yet turned into an order.'
            : `Sent${q.sentAt ? ` ${this.dateTime(q.sentAt, b)}` : ''}, no answer recorded yet.`,
        tone: 'amber',
      });
    }
    for (const p of facts.products) {
      cards.push({
        t: p.isService
          ? `${p.name} · ${this.money(p.price, b)}`
          : `${p.name} — ${p.stock > 0 ? `${p.stock} in stock` : 'out of stock'}`,
        d: p.isService
          ? 'A service on your price list.'
          : `${this.money(p.price, b)} on your price list.`,
        tone: p.isService || p.stock > 0 ? 'green' : 'red',
      });
    }
    if (!c)
      cards.push({
        t: 'No customer record',
        d: 'Nothing is created until someone decides to.',
        tone: 'neutral',
      });
    else if (cards.length === 0)
      cards.push({
        t: 'Nothing open for this customer',
        d: `${c.ordersCount} past order${c.ordersCount === 1 ? '' : 's'}, no open order, booking or balance.`,
        tone: 'neutral',
      });
    return cards;
  }

  /** The next steps a person would usually take, each pointing at a real record or screen. */
  actions(facts: ConversationFacts): ContextAction[] {
    const c = facts.customer;
    const out: ContextAction[] = [];
    if (!c) {
      out.push({ label: 'Create a customer record', kind: 'create-customer' });
      return out;
    }
    if (c.openOrder)
      out.push({
        label: `Open order #${c.openOrder.orderNo}`,
        kind: 'order',
        ref: c.openOrder.id,
      });
    if (c.outstanding > 0)
      out.push({
        label: 'Open the credit record',
        kind: 'credit',
        href: `/credit/${c.customer.id}`,
      });
    if (c.upcoming)
      out.push({
        label: 'Open bookings',
        kind: 'bookings',
        href: '/bookings/appointments',
      });
    if (c.openQuotation)
      out.push({
        label: `Open quotation #${c.openQuotation.orderNo}`,
        kind: 'order',
        ref: c.openQuotation.id,
      });
    out.push({ label: 'Open Customer 360', kind: 'customer360' });
    return out.slice(0, 4);
  }

  /** Fact lines for the AI draft prompt, each paired with the record it came from. */
  draftFacts(facts: ConversationFacts): { lines: string[]; sources: string[] } {
    const lines: string[] = [];
    const sources: string[] = [];
    const b = facts.business;
    const c = facts.customer;
    if (c) {
      lines.push(`Customer name: ${c.customer.name}.`);
      if (c.openOrder) {
        const o = c.openOrder;
        lines.push(
          `Their open order #${o.orderNo}: status ${o.status}, total ${this.money(o.total, b)}, paid ${this.money(o.paid, b)}, placed ${this.dateTime(o.createdAt, b)}.`,
        );
        sources.push(`order #${o.orderNo}`);
        if (o.delivery) {
          const d = o.delivery;
          lines.push(
            `Delivery for that order: status ${d.status}${d.riderName ? `, rider ${d.riderName}` : ''}${d.assignedAt ? `, assigned ${this.time(d.assignedAt, b)}` : ''}${d.promisedAt ? `, promised by ${this.time(d.promisedAt, b)}` : ', no promised time recorded'}${d.failureReason ? `, failure reason: ${d.failureReason}` : ''}.`,
          );
          sources.push('live delivery record');
        }
      }
      if (c.outstanding > 0) {
        lines.push(
          `Outstanding credit balance: ${this.money(c.outstanding, b)}${c.overdue > 0 ? ', owed 30+ days' : ''}.`,
        );
        sources.push('credit record');
      }
      if (c.upcoming) {
        lines.push(
          `Upcoming booking: ${c.upcoming.service}${c.upcoming.staff ? ` with ${c.upcoming.staff}` : ''} on ${this.dateTime(c.upcoming.startsAt, b)} (${c.upcoming.status}).`,
        );
        sources.push(
          `booking${c.upcoming.bookingNo ? ` #${c.upcoming.bookingNo}` : ''}`,
        );
      }
      if (c.openQuotation) {
        lines.push(
          `Quotation #${c.openQuotation.orderNo} for ${this.money(c.openQuotation.total, b)} is ${c.openQuotation.status}.`,
        );
        sources.push(`quotation #${c.openQuotation.orderNo}`);
      }
    }
    for (const p of facts.products) {
      lines.push(
        p.isService
          ? `Service "${p.name}" costs ${this.money(p.price, b)}.`
          : `Product "${p.name}": ${p.stock} in stock, price ${this.money(p.price, b)}.`,
      );
      if (!sources.includes('live stock count'))
        sources.push(p.isService ? 'price list' : 'live stock count');
    }
    return { lines, sources };
  }

  /**
   * Fills `[bracketed]` placeholders of a saved reply from real records. Anything without a real
   * value stays bracketed and is reported back, so a person sees exactly what still needs filling.
   */
  fillPlaceholders(
    text: string,
    facts: ConversationFacts,
    contactName: string,
  ): { text: string; unfilled: string[] } {
    const b = facts.business;
    const c = facts.customer;
    const o = c?.openOrder ?? c?.recentOrders[0] ?? null;
    // "[time]" is the booking's time in a booking reply and the dispatch time in a delivery reply.
    const bookingReply = /\[(date|service|staff)\]/i.test(text);
    const bookingTime = c?.upcoming ? this.time(c.upcoming.startsAt, b) : null;
    const dispatchTime = o?.delivery?.assignedAt
      ? this.time(o.delivery.assignedAt, b)
      : null;
    const values: Record<string, string | null> = {
      'customer name': c?.customer.name ?? contactName,
      name: c?.customer.name ?? contactName,
      'business name': b.name,
      branch: b.name,
      'order number': o ? `#${o.orderNo}` : null,
      'order total': o ? this.money(o.total, b) : null,
      amount:
        c && c.outstanding > 0
          ? this.money(c.outstanding, b)
          : o && o.total - o.paid > 0
            ? this.money(o.total - o.paid, b)
            : null,
      time: bookingReply ? bookingTime : dispatchTime,
      'dispatch time': dispatchTime,
      'promised time': o?.delivery?.promisedAt
        ? this.time(o.delivery.promisedAt, b)
        : null,
      service: c?.upcoming?.service ?? null,
      staff: c?.upcoming?.staff ?? null,
      date: c?.upcoming
        ? new Intl.DateTimeFormat(b.locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            timeZone: b.timezone,
          }).format(c.upcoming.startsAt)
        : null,
      'booking time': bookingTime,
      product: facts.products[0]?.name ?? null,
    };
    const unfilled: string[] = [];
    const filled = text.replace(/\[([^\]]{1,40})\]/g, (whole, raw: string) => {
      const key = raw.trim().toLowerCase();
      const value = values[key];
      if (value) return value;
      if (!unfilled.includes(raw)) unfilled.push(raw);
      return whole;
    });
    return { text: filled, unfilled };
  }
}
