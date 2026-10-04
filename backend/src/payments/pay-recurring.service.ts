import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Membership,
  MembershipPlan,
  MembershipStatus,
  PayConnection,
  PayMandate,
  Prisma,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import {
  PayActor,
  PayContextService,
  corrId,
  dec,
  num,
} from './pay-context.service';
import { PayIdempotencyService } from './pay-idempotency.service';
import { PayStripeService } from './pay-stripe.service';
import { PAY_ERRORS, fromMinor } from './payments.constants';

const PLAN_STATUS: Record<string, string> = {
  active: 'Active',
  pending: 'Pending',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/**
 * Recurring collections. Payments runs the mandate and its collection attempts; the source plan
 * (Customers › Memberships, Credit › Installments) owns entitlement, pricing and status. Online
 * memberships are billed on the business's own connected Stripe account; memberships created
 * before that were billed on Noxtill's platform account and are flagged as legacy (Stripe can't
 * move a subscription between accounts). Cash memberships and installment plans are manual
 * schedules collected at the counter.
 */
@Injectable()
export class PayRecurringService {
  private readonly logger = new Logger(PayRecurringService.name);

  constructor(
    private readonly ctx: PayContextService,
    private readonly stripe: PayStripeService,
    private readonly idem: PayIdempotencyService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const m = await this.db.payMandate.findFirst({
      where: { id, businessId: rootId },
    });
    if (!m)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Mandate not found',
        HttpStatus.NOT_FOUND,
      );
    return m;
  }

  /** Mirror memberships and installment plans into mandates (their source modules stay the owners). */
  async project(rootId: string) {
    const group = (await this.ctx.branches(rootId)).map((g) => g.id);
    const base = (await this.ctx.business(rootId)).currency;
    const mems = await this.db.membership.findMany({
      where: { businessId: { in: group } },
      include: { plan: true },
    });
    for (const m of mems) {
      const prev = await this.db.payMandate.findUnique({
        where: { membershipId: m.id },
      });
      const online = m.method === 'online';
      const legacy = online && !!m.stripeSubscriptionId && !prev?.connectionId;
      const status =
        m.status === MembershipStatus.cancelled
          ? 'Cancelled'
          : m.status === MembershipStatus.pending
            ? 'Incomplete'
            : m.status === MembershipStatus.expired
              ? 'Past Due'
              : prev?.status === 'Past Due' || prev?.status === 'Paused'
                ? prev.status
                : 'Active';
      const data = {
        env: prev?.env ?? 'live',
        kind: online ? 'provider' : 'manual',
        sourceModule: 'Memberships',
        customerId: m.customerId,
        planName: m.plan.name,
        planRef: m.plan.name.slice(0, 60),
        planStatus: PLAN_STATUS[m.status] ?? m.status,
        provider: online ? 'stripe' : 'manual',
        providerSubscriptionId:
          m.stripeSubscriptionId ?? prev?.providerSubscriptionId ?? null,
        amount: m.plan.price,
        currency: base,
        frequency: m.plan.interval === 'yearly' ? 'Yearly' : 'Monthly',
        nextChargeAt: ['Active', 'Past Due'].includes(status)
          ? m.currentPeriodEnd
          : null,
        status,
        legacyPlatform: legacy,
      };
      if (prev)
        await this.db.payMandate.update({ where: { id: prev.id }, data });
      else
        await this.db.payMandate.create({
          data: { businessId: rootId, membershipId: m.id, ...data },
        });
    }
    const plans = await this.db.installmentPlan.findMany({
      where: { businessId: { in: group } },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
    for (const p of plans) {
      const next = p.installments.find((i) => i.status === 'pending');
      const overdue = !!next && next.dueDate < new Date();
      const status =
        p.status === 'active'
          ? overdue
            ? 'Past Due'
            : 'Active'
          : p.status === 'completed'
            ? 'Completed'
            : 'Cancelled';
      const lastPaid = [...p.installments]
        .reverse()
        .find((i) => i.status === 'paid');
      const data = {
        env: 'live',
        kind: 'manual',
        sourceModule: 'Credit installments',
        customerId: p.customerId,
        planName: `Installment plan · ${p.installments.length} payments`,
        planRef: `Plan ${p.id.slice(0, 8)}`,
        planStatus:
          PLAN_STATUS[p.status] ??
          p.status.replace(/^./, (x) => x.toUpperCase()),
        provider: 'manual',
        amount: next ? next.amount : dec(0),
        currency: base,
        frequency: 'Schedule',
        nextChargeAt: next?.dueDate ?? null,
        lastChargeAt: lastPaid?.paidAt ?? null,
        status,
        attempts: overdue ? 1 : 0,
      };
      const prev = await this.db.payMandate.findUnique({
        where: { installmentPlanId: p.id },
      });
      const mand = prev
        ? await this.db.payMandate.update({ where: { id: prev.id }, data })
        : await this.db.payMandate.create({
            data: { businessId: rootId, installmentPlanId: p.id, ...data },
          });
      for (const i of p.installments.filter((x) => x.status === 'paid'))
        await this.db.payMandateAttempt.upsert({
          where: {
            mandateId_idemKey: {
              mandateId: mand.id,
              idemKey: `installment:${i.id}`,
            },
          },
          create: {
            businessId: rootId,
            mandateId: mand.id,
            dueAt: i.dueDate,
            status: 'Succeeded',
            amount: i.amount,
            idemKey: `installment:${i.id}`,
          },
          update: { status: 'Succeeded' },
        });
    }
  }

  // ── memberships on the business's own Stripe account ──────────────────────

  /** Online membership checkout on the connected account (replaces the platform-key checkout). */
  async startMembershipCheckout(
    m: Membership,
    plan: MembershipPlan,
    customer: { id: string; name: string; email: string | null; phone: string },
    successUrl: string,
    cancelUrl: string,
  ) {
    const rootId = await this.ctx.rootOf(m.businessId);
    const c = await this.stripe.connection(rootId, 'stripe', 'live');
    if (!c || !c.writeEnabled || !['Connected', 'Degraded'].includes(c.status))
      throw new AppException(
        'PAYMENT_PROVIDER_REQUIRED',
        'Online memberships are billed on your own Stripe account. Connect Stripe in Integrations (with payment access), or use cash.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const currency = (await this.ctx.business(rootId)).currency;
    const providerCustomer = await this.stripe.ensureCustomer(rootId, c, {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    });
    const price = await this.stripe.ensurePrice(
      rootId,
      c,
      {
        id: plan.id,
        name: plan.name,
        price: num(plan.price),
        interval: plan.interval,
      },
      currency,
    );
    const session = await this.stripe.subscriptionCheckout(c, {
      customer: providerCustomer,
      price,
      successUrl,
      cancelUrl,
      metadata: {
        noxtill_membership: m.id,
        noxtill_business: rootId,
        noxtill_customer: customer.id,
      },
      idem: `membership-checkout:${m.id}`,
    });
    await this.db.payMandate.upsert({
      where: { membershipId: m.id },
      create: {
        businessId: rootId,
        env: 'live',
        kind: 'provider',
        sourceModule: 'Memberships',
        membershipId: m.id,
        customerId: customer.id,
        planName: plan.name,
        planRef: plan.name.slice(0, 60),
        planStatus: 'Pending',
        provider: 'stripe',
        connectionId: c.id,
        providerCustomerId: providerCustomer,
        amount: plan.price,
        currency,
        frequency: plan.interval === 'yearly' ? 'Yearly' : 'Monthly',
        status: 'Incomplete',
      },
      update: {
        connectionId: c.id,
        providerCustomerId: providerCustomer,
        kind: 'provider',
        provider: 'stripe',
        legacyPlatform: false,
      },
    });
    return session.url;
  }

  /** A cash renewal collected at the counter is a real payment: record it with its attempt. */
  async recordCashRenewal(
    membershipId: string,
    periodEnd: Date | null,
    actorUserId?: string | null,
  ) {
    const m = await this.db.membership.findUnique({
      where: { id: membershipId },
      include: { plan: true },
    });
    if (!m) return;
    const rootId = await this.ctx.rootOf(m.businessId);
    await this.ctx.ensure(rootId);
    await this.project(rootId);
    const mand = await this.db.payMandate.findUnique({
      where: { membershipId },
    });
    const key = `membership:${m.id}:${(periodEnd ?? new Date()).toISOString().slice(0, 10)}`;
    const base = (await this.ctx.business(rootId)).currency;
    const names = await this.ctx.userNames([actorUserId]);
    const tx = await this.db.payTransaction.upsert({
      where: { businessId_sourceKey: { businessId: rootId, sourceKey: key } },
      create: {
        businessId: rootId,
        branchId: m.businessId,
        env: 'live',
        number: await this.ctx.number(rootId, 'tx'),
        origin: 'noxtill',
        sourceKey: key,
        sourceType: 'Membership',
        sourceId: m.id,
        sourceRef: m.plan.name.slice(0, 60),
        customerId: m.customerId,
        mandateId: mand?.id ?? null,
        provider: 'manual',
        channel: 'Recurring',
        method: 'Cash',
        status: 'Succeeded',
        authStatus: '—',
        captureStatus: 'Captured',
        amount: m.plan.price,
        captured: m.plan.price,
        fee: dec(0),
        feeSource: 'none',
        currency: base,
        fxRate: new Prisma.Decimal(1),
        reportAmount: m.plan.price,
        correlationId: corrId(),
        initiatedBy: (actorUserId ? names.get(actorUserId) : null) ?? 'Counter',
        createdById: actorUserId ?? null,
        occurredAt: new Date(),
        capturedAt: new Date(),
      },
      update: {},
    });
    if (mand)
      await this.db.payMandateAttempt.upsert({
        where: { mandateId_idemKey: { mandateId: mand.id, idemKey: key } },
        create: {
          businessId: rootId,
          mandateId: mand.id,
          txId: tx.id,
          dueAt: new Date(),
          status: 'Succeeded',
          amount: m.plan.price,
          idemKey: key,
        },
        update: {},
      });
    if (mand)
      await this.db.payMandate.update({
        where: { id: mand.id },
        data: { lastChargeAt: new Date(), status: 'Active', attempts: 0 },
      });
  }

  // ── mandate actions ───────────────────────────────────────────────────────

  private async provider(a: PayActor, m: PayMandate): Promise<PayConnection> {
    if (m.kind === 'manual')
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        `This is a manual schedule collected at the counter — manage it in ${m.sourceModule === 'Memberships' ? 'Customers › Memberships' : 'Credit › Installments'}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (m.legacyPlatform)
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        'This membership is billed on the Noxtill platform account (created before your Stripe connection) — cancel it in Customers › Memberships; new sign-ups use your own Stripe account.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const c = m.connectionId
      ? await this.db.payConnection.findUnique({
          where: { id: m.connectionId },
        })
      : null;
    this.stripe.assertCan(c, 'stripe', 'supportsRecurring');
    if (!m.providerSubscriptionId)
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        'The customer hasn’t completed the subscription checkout yet.',
        HttpStatus.CONFLICT,
      );
    return c!;
  }

  async pause(a: PayActor, id: string, pause: boolean) {
    this.ctx.need(
      a,
      'recover',
      pause ? 'Pausing a mandate' : 'Resuming a mandate',
    );
    const m = await this.must(a.rootId, id);
    const c = await this.provider(a, m);
    await this.stripe.subscriptionUpdate(
      c,
      m.providerSubscriptionId!,
      { pause_collection: pause ? { behavior: 'void' } : '' },
      `mandate:${m.id}:${pause ? 'pause' : 'resume'}:${Date.now()}`,
    );
    await this.db.payMandate.update({
      where: { id: m.id },
      data: { status: pause ? 'Paused' : 'Active' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      pause ? 'Collection paused' : 'Collection resumed',
      'mandate',
      m.id,
      `${m.planName} · ${m.providerSubscriptionId}`,
    );
  }

  async cancel(a: PayActor, id: string, reason: string) {
    this.ctx.need(a, 'recover', 'Cancelling a mandate');
    const m = await this.must(a.rootId, id);
    const c = await this.provider(a, m);
    await this.stripe.subscriptionCancel(
      c,
      m.providerSubscriptionId!,
      `mandate:${m.id}:cancel`,
    );
    await this.db.payMandate.update({
      where: { id: m.id },
      data: { status: 'Cancelled', nextChargeAt: null },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Mandate cancelled',
      'mandate',
      m.id,
      `${reason} · future collections stopped; the plan’s entitlement is managed in its own module`,
    );
  }

  async retry(a: PayActor, id: string) {
    this.ctx.need(a, 'recover', 'Retrying a mandate collection');
    const m = await this.must(a.rootId, id);
    const c = await this.provider(a, m);
    const open = await this.db.payMandateAttempt.findFirst({
      where: {
        mandateId: m.id,
        status: 'Failed',
        providerInvoiceId: { not: null },
      },
      orderBy: { dueAt: 'desc' },
    });
    if (!open?.providerInvoiceId)
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        'There is no failed invoice to retry.',
        HttpStatus.CONFLICT,
      );
    const paid = await this.db.payMandateAttempt.findFirst({
      where: { providerInvoiceId: open.providerInvoiceId, status: 'Succeeded' },
    });
    if (paid)
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        'This cycle is already paid — nothing was charged.',
        HttpStatus.CONFLICT,
      );
    const key = `retry:${open.providerInvoiceId}:${m.attempts}`;
    const { replay } = await this.idem.begin(a.rootId, key, 'mandate_retry', {
      invoice: open.providerInvoiceId,
    });
    if (replay)
      throw new AppException(
        PAY_ERRORS.IDEMPOTENT_REPLAY,
        'This retry already ran — nothing was charged twice.',
        HttpStatus.CONFLICT,
      );
    try {
      const inv = await this.stripe.invoicePay(c, open.providerInvoiceId, key);
      await this.idem.finish(key, inv.paid ? 'done' : 'failed', inv);
      await this.db.payMandate.update({
        where: { id: m.id },
        data: {
          attempts: m.attempts + 1,
          ...(inv.paid ? { status: 'Active', attempts: 0 } : {}),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Mandate retry',
        'mandate',
        m.id,
        `${open.providerInvoiceId} → ${inv.status}`,
      );
      return { paid: !!inv.paid };
    } catch (e) {
      await this.idem.finish(key, 'failed', { error: (e as Error).message });
      await this.db.payMandate.update({
        where: { id: m.id },
        data: { attempts: m.attempts + 1 },
      });
      throw new AppException(
        PAY_ERRORS.PROVIDER_ERROR,
        `Stripe declined the retry: ${(e as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ── provider events ───────────────────────────────────────────────────────

  async onCheckoutCompleted(
    rootId: string,
    c: PayConnection,
    s: {
      subscription?: string | null;
      customer?: string | null;
      metadata?: Record<string, string>;
    },
  ) {
    const memId = s.metadata?.noxtill_membership;
    if (!memId || !s.subscription) return;
    await this.db.membership
      .update({
        where: { id: memId },
        data: {
          stripeSubscriptionId: s.subscription,
          status: MembershipStatus.active,
        },
      })
      .catch(() => null);
    await this.db.payMandate.updateMany({
      where: { membershipId: memId },
      data: {
        providerSubscriptionId: s.subscription,
        providerCustomerId: s.customer ?? undefined,
        connectionId: c.id,
        status: 'Active',
        planStatus: 'Active',
        legacyPlatform: false,
      },
    });
  }

  async onInvoice(
    rootId: string,
    c: PayConnection,
    inv: {
      id: string;
      subscription?: string | null;
      charge?: string | null;
      amount_due: number;
      amount_paid: number;
      currency: string;
      status: string;
      lines?: { data?: { period?: { end?: number } }[] };
      next_payment_attempt?: number | null;
      created: number;
    },
    paid: boolean,
  ) {
    if (!inv.subscription) return;
    const m = await this.db.payMandate.findFirst({
      where: { businessId: rootId, providerSubscriptionId: inv.subscription },
    });
    if (!m) return;
    const tx = inv.charge
      ? await this.db.payTransaction.findFirst({
          where: { businessId: rootId, providerChargeId: inv.charge },
        })
      : null;
    if (tx)
      await this.db.payTransaction.update({
        where: { id: tx.id },
        data: {
          mandateId: m.id,
          sourceType: 'Membership',
          sourceId: m.membershipId,
          sourceRef: m.planRef,
          channel: 'Recurring',
        },
      });
    await this.db.payMandateAttempt.upsert({
      where: { providerInvoiceId: inv.id },
      create: {
        businessId: rootId,
        mandateId: m.id,
        txId: tx?.id ?? null,
        providerInvoiceId: inv.id,
        dueAt: new Date(inv.created * 1000),
        status: paid ? 'Succeeded' : 'Failed',
        amount: dec(
          fromMinor(paid ? inv.amount_paid : inv.amount_due, inv.currency),
        ),
        idemKey: `invoice:${inv.id}`,
      },
      update: {
        status: paid ? 'Succeeded' : 'Failed',
        txId: tx?.id ?? undefined,
      },
    });
    const periodEnd = inv.lines?.data?.[0]?.period?.end;
    if (paid) {
      await this.db.payMandate.update({
        where: { id: m.id },
        data: {
          status: 'Active',
          attempts: 0,
          lastChargeAt: new Date(),
          ...(periodEnd ? { nextChargeAt: new Date(periodEnd * 1000) } : {}),
        },
      });
      if (m.membershipId && periodEnd)
        await this.db.membership
          .update({
            where: { id: m.membershipId },
            data: {
              status: MembershipStatus.active,
              currentPeriodEnd: new Date(periodEnd * 1000),
            },
          })
          .catch(() => null);
    } else {
      await this.db.payMandate.update({
        where: { id: m.id },
        data: {
          status: 'Past Due',
          attempts: m.attempts + 1,
          nextChargeAt: inv.next_payment_attempt
            ? new Date(inv.next_payment_attempt * 1000)
            : m.nextChargeAt,
        },
      });
    }
    return tx;
  }

  async onSubscription(
    rootId: string,
    sub: {
      id: string;
      status: string;
      pause_collection?: unknown;
      current_period_end?: number;
    },
    deleted: boolean,
  ) {
    const m = await this.db.payMandate.findFirst({
      where: { businessId: rootId, providerSubscriptionId: sub.id },
    });
    if (!m) return;
    const status =
      deleted || sub.status === 'canceled'
        ? 'Cancelled'
        : sub.pause_collection
          ? 'Paused'
          : sub.status === 'past_due' || sub.status === 'unpaid'
            ? 'Past Due'
            : sub.status === 'incomplete'
              ? 'Incomplete'
              : 'Active';
    await this.db.payMandate.update({
      where: { id: m.id },
      data: {
        status,
        ...(sub.current_period_end && status !== 'Cancelled'
          ? { nextChargeAt: new Date(sub.current_period_end * 1000) }
          : {}),
      },
    });
    if (m.membershipId && status === 'Cancelled')
      await this.db.membership
        .update({
          where: { id: m.membershipId },
          data: { status: MembershipStatus.cancelled },
        })
        .catch(() => null);
  }

  /** Cancel a membership's subscription on the account it lives on (connected or legacy platform). */
  async cancelMembershipSubscription(
    membershipId: string,
  ): Promise<'connected' | 'legacy' | 'none'> {
    const m = await this.db.payMandate.findUnique({ where: { membershipId } });
    if (!m?.providerSubscriptionId || m.legacyPlatform || !m.connectionId)
      return m?.legacyPlatform ? 'legacy' : 'none';
    const c = await this.db.payConnection.findUnique({
      where: { id: m.connectionId },
    });
    if (!c) return 'legacy';
    await this.stripe.subscriptionCancel(
      c,
      m.providerSubscriptionId,
      `membership-cancel:${membershipId}`,
    );
    await this.db.payMandate.update({
      where: { id: m.id },
      data: { status: 'Cancelled', nextChargeAt: null },
    });
    return 'connected';
  }

  frontendUrl() {
    return (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}
