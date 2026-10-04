import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';
import { PayActor, PayContextService, num } from './pay-context.service';
import { PayLedgerService } from './pay-ledger.service';
import { PayIdempotencyService } from './pay-idempotency.service';
import { PayStripeService, SEvent } from './pay-stripe.service';
import type { PayMessagingService } from './pay-messaging.service';
import { PayRequestsService } from './pay-requests.service';
import { PayApprovalsService } from './pay-approvals.service';
import { PayRefundsService } from './pay-refunds.service';
import type { PayAiService } from './pay-ai.service';
import { PayRecoveryService } from './pay-recovery.service';
import { PayDisputesService } from './pay-disputes.service';
import { PayRecurringService } from './pay-recurring.service';
import { PayRoutingService } from './pay-routing.service';
import { PayReconService } from './pay-recon.service';
import { PayPolicyService } from './pay-policy.service';
import { PayApplyService } from './pay-apply.service';
import { PayDataService, parseScope } from './pay-data.service';
import { PayViewsService } from './pay-views.service';
import { PayDrawersService } from './pay-drawers.service';
import { PayDocsService } from './pay-docs.service';
import {
  ProviderTimeoutError,
  StripeCall,
  StripeTransport,
  signStripePayload,
  verifyStripeSignature,
} from './providers/stripe.transport';
import { SECS, TABS, normalizeFailure } from './payments.constants';

/** In-memory Stripe: records every call; individual endpoints can be told to time out or fail. */
class FakeStripe implements StripeTransport {
  calls: StripeCall[] = [];
  refunds: Record<string, unknown>[] = [];
  charges = new Map<string, Record<string, unknown>>();
  payoutTxns = new Map<string, Record<string, unknown>[]>();
  timeoutNext = false;
  configured() {
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async request<T>(c: StripeCall): Promise<T> {
    this.calls.push(c);
    const p = c.params ?? {};
    if (c.method === 'POST' && c.path === '/refunds') {
      const rf = {
        id: `re_${this.refunds.length + 1}`,
        amount: p.amount,
        currency: 'usd',
        status: 'succeeded',
        charge: p.charge,
        created: Math.floor(Date.now() / 1000),
        metadata: p.metadata,
      };
      this.refunds.push(rf);
      if (this.timeoutNext) {
        this.timeoutNext = false;
        throw new ProviderTimeoutError('timed out');
      }
      return rf as T;
    }
    if (c.method === 'GET' && c.path === '/refunds')
      return {
        data: this.refunds.filter((r) => r.charge === p.charge),
        has_more: false,
      } as T;
    if (c.method === 'POST' && c.path === '/checkout/sessions')
      return {
        id: 'cs_test_1',
        url: 'https://checkout.stripe.test/cs_test_1',
      } as T;
    if (c.method === 'GET' && c.path.startsWith('/charges/'))
      return this.charges.get(c.path.slice(9)) as T;
    if (c.method === 'GET' && c.path === '/balance_transactions' && p.payout)
      return {
        data: this.payoutTxns.get(p.payout as string) ?? [],
        has_more: false,
      } as T;
    if (c.method === 'POST' && c.path === '/customers')
      return { id: 'cus_fake1' } as T;
    if (c.method === 'POST' && c.path === '/products')
      return { id: 'prod_fake1' } as T;
    if (c.method === 'POST' && c.path === '/prices')
      return { id: 'price_fake1' } as T;
    if (c.method === 'POST' && /^\/disputes\/[^/]+\/close$/.test(c.path))
      return { id: c.path.split('/')[2], status: 'lost' } as T;
    if (c.method === 'POST' && c.path.startsWith('/disputes/'))
      return { id: c.path.split('/')[2], status: 'under_review' } as T;
    if (c.method === 'POST' && /^\/invoices\/[^/]+\/pay$/.test(c.path))
      return { id: c.path.split('/')[2], status: 'paid', paid: true } as T;
    if (c.path.startsWith('/subscriptions/'))
      return {
        id: c.path.split('/')[2],
        status: c.method === 'DELETE' ? 'canceled' : 'active',
      } as T;
    if (c.method === 'GET') return { data: [], has_more: false } as T;
    return {} as T;
  }
}

const codeOf = (e: unknown) =>
  ((e as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;
async function expectCode(p: Promise<unknown>, code: string) {
  let caught: unknown = null;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(codeOf(caught) ?? (caught as Error)?.message).toBe(code);
}

describe('Payments & Billing (real DB)', () => {
  const stamp = Date.now();
  let prisma: PrismaService;
  let ctx: PayContextService;
  let ledger: PayLedgerService;
  let stripe: PayStripeService;
  let requests: PayRequestsService;
  let refunds: PayRefundsService;
  let recovery: PayRecoveryService;
  let recon: PayReconService;
  let routing: PayRoutingService;
  let policy: PayPolicyService;
  let apply: PayApplyService;
  let views: PayViewsService;
  let data: PayDataService;
  let drawers: PayDrawersService;
  let docs: PayDocsService;
  let disputes: PayDisputesService;
  let recurring: PayRecurringService;
  let approvals: PayApprovalsService;
  let fake: FakeStripe;
  let businessId: string;
  let customerId: string;
  let owner: PayActor;
  let manager: PayActor;
  let staff: PayActor;
  let orderNo = 1;
  const sent: unknown[] = [];

  const order = async (
    total: number,
    method: 'cash' | 'card' | null,
    providerRef?: string,
  ) => {
    const o = await prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        status: 'completed',
        subtotal: total,
        total,
        customerId,
      },
    });
    if (method)
      await prisma.payment.create({
        data: { orderId: o.id, method, amount: total, providerRef },
      });
    return o;
  };
  const charge = (
    id: string,
    amount: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    amount: amount * 100,
    amount_captured: amount * 100,
    amount_refunded: 0,
    captured: true,
    refunded: false,
    disputed: false,
    currency: 'usd',
    created: Math.floor(Date.now() / 1000),
    status: 'succeeded',
    paid: true,
    payment_method_details: {
      type: 'card',
      card: { brand: 'visa', last4: '4242' },
    },
    ...extra,
  });
  const event = (
    id: string,
    type: string,
    object: Record<string, unknown>,
    account = 'acct_test1',
  ): SEvent => ({
    id,
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: true,
    account,
    data: { object },
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const biz = await prisma.business.create({
      data: {
        name: 'Payments Test Biz',
        slug: `pay-test-${stamp}`,
        currency: 'USD',
        timezone: 'UTC',
        country: 'US',
      },
    });
    businessId = biz.id;
    const mk = (name: string, tag: string) =>
      prisma.user.create({
        data: {
          name,
          email: `pay-${tag}-${stamp}@example.com`,
          passwordHash: 'x',
        },
      });
    const [o, m, s] = await Promise.all([
      mk('Olive Owner', 'o'),
      mk('Max Manager', 'm'),
      mk('Sam Staff', 's'),
    ]);
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: o.id, role: Role.owner },
        { businessId, userId: m.id, role: Role.manager },
        { businessId, userId: s.id, role: Role.staff },
      ],
    });
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${stamp}`,
          name: 'Pat Payer',
          email: `pat-${stamp}@example.com`,
        },
      })
    ).id;

    fake = new FakeStripe();
    const config = new ConfigService({
      FRONTEND_URL: 'http://localhost:3000',
      PAY_LINK_SECRET: 'spec-secret',
    });
    ctx = new PayContextService(prisma, new CapabilitiesService(prisma));
    ledger = new PayLedgerService(ctx);
    const idem = new PayIdempotencyService(prisma);
    stripe = new PayStripeService(ctx, fake);
    const msg = {
      send: (p: unknown) => (
        sent.push(p),
        Promise.resolve({
          message: { id: 'm1', status: 'queued' },
          error: null,
          channel: 'whatsapp',
        })
      ),
    } as unknown as PayMessagingService;
    const ai = {
      draft: (_b: string, _p: string, _f: string[], fallback: string) =>
        Promise.resolve({ text: fallback, source: 'Facts template' }),
      disputeDraft: () =>
        Promise.resolve({ text: 'facts', source: 'Facts template' }),
    } as unknown as PayAiService;
    requests = new PayRequestsService(ctx, config, stripe, msg);
    approvals = new PayApprovalsService(ctx);
    refunds = new PayRefundsService(ctx, stripe, idem, ledger, approvals);
    recovery = new PayRecoveryService(ctx, stripe, idem, msg, requests, ai);
    disputes = new PayDisputesService(ctx, stripe, approvals, idem, ai);
    recurring = new PayRecurringService(ctx, stripe, idem, config);
    recon = new PayReconService(ctx);
    routing = new PayRoutingService(ctx, stripe);
    policy = new PayPolicyService(ctx, approvals);
    apply = new PayApplyService(
      ctx,
      stripe,
      requests,
      recovery,
      refunds,
      disputes,
      recurring,
      msg,
      ledger,
      recon,
      {} as IntegrationsService,
      {} as ConnectorRegistry,
    );
    data = new PayDataService(ctx);
    views = new PayViewsService(ctx, data, routing, requests, ledger, stripe);
    drawers = new PayDrawersService(
      ctx,
      data,
      views,
      requests,
      refunds,
      disputes,
      stripe,
      config,
    );
    docs = new PayDocsService(ctx, data, views);

    const actor = (id: string, role: Role) =>
      ctx.actor({ sub: id, businessId, role } as AuthenticatedUser);
    owner = await actor(o.id, Role.owner);
    manager = await actor(m.id, Role.manager);
    staff = await actor(s.id, Role.staff);

    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.stripe,
        status: 'connected',
        meta: { accountId: 'acct_test1', livemode: true, scope: 'read_write' },
      },
    });
    await stripe.refreshConnections(businessId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const t of [
        'pay_settings',
        'pay_policy_versions',
        'pay_connections',
        'pay_transactions',
        'pay_events',
        'pay_idempotency',
        'pay_requests',
        'pay_request_deliveries',
        'pay_recovery_cases',
        'pay_refunds',
        'pay_disputes',
        'pay_dispute_evidence',
        'pay_payouts',
        'pay_balance_txns',
        'pay_balance_snapshots',
        'pay_mandates',
        'pay_mandate_attempts',
        'pay_method_configs',
        'pay_routing_rules',
        'pay_routing_rule_versions',
        'pay_recon_items',
        'pay_recon_resolutions',
        'pay_approvals',
        'pay_audit',
        'pay_outbox',
        'pay_saved_views',
        'pay_provider_customers',
        'pay_plan_prices',
        'external_payments',
        'memberships',
        'membership_plans',
        'integrations',
        'returns',
        'credit_entries',
        'customers',
        'notifications',
      ])
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      await tx.$executeRawUnsafe(
        'DELETE p FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.business_id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM orders WHERE business_id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM business_users WHERE business_id = ?',
        businessId,
      );
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${stamp}@example.com` } },
    });
    await prisma.$disconnect();
  });

  it('resolves field-level rights per role (owner all, staff own payments only)', () => {
    expect(owner.admin && owner.fees && owner.pii && owner.raw).toBe(true);
    expect(manager.request && manager.recover && manager.fees).toBe(true);
    expect(manager.refund || manager.admin).toBe(false);
    expect(staff.ownOnly).toBe(true);
    expect(staff.fees).toBe(false);
  });

  it('projects Noxtill payments into the ledger once, and cancels a removed source', async () => {
    const o1 = await order(120, 'cash');
    await order(80, null);
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'payment',
        amount: 30,
        method: 'cash',
      },
    });
    const first = await ledger.project(businessId);
    expect(first.created).toBe(2);
    expect((await ledger.project(businessId)).created).toBe(0);
    const p = await prisma.payment.findFirstOrThrow({
      where: { orderId: o1.id },
    });
    const tx = await prisma.payTransaction.findUniqueOrThrow({
      where: { paymentId: p.id },
    });
    expect(tx.status).toBe('Succeeded');
    expect(tx.feeSource).toBe('none');
    await prisma.payment.delete({ where: { id: p.id } });
    expect((await ledger.project(businessId)).cancelled).toBe(1);
    expect(
      (await prisma.payTransaction.findUniqueOrThrow({ where: { id: tx.id } }))
        .status,
    ).toBe('Cancelled');
  });

  it('builds the overview from real rows and keeps test data out of live totals', async () => {
    await prisma.payTransaction.create({
      data: {
        businessId,
        env: 'test',
        number: 'PAY-T1',
        origin: 'provider',
        sourceKey: `test:${stamp}`,
        sourceType: 'Provider',
        provider: 'stripe',
        channel: 'Website',
        method: 'Card',
        status: 'Succeeded',
        authStatus: 'Authorized',
        captureStatus: 'Captured',
        amount: 999,
        captured: 999,
        feeSource: 'pending',
        currency: 'USD',
        reportAmount: 999,
        correlationId: 'c',
        initiatedBy: 'x',
        occurredAt: new Date(),
      },
    });
    const live = await views.screen(
      owner,
      parseScope({ tab: 'overview', env: 'live' }),
    );
    const kpis = (
      live.rows[0] as { blocks: { kpis: { k: string; v: string }[] }[] }
    ).blocks[0].kpis;
    expect(kpis.find((k) => k.k === 'm:gross')?.v).toBe('$30');
    const test = await views.screen(
      owner,
      parseScope({ tab: 'overview', env: 'test' }),
    );
    const tk = (
      test.rows[0] as { blocks: { kpis: { k: string; v: string }[] }[] }
    ).blocks[0].kpis;
    expect(tk.find((k) => k.k === 'm:gross')?.v).toBe('$999');
  });

  it('hides fees from a role without payments.fees', async () => {
    const s = await views.screen(
      staff,
      parseScope({ tab: 'overview', env: 'live' }),
    );
    const kpis = (
      s.rows[0] as { blocks: { kpis: { k: string; v: string }[] }[] }
    ).blocks[0].kpis;
    expect(kpis.find((k) => k.k === 'm:fees')?.v).toBe('🔒 Restricted');
  });

  it('creates a request with an opaque link, refuses a duplicate open request and is paid by a recorded payment', async () => {
    const o = await order(250, null);
    const r = await requests.create(owner, {
      env: 'live',
      customerId,
      contact: 'whatsapp',
      linkType: 'Invoice',
      linkId: o.id,
      amountType: 'Fixed',
      amount: 250,
      currency: 'USD',
      description: 'Invoice balance',
      methods: ['Card', 'Bank transfer'],
    });
    expect(sent.length).toBeGreaterThan(0);
    expect(r.status).toBe('Sent');
    const url = requests.url(r);
    const token = url.split('/pay/')[1];
    expect(url).not.toContain(r.id);
    expect((await requests.publicView(token)).amountDue).toBe(250);
    await expectCode(
      requests.create(owner, {
        env: 'live',
        customerId,
        contact: 'none',
        linkType: 'Invoice',
        linkId: o.id,
        amountType: 'Fixed',
        amount: 10,
        currency: 'USD',
        description: 'dup',
      }),
      'DUPLICATE_OPEN_REQUEST',
    );
    await expectCode(
      requests.recordManual(owner, r.id, { amount: 100, method: 'online' }),
      'PAYMENTS_INVALID',
    ); // must pay in full
    await requests.recordManual(owner, r.id, {
      amount: 250,
      method: 'online',
      reference: 'BANK-1',
    });
    expect(
      (await prisma.payRequest.findUniqueOrThrow({ where: { id: r.id } }))
        .status,
    ).toBe('Paid');
    const pays = await prisma.payment.findMany({ where: { orderId: o.id } });
    expect(pays.map((p) => num(p.amount))).toEqual([250]);
    await ledger.project(businessId);
    expect(
      await prisma.payTransaction.count({
        where: { orderId: o.id, status: 'Succeeded' },
      }),
    ).toBe(1);
    // Expiring rotates the token: the old link stops working.
    const r2 = await requests.create(owner, {
      env: 'live',
      customerId,
      contact: 'none',
      amountType: 'Flexible',
      currency: 'USD',
      description: 'Tip jar',
    });
    const t2 = requests.url(r2).split('/pay/')[1];
    await requests.expire(owner, r2.id);
    await expectCode(requests.publicView(t2), 'PAYMENTS_NOT_FOUND');
  });

  it('opens Stripe Checkout on the connected account for a public payment', async () => {
    const r = await requests.create(owner, {
      env: 'live',
      customerId,
      contact: 'none',
      amountType: 'Fixed',
      amount: 40,
      currency: 'USD',
      description: 'Consultation',
    });
    const out = await requests.publicCheckout(
      requests.url(r).split('/pay/')[1],
    );
    expect(out.url).toContain('checkout.stripe.test');
    const call = fake.calls.find((c) => c.path === '/checkout/sessions')!;
    expect(call.account).toBe('acct_test1');
    expect(call.idempotencyKey).toBeTruthy();
  });

  it('applies a verified provider event once: request paid, Payment with providerRef, duplicates and stale events ignored', async () => {
    const o = await order(60, null);
    const r = await requests.create(owner, {
      env: 'live',
      customerId,
      contact: 'none',
      linkType: 'Invoice',
      linkId: o.id,
      amountType: 'Fixed',
      amount: 60,
      currency: 'USD',
      description: 'Pay me',
    });
    const ch = charge('ch_paid1', 60, {
      metadata: { noxtill_request: r.id, noxtill_customer: customerId },
    });
    fake.charges.set('ch_paid1', ch);
    expect(
      (
        await apply.handleEvent(
          event('evt_1', 'charge.succeeded', ch),
          'Verified',
        )
      ).processing,
    ).toBe('Applied');
    expect(
      (await prisma.payRequest.findUniqueOrThrow({ where: { id: r.id } }))
        .status,
    ).toBe('Paid');
    const pay = await prisma.payment.findFirstOrThrow({
      where: { orderId: o.id },
    });
    expect(pay.providerRef).toBe('ch_paid1');
    expect(
      (
        await apply.handleEvent(
          event('evt_1', 'charge.succeeded', ch),
          'Verified',
        )
      ).processing,
    ).toBe('Duplicate');
    const older = { ...ch, status: 'pending', captured: false };
    fake.charges.set('ch_paid1', older);
    expect(
      (
        await apply.handleEvent(
          event('evt_2', 'charge.pending', older),
          'Verified',
        )
      ).processing,
    ).toBe('Ignored (stale)');
    expect(
      (
        await prisma.payTransaction.findFirstOrThrow({
          where: { providerChargeId: 'ch_paid1' },
        })
      ).status,
    ).toBe('Succeeded');
    expect(
      (
        await apply.handleEvent(
          event('evt_3', 'charge.succeeded', ch, 'acct_nobody'),
          'Verified',
        )
      ).processing,
    ).toBe('Unroutable');
    await ledger.project(businessId);
    expect(
      await prisma.payTransaction.count({
        where: { orderId: o.id, status: 'Succeeded' },
      }),
    ).toBe(1);
  });

  it('executes an approved card refund once, never above the refundable balance', async () => {
    const tx = await prisma.payTransaction.findFirstOrThrow({
      where: { providerChargeId: 'ch_paid1' },
    });
    const ret = await prisma.return.create({
      data: {
        businessId,
        orderId: tx.orderId!,
        reason: 'Damaged',
        refundMethod: 'card',
        refundAmount: 25,
        status: 'approved',
      },
    });
    const exec = await refunds.createFromReturn(ret, businessId, null);
    expect(exec.status).toBe('Ready');
    await expectCode(refunds.execute(manager, exec.id), 'PERMISSION_DENIED');
    await expectCode(refunds.execute(owner, exec.id, 30), 'PAYMENTS_INVALID');
    const done = await refunds.execute(owner, exec.id);
    expect(done.status).toBe('Succeeded');
    expect(
      num(
        (
          await prisma.payTransaction.findUniqueOrThrow({
            where: { id: tx.id },
          })
        ).refunded,
      ),
    ).toBe(25);
    expect(
      fake.calls.filter((c) => c.path === '/refunds' && c.method === 'POST'),
    ).toHaveLength(1);
    await expectCode(refunds.execute(owner, exec.id), 'PAYMENTS_CONFLICT');
    expect(
      await refunds.refundable(
        await prisma.payTransaction.findUniqueOrThrow({ where: { id: tx.id } }),
      ),
    ).toBe(35);
  });

  it('marks a timed-out refund Provider Unknown and resolves it from the provider without a second refund', async () => {
    const tx = await prisma.payTransaction.findFirstOrThrow({
      where: { providerChargeId: 'ch_paid1' },
    });
    const ret = await prisma.return.create({
      data: {
        businessId,
        orderId: tx.orderId!,
        reason: 'Second item',
        refundMethod: 'card',
        refundAmount: 10,
        status: 'approved',
      },
    });
    const exec = await refunds.createFromReturn(ret, businessId, null);
    fake.timeoutNext = true;
    expect((await refunds.execute(owner, exec.id)).status).toBe(
      'Provider Unknown',
    );
    const before = fake.calls.filter(
      (c) => c.path === '/refunds' && c.method === 'POST',
    ).length;
    expect((await refunds.refresh(businessId, exec.id)).status).toBe(
      'Succeeded',
    );
    expect(
      fake.calls.filter((c) => c.path === '/refunds' && c.method === 'POST')
        .length,
    ).toBe(before);
  });

  it('routes a refund above the Owner threshold through approval', async () => {
    await policy.save(
      owner,
      (await ctx.ensure(businessId)).policyVersion,
      { refund: { approvalAbove: 5 } },
      'Spec: low threshold',
    );
    const ch = charge('ch_big', 50);
    fake.charges.set('ch_big', ch);
    await apply.handleEvent(
      event('evt_big', 'charge.succeeded', ch),
      'Verified',
    );
    const tx = await prisma.payTransaction.findFirstOrThrow({
      where: { providerChargeId: 'ch_big' },
    });
    const o = await order(50, null);
    await prisma.payTransaction.update({
      where: { id: tx.id },
      data: { orderId: o.id },
    });
    const ret = await prisma.return.create({
      data: {
        businessId,
        orderId: o.id,
        reason: 'Big',
        refundMethod: 'card',
        refundAmount: 20,
        status: 'approved',
      },
    });
    const exec = await refunds.createFromReturn(ret, businessId, null);
    expect(exec.status).toBe('Approval Required');
    expect(
      await prisma.payApproval.count({
        where: { subjectId: exec.id, status: 'Pending' },
      }),
    ).toBe(1);
    await refunds.approve(owner, exec.id);
    expect((await refunds.execute(owner, exec.id)).status).toBe('Succeeded');
  });

  it('opens a recovery case for a decline with the raw code kept, and refuses a retry with nothing saved', async () => {
    const ch = charge('ch_fail', 70, {
      status: 'failed',
      captured: false,
      paid: false,
      amount_captured: 0,
      failure_code: 'card_declined',
      outcome: { type: 'issuer_declined', reason: 'insufficient_funds' },
    });
    fake.charges.set('ch_fail', ch);
    await apply.handleEvent(event('evt_fail', 'charge.failed', ch), 'Verified');
    const tx = await prisma.payTransaction.findFirstOrThrow({
      where: { providerChargeId: 'ch_fail' },
    });
    const c = await prisma.payRecoveryCase.findUniqueOrThrow({
      where: { txId: tx.id },
    });
    expect(c.category).toBe('Insufficient funds');
    expect(c.rawCode).toBe('insufficient_funds');
    expect(c.retryable).toBe(false);
    await expectCode(recovery.retry(owner, c.id), 'METHOD_NOT_SUPPORTED');
    expect(normalizeFailure('mystery_code').cat).toBe('Unknown provider code');
    expect(normalizeFailure('do_not_honor').rec).toBe('Unrecoverable');
  });

  it('reconciles by exact provider reference and never matches on amount alone', async () => {
    const conn = (await stripe.connection(businessId, 'stripe', 'live'))!;
    const tx = await prisma.payTransaction.findFirstOrThrow({
      where: { providerChargeId: 'ch_paid1' },
    });
    await stripe.upsertBalanceTxn(businessId, conn, {
      id: 'txn_1',
      object: 'balance_transaction',
      amount: 6000,
      fee: 204,
      net: 5796,
      currency: 'usd',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000),
      status: 'available',
      type: 'charge',
      source: 'ch_paid1',
    });
    expect(
      num(
        (
          await prisma.payTransaction.findUniqueOrThrow({
            where: { id: tx.id },
          })
        ).fee,
      ),
    ).toBe(2.04);
    // A provider charge Noxtill knows nothing about, same amount as a counter card sale an hour later.
    const o = await order(33, 'card');
    await ledger.project(businessId);
    await prisma.payTransaction.updateMany({
      where: { orderId: o.id },
      data: { occurredAt: new Date(Date.now() + 3600_000) },
    });
    await stripe.upsertBalanceTxn(businessId, conn, {
      id: 'txn_2',
      object: 'balance_transaction',
      amount: 3300,
      fee: 100,
      net: 3200,
      currency: 'usd',
      available_on: Math.floor(Date.now() / 1000),
      created: Math.floor(Date.now() / 1000),
      status: 'available',
      type: 'charge',
      source: 'ch_unknown',
    });
    await recon.autoMatch(businessId);
    const items = await prisma.payReconItem.findMany({ where: { businessId } });
    expect(items.find((i) => i.providerRef === 'ch_paid1')?.status).toBe(
      'Matched',
    );
    expect(items.find((i) => i.providerRef === 'ch_unknown')?.status).toBe(
      'Unmatched Provider',
    );
  });

  it('evaluates routing rules by precedence and rejects ties and loops', async () => {
    await routing.saveRule(owner, null, {
      name: 'Links to Stripe',
      level: 'Channel',
      priority: 1,
      method: 'Card',
      primary: 'stripe',
      conditions: { channel: 'Payment Link' },
    });
    const r = await routing.evaluate(businessId, {
      channel: 'Payment Link',
      branch: businessId,
      country: 'US',
      currency: 'USD',
      amount: 50,
      method: 'Card',
    });
    expect(r).toMatchObject({ chosen: 'stripe' });
    expect((r as { rule: { name: string } }).rule.name).toBe('Links to Stripe');
    await expectCode(
      routing.saveRule(owner, null, {
        name: 'Tie',
        level: 'Channel',
        priority: 1,
        method: 'Card',
        primary: 'stripe',
        conditions: { channel: 'Payment Link' },
      }),
      'PAYMENTS_CONFLICT',
    );
    await expectCode(
      routing.saveRule(owner, null, {
        name: 'Loop',
        level: 'Channel',
        priority: 2,
        method: 'Card',
        primary: 'stripe',
        fallback: 'stripe',
        conditions: {},
      }),
      'PAYMENTS_INVALID',
    );
    await expectCode(
      routing.saveRule(manager, null, {
        name: 'x',
        level: 'Channel',
        priority: 3,
        method: 'Card',
        primary: 'stripe',
        conditions: {},
      }),
      'PERMISSION_DENIED',
    );
  });

  it('versions policy and demands a reason for high-risk changes', async () => {
    const v = (await ctx.ensure(businessId)).policyVersion;
    await expectCode(
      policy.save(owner, v, { retry: { maxAttempts: 6 } }),
      'PAYMENTS_INVALID',
    );
    const r = await policy.save(
      owner,
      v,
      { retry: { maxAttempts: 6 } },
      'More attempts',
    );
    expect(r.version).toBe(v + 1);
    await expectCode(
      policy.save(owner, v, { payout: { delayHours: 48 } }),
      'PAYMENTS_VERSION_CONFLICT',
    );
    expect((await ctx.policy(businessId)).disputes.aiAutoSubmit).toBe(false);
  });

  it('runs payouts, disputes, mandates and reconciliation end to end and renders every tab and drawer from real rows', async () => {
    const conn = (await stripe.connection(businessId, 'stripe', 'live'))!;
    const now = Math.floor(Date.now() / 1000);
    // A payout made of a real charge, linked to its settlement components.
    fake.payoutTxns.set('po_1', [
      {
        id: 'txn_po_c',
        object: 'balance_transaction',
        amount: 5000,
        fee: 175,
        net: 4825,
        currency: 'usd',
        available_on: now,
        created: now,
        status: 'available',
        type: 'charge',
        reporting_category: 'charge',
        source: 'ch_big',
      },
    ]);
    await apply.handleEvent(
      event('evt_po', 'payout.paid', {
        id: 'po_1',
        object: 'payout',
        amount: 4825,
        currency: 'usd',
        status: 'paid',
        arrival_date: now,
        created: now,
        automatic: true,
        destination: { id: 'ba_1', bank_name: 'Spec Bank', last4: '6789' },
      }),
      'Verified',
    );
    const po = await prisma.payPayout.findUniqueOrThrow({
      where: { providerPayoutId: 'po_1' },
    });
    expect(num(po.amount)).toBe(48.25);
    expect(po.destination).toBe('Spec Bank ••••6789');
    expect(
      await prisma.payBalanceTxn.count({ where: { payoutRef: 'po_1' } }),
    ).toBe(1);
    expect(
      await prisma.externalPayment.count({
        where: { businessId, externalId: 'po_1', kind: 'payout' },
      }),
    ).toBe(1);

    // A dispute on a known charge: evidence comes only from real records.
    await apply.handleEvent(
      event('evt_dp', 'charge.dispute.created', {
        id: 'dp_1',
        object: 'dispute',
        amount: 6000,
        currency: 'usd',
        charge: 'ch_paid1',
        reason: 'product_not_received',
        status: 'needs_response',
        created: now,
        is_charge_refundable: false,
        evidence_details: { due_by: now + 5 * 86400, submission_count: 0 },
      }),
      'Verified',
    );
    const dp = await prisma.payDispute.findUniqueOrThrow({
      where: { providerDisputeId: 'dp_1' },
    });
    expect(dp.txId).toBeTruthy();
    expect(dp.reason).toBe('Product not received');
    const cands = await disputes.candidates(businessId, dp);
    expect(cands.length).toBeGreaterThan(0);
    await disputes.addEvidence(owner, dp.id, [
      `${cands[0].entityType}:${cands[0].entityId}`,
    ]);
    await disputes.assign(owner, dp.id, owner.userId);
    expect(await disputes.draft(owner, dp.id)).toBeTruthy();
    await expectCode(
      disputes.submit(staff, dp.id, 'x', true),
      'PERMISSION_DENIED',
    );
    await disputes.submit(owner, dp.id, 'Delivered with signature', true);
    expect(
      fake.calls.some(
        (c) => c.method === 'POST' && c.path === '/disputes/dp_1',
      ),
    ).toBe(true);

    // A second dispute accepted as lost closes on the provider.
    await apply.handleEvent(
      event('evt_dp2', 'charge.dispute.created', {
        id: 'dp_2',
        object: 'dispute',
        amount: 5000,
        currency: 'usd',
        charge: 'ch_big',
        reason: 'fraudulent',
        status: 'needs_response',
        created: now,
        is_charge_refundable: false,
        evidence_details: { due_by: now + 86400, submission_count: 0 },
      }),
      'Verified',
    );
    const dp2 = await prisma.payDispute.findUniqueOrThrow({
      where: { providerDisputeId: 'dp_2' },
    });
    await disputes.accept(owner, dp2.id, 'Customer was right');
    expect(fake.calls.some((c) => c.path === '/disputes/dp_2/close')).toBe(
      true,
    );
    expect(
      (await prisma.payDispute.findUniqueOrThrow({ where: { id: dp2.id } }))
        .status,
    ).toBe('Accepted (lost)');

    // A membership billed on the connected account becomes a mandate; a failed invoice is retried.
    const plan = await prisma.membershipPlan.create({
      data: { businessId, name: 'Gold', price: 25, interval: 'monthly' },
    });
    const mem = await prisma.membership.create({
      data: {
        businessId,
        planId: plan.id,
        customerId,
        status: 'active',
        method: 'online',
        stripeSubscriptionId: `sub_spec_${stamp}`,
        currentPeriodEnd: new Date(Date.now() + 20 * 86400_000),
      },
    });
    await prisma.payMandate.create({
      data: {
        businessId,
        env: 'live',
        kind: 'provider',
        sourceModule: 'Memberships',
        membershipId: mem.id,
        customerId,
        planName: 'Gold',
        planRef: 'Gold',
        planStatus: 'Active',
        provider: 'stripe',
        connectionId: conn.id,
        providerSubscriptionId: `sub_spec_${stamp}`,
        amount: 25,
        currency: 'USD',
        frequency: 'Monthly',
        status: 'Active',
      },
    });
    await recurring.project(businessId);
    const mnd = await prisma.payMandate.findUniqueOrThrow({
      where: { membershipId: mem.id },
    });
    expect(mnd.legacyPlatform).toBe(false);
    await apply.handleEvent(
      event('evt_inv_f', 'invoice.payment_failed', {
        id: 'in_1',
        object: 'invoice',
        subscription: `sub_spec_${stamp}`,
        amount_due: 2500,
        amount_paid: 0,
        currency: 'usd',
        status: 'open',
        created: now,
        next_payment_attempt: now + 86400,
      }),
      'Verified',
    );
    expect(
      (await prisma.payMandate.findUniqueOrThrow({ where: { id: mnd.id } }))
        .status,
    ).toBe('Past Due');
    expect((await recurring.retry(owner, mnd.id)).paid).toBe(true);
    expect(fake.calls.some((c) => c.path === '/invoices/in_1/pay')).toBe(true);
    await recurring.pause(owner, mnd.id, true);
    expect(
      (await prisma.payMandate.findUniqueOrThrow({ where: { id: mnd.id } }))
        .status,
    ).toBe('Paused');
    await recurring.pause(owner, mnd.id, false);

    // Reconciliation: a manual match and an ignore on real items.
    await recon.autoMatch(businessId);
    const unmatched = await prisma.payReconItem.findFirstOrThrow({
      where: { businessId, providerRef: 'ch_unknown' },
    });
    const sale = await prisma.payTransaction.findFirstOrThrow({
      where: { businessId, env: 'live', status: 'Succeeded', amount: 33 },
    });
    await recon.match(owner, unmatched.id, sale.id, 'Same sale', true);
    expect(
      (
        await prisma.payReconItem.findUniqueOrThrow({
          where: { id: unmatched.id },
        })
      ).status,
    ).toMatch(/Matched/);
    const open = await prisma.payReconItem.findFirst({
      where: { businessId, NOT: { status: { startsWith: 'Matched' } } },
    });
    if (open) await recon.ignore(owner, open.id, 'Spec ignore');
    expect((await approvals.list(businessId)).length).toBeGreaterThan(0);

    // Every tab (and every settings section) renders from these rows with no broken values.
    const bad = /NaN|undefined|\[object Object\]|Infinity/;
    for (const [tab] of TABS) {
      const secs = tab === 'settings' ? SECS.map((x) => x[0]) : ['collection'];
      for (const sec of secs) {
        const out = await views.screen(
          owner,
          parseScope({ tab, env: 'live', sec }),
        );
        const txt = JSON.stringify(out);
        expect([tab, sec, bad.exec(txt)?.[0] ?? '']).toEqual([tab, sec, '']);
      }
    }
    // Staff sees payouts without the bank destination.
    const sv = JSON.stringify(
      await views.screen(staff, parseScope({ tab: 'payouts', env: 'live' })),
    );
    expect(sv).not.toContain('Spec Bank');

    // Every drawer kind renders for a real record.
    const sc = parseScope({ tab: 'overview', env: 'live' });
    const { M } = await views.metrics(await data.load(owner, sc));
    const one = async (
      q: Promise<{ id: string } | null>,
      what: string,
    ): Promise<string> => {
      const r = await q;
      if (!r) throw new Error(`no ${what} seeded`);
      return r.id;
    };
    const kinds: [string, string][] = [
      ...Object.keys(M).map((k): [string, string] => ['metric', k]),
      ['fresh', ''],
      [
        'tx',
        await one(
          prisma.payTransaction.findFirst({
            where: { businessId, providerChargeId: 'ch_paid1' },
          }),
          'tx',
        ),
      ],
      [
        'req',
        await one(
          prisma.payRequest.findFirst({ where: { businessId } }),
          'req',
        ),
      ],
      [
        'preview',
        await one(
          prisma.payRequest.findFirst({ where: { businessId } }),
          'req',
        ),
      ],
      [
        'rcv',
        await one(
          prisma.payRecoveryCase.findFirst({ where: { businessId } }),
          'rcv',
        ),
      ],
      [
        'rf',
        await one(prisma.payRefund.findFirst({ where: { businessId } }), 'rf'),
      ],
      ['dsp', dp.id],
      ['po', po.id],
      ['mnd', mnd.id],
      [
        'rec',
        await one(
          prisma.payReconItem.findFirst({ where: { businessId } }),
          'rec',
        ),
      ],
      ['ai', ''],
      ['audit', ''],
      ['approvals', ''],
      ['help', ''],
    ];
    for (const [kind, id] of kinds) {
      const txt = JSON.stringify(await drawers.drawer(owner, sc, kind, id));
      expect([kind, id, bad.exec(txt)?.[0] ?? '']).toEqual([kind, id, '']);
    }
    const poDrawer = JSON.stringify(
      await drawers.drawer(owner, sc, 'po', po.id),
    );
    expect(poDrawer).toContain('Spec Bank ••••6789');
    const dspDrawer = JSON.stringify(
      await drawers.drawer(owner, sc, 'fresh', ''),
    );
    expect(dspDrawer).toContain('Webhook secret not configured');

    // Exports read the same rows; staff can't export.
    for (const what of ['transactions', 'payouts', 'reconciliation']) {
      const f = await docs.export(owner, sc, what, 'csv', {});
      expect(f.body.length).toBeGreaterThan(0);
    }
    await expectCode(
      docs.export(staff, sc, 'transactions', 'csv', {}),
      'PERMISSION_DENIED',
    );
  });

  it('verifies Stripe webhook signatures', () => {
    const body = JSON.stringify({ id: 'evt_x' });
    const h = signStripePayload(body, 'whsec_spec');
    expect(verifyStripeSignature(body, h, 'whsec_spec')).toBe(true);
    expect(verifyStripeSignature(body, h, 'whsec_other')).toBe(false);
    expect(verifyStripeSignature(`${body} `, h, 'whsec_spec')).toBe(false);
  });
});
