import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, num } from './pay-context.service';
import { Data, PayDataService, Scope } from './pay-data.service';
import { PayViewsService } from './pay-views.service';
import { PayRequestsService } from './pay-requests.service';
import { PayRefundsService } from './pay-refunds.service';
import { PayDisputesService } from './pay-disputes.service';
import { PayStripeService, SyncState } from './pay-stripe.service';
import { Btn, btn, chip } from './pay-vm';
import { DISPUTE_OPEN, PAY_ERRORS, REQUEST_OPEN } from './payments.constants';

const B = (t: string, bg?: string, fg?: string) => ({
  t,
  bg: bg ?? '#F2F4F7',
  fg: fg ?? '#344054',
});
const BS = (st: string) => {
  const c = chip(st);
  return { t: c.t, bg: c.bg, fg: c.fg };
};

const scalar = (v: unknown) =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? v.toString()
      : v instanceof Date
        ? v.toISOString()
        : JSON.stringify(v);
const KV = (k: string, v: unknown) => ({
  k,
  v: v == null || v === '' ? '—' : scalar(v),
});
const LOCK = '🔒';

/** The design's record drawers, built from real rows (payments-ui.js vDrawer). */
@Injectable()
export class PayDrawersService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly data: PayDataService,
    private readonly views: PayViewsService,
    private readonly requests: PayRequestsService,
    private readonly refunds: PayRefundsService,
    private readonly disputes: PayDisputesService,
    private readonly stripe: PayStripeService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private env(d: Data) {
    return d.s.env === 'live'
      ? B('● LIVE', '#ECFDF3', '#0E8442')
      : B('◆ TEST MODE', '#FEF6E7', '#B54708');
  }

  private base = {
    badges: [] as unknown[],
    sections: [] as unknown[],
    hasActs: false,
    acts: [] as Btn[],
  };

  async drawer(a: PayActor, s: Scope, kind: string, id: string) {
    const d = await this.data.load(a, s);
    switch (kind) {
      case 'metric':
        return this.metric(d, id);
      case 'fresh':
        return this.fresh(d);
      case 'tx':
        return this.tx(d, id);
      case 'req':
        return this.req(d, id);
      case 'preview':
        return this.preview(d, id);
      case 'rcv':
        return this.rcv(d, id);
      case 'rf':
        return this.rf(d, id);
      case 'dsp':
        return this.dsp(d, id);
      case 'po':
        return this.po(d, id);
      case 'mnd':
        return this.mnd(d, id);
      case 'rec':
        return this.rec(d, id);
      case 'ai':
        return this.ai(d);
      case 'audit':
        return this.audit(d);
      case 'approvals':
        return this.approvals(d);
      case 'help':
        return this.help(d);
      default:
        throw new AppException(
          PAY_ERRORS.NOT_FOUND,
          'Unknown drawer',
          HttpStatus.NOT_FOUND,
        );
    }
  }

  private async metric(d: Data, k: string) {
    const { M } = await this.views.metrics(d);
    const m = M[k];
    if (!m)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Unknown metric',
        HttpStatus.NOT_FOUND,
      );
    const byP: Record<string, number> = {};
    const byC: Record<string, number> = {};
    for (const t of m.list) {
      const v = this.data.rep(t, 'captured') ?? this.data.rep(t) ?? 0;
      byP[this.data.provName(t.provider)] =
        (byP[this.data.provName(t.provider)] ?? 0) + v;
      byC[t.channel] = (byC[t.channel] ?? 0) + v;
    }
    const items = (o: Record<string, number>) => {
      const e = Object.entries(o).sort((a, b) => b[1] - a[1]);
      return e.length
        ? e.map(([x, v]) => ({ a: x, c: '', b: d.fmt.short(v), d: '' }))
        : [
            {
              a: m.est
                ? 'Reported by the provider balance API, not per payment'
                : 'No payments',
              c: '',
              b: '',
              d: '',
            },
          ];
    };
    return {
      ...this.base,
      kicker: 'Metric definition',
      title: m.l,
      badges: [this.env(d), B(m.est ? 'Provider-reported' : 'Actual')],
      sections: [
        {
          h: 'Value',
          kv: [
            KV('Value', m.v),
            KV(
              'Period',
              `Last ${d.s.period} day${d.s.period === 1 ? '' : 's'}`,
            ),
            KV(
              'Currency basis',
              `${d.base} reporting · rate stored per payment`,
            ),
            KV('Comparison', m.sub),
            KV('Transactions', m.list.length),
            KV('Freshness', this.data.fresh(d, null).t),
          ],
        },
        { h: 'Definition', text: m.def },
        { h: 'By provider', items: items(byP) },
        { h: 'By channel', items: items(byC) },
        {
          h: 'Source',
          text: 'Noxtill’s own payment records plus provider-confirmed events. Missing provider data is shown as Partial or Not available, never as zero.',
        },
      ],
      hasActs: !!m.filter,
      acts: m.filter
        ? [
            btn(
              `mt-open:${JSON.stringify(m.filter)}`,
              'Open transactions',
              'primary',
            ),
          ]
        : [],
    };
  }

  private async fresh(d: Data) {
    const st = await this.db.paySettings.findUnique({
      where: { businessId: d.a.rootId },
    });
    const sections = d.conns.map((c) => {
      const ss = (c.syncState ?? {}) as SyncState;
      const feeds = Object.entries(ss);
      const ok = feeds
        .map(([, f]) => (f?.lastOkAt ? Date.parse(f.lastOkAt) : 0))
        .filter(Boolean);
      const errs = feeds.filter(([, f]) => f?.lastError);
      return {
        h: `${this.data.provName(c.provider)}${c.provider === 'stripe' ? ` (${c.env})` : ''} · ${c.status}`,
        warn:
          c.status === 'Degraded'
            ? 'Calls are failing or timing out. Money actions go to “Provider Unknown” and are safe to retry with the same idempotency key.'
            : c.status === 'Connection Required'
              ? 'The provider refused access — reconnect it in Integrations.'
              : errs.length
                ? `Last sync errors: ${errs.map(([k, f]) => `${k}: ${f?.lastError}`).join(' · ')}`
                : !c.writeEnabled && c.provider === 'stripe'
                  ? 'Connected read-only — reconnect Stripe in Integrations to allow payment actions.'
                  : null,
        kv: [
          KV('Connection', c.integrationId.slice(0, 8)),
          KV('Provider account', d.a.raw ? c.accountId : LOCK),
          KV('Write access', c.writeEnabled ? 'Yes' : 'No (read-only)'),
          KV(
            'Last successful sync',
            ok.length ? d.fmt.ago(new Date(Math.min(...ok))) : 'Never',
          ),
          KV('Last provider event', d.fmt.ago(c.lastEventAt)),
          KV(
            'Data completeness',
            errs.length ? 'Partial' : ok.length ? 'Complete' : 'Not synced yet',
          ),
          KV(
            'Webhook signatures',
            c.provider === 'stripe'
              ? this.config.get<string>(
                  c.env === 'test'
                    ? 'STRIPE_CONNECT_WEBHOOK_SECRET_TEST'
                    : 'STRIPE_CONNECT_WEBHOOK_SECRET',
                )
                ? 'Checked on every event (endpoint secret set)'
                : 'Webhook secret not configured on this server — updates come only from scheduled sync'
              : 'Not used — read-only import',
          ),
        ],
      };
    });
    return {
      ...this.base,
      kicker: 'Provider freshness & health',
      title: d.conns.length
        ? 'Connected providers'
        : 'No payment provider connected',
      badges: [this.env(d)],
      sections: [
        {
          h: `Noxtill records · ${st?.projectedAt ? `projected ${d.fmt.ago(st.projectedAt)}` : 'not projected yet'}`,
          text: 'Sales, deposits, credit payments and installments are read from their own modules into the payment ledger every few minutes and on Refresh.',
        },
        ...sections,
        ...(d.conns.length
          ? []
          : [
              {
                h: 'Providers',
                text: 'Connect Stripe (or import from Square / PayPal) in Integrations. Credentials stay in Integrations — never in Payments.',
              },
            ]),
      ],
      hasActs: true,
      acts: [
        btn('refresh', 'Refresh now', 'primary'),
        btn('ext:/integrations', 'Open Integrations'),
      ],
    };
  }

  private async mustTx(d: Data, id: string) {
    const t =
      d.all.find((x) => x.id === id) ??
      (await this.db.payTransaction.findFirst({
        where: { id, businessId: d.a.rootId },
      }));
    if (!t)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Transaction not found',
        HttpStatus.NOT_FOUND,
      );
    if (d.a.ownOnly && t.createdById !== d.a.userId)
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        'Not one of your payments.',
        HttpStatus.FORBIDDEN,
      );
    if (d.a.branches && t.branchId && !d.a.branches.includes(t.branchId))
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        'Outside your branch scope.',
        HttpStatus.FORBIDDEN,
      );
    return t;
  }

  private async tx(d: Data, id: string) {
    const t = await this.mustTx(d, id);
    const fees = d.a.fees;
    const c = t.customerId
      ? (d.custs.get(t.customerId) ??
        (await this.db.customer.findUnique({
          where: { id: t.customerId },
          select: { name: true, email: true, phone: true, tags: true },
        })))
      : null;
    const rf = await this.db.payRefund.findMany({
      where: { txId: t.id },
      orderBy: { createdAt: 'desc' },
    });
    const ds = await this.db.payDispute.findMany({ where: { txId: t.id } });
    const po = t.payoutRef
      ? await this.db.payPayout.findUnique({
          where: { providerPayoutId: t.payoutRef },
        })
      : null;
    const bank = po ? (await this.views.bankMatch([po])).get(po.id) : null;
    const events = await this.db.payEvent.findMany({
      where: { txId: t.id },
      orderBy: { receivedAt: 'desc' },
      take: 30,
    });
    const audit = await this.db.payAudit.findMany({
      where: { OR: [{ entityId: t.id }, { corr: t.correlationId }] },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const open = new Set(
      ds
        .filter((x) => DISPUTE_OPEN.includes(x.status))
        .map((x) => x.txId as string),
    );
    const sm = {
      po: new Map(po ? [[po.providerPayoutId, po.status]] : []),
      pend: new Set<string>(
        (await this.db.payBalanceTxn.findFirst({
          where: { txId: t.id, status: 'pending' },
        }))
          ? [t.id]
          : [],
      ),
    };
    const refundable = await this.refunds.refundable(t);
    const net =
      t.fee == null ? null : num(t.captured) - num(t.fee) - num(t.refunded);
    const req = t.requestId
      ? await this.db.payRequest.findUnique({
          where: { id: t.requestId },
          select: { number: true },
        })
      : null;
    const timeline = [
      {
        at: t.occurredAt,
        a: `Payment ${t.origin === 'noxtill' ? 'recorded' : 'created'} · ${t.channel}`,
        c: `Noxtill · ${t.initiatedBy}`,
        b: 'Applied',
        dd: t.number,
      },
      ...(t.authorizedAt && t.status !== 'Succeeded'
        ? [
            {
              at: t.authorizedAt,
              a: 'Provider accepted · authorized',
              c: `${this.data.provName(t.provider)}`,
              b: 'Verified',
              dd: t.providerIntentId ?? '',
            },
          ]
        : []),
      ...(t.status === 'Succeeded'
        ? [
            {
              at: t.capturedAt ?? t.occurredAt,
              a: `Captured ${d.fmt.money(num(t.captured), t.currency)}`,
              c:
                t.provider === 'manual'
                  ? 'Noxtill record'
                  : `${this.data.provName(t.provider)}`,
              b: t.provider === 'manual' ? 'Recorded' : 'Verified',
              dd: t.providerChargeId ?? '',
            },
          ]
        : []),
      ...(t.status === 'Failed'
        ? [
            {
              at: t.occurredAt,
              a: `Provider declined · ${t.failureCode ?? 'declined'}`,
              c: this.data.provName(t.provider),
              b: 'Verified',
              dd: t.failureMessage ?? '',
            },
          ]
        : []),
      ...(po
        ? [
            {
              at: po.arrivalDate ?? po.providerCreatedAt,
              a: `Settled into ${po.providerPayoutId}`,
              c: 'Stripe payout',
              b: po.status,
              dd: '',
            },
          ]
        : []),
      ...rf.flatMap((r) => [
        ...(r.submittedAt
          ? [
              {
                at: r.submittedAt,
                a: `Refund initiated ${d.fmt.money(num(r.amount), r.currency)} (${r.number})`,
                c: `Payments · ${r.origin}`,
                b: 'Sent',
                dd: r.idempotencyKey,
              },
            ]
          : []),
        ...(r.verifiedAt
          ? [
              {
                at: r.verifiedAt,
                a: 'Refund confirmed',
                c:
                  r.origin === 'manual'
                    ? 'Recorded at the counter'
                    : 'Provider',
                b: 'Verified',
                dd: r.providerRefundId ?? '',
              },
            ]
          : []),
      ]),
      ...ds.map((x) => ({
        at: x.openedAt,
        a: `Dispute opened · ${x.reason}`,
        c: 'Stripe webhook',
        b: 'Verified',
        dd: x.providerDisputeId,
      })),
      ...events
        .filter((e) => e.processing !== 'Applied')
        .map((e) => ({
          at: e.receivedAt,
          a: `Webhook ${e.type}`,
          c: this.data.provName(e.provider),
          b: e.processing,
          dd: e.externalId,
        })),
      ...audit.map((x) => ({
        at: x.createdAt,
        a: x.action,
        c: `Payments · ${x.actorName}`,
        b: 'Applied',
        dd: x.detail.slice(0, 60),
      })),
    ].sort((x, y) => y.at.getTime() - x.at.getTime());
    const st = this.data.dispSt(t, open);
    const canCapture = t.status === 'Authorized' && d.a.refund;
    return {
      ...this.base,
      kicker: `Transaction · ${this.data.provName(t.provider)}`,
      title: `${t.number} · ${d.fmt.money(num(t.amount), t.currency)}`,
      badges: [BS(st), this.env(d), B(t.method)],
      sections: [
        {
          h: 'Customer',
          kv: [
            KV('Name', this.data.cname(d, t.customerId)),
            KV(
              'Segment',
              Array.isArray(c?.tags) && c.tags.length
                ? (c.tags as string[]).join(', ')
                : 'No tags',
            ),
            KV('Email', d.a.pii ? c?.email : LOCK),
            KV('Phone', d.a.pii ? c?.phone : LOCK),
          ],
        },
        {
          h: 'Source entity',
          kv: [
            KV('Entity', this.data.srcLabel(t)),
            KV('Owner module', this.data.srcOwner(t)),
            KV('Payment request', req?.number),
            KV('Channel', t.channel),
            KV('Branch', this.data.brName(d, t.branchId)),
            KV('Initiated by', t.initiatedBy),
          ],
        },
        {
          h: 'Amount breakdown',
          kv: [
            KV('Gross', d.fmt.money(num(t.amount), t.currency)),
            KV('Captured', d.fmt.money(num(t.captured), t.currency)),
            KV(
              'Provider fee',
              fees
                ? t.feeSource === 'none'
                  ? 'None (no provider)'
                  : t.fee == null
                    ? 'Not reported yet'
                    : d.fmt.money(num(t.fee), t.currency)
                : LOCK,
            ),
            KV('Refunded', d.fmt.money(num(t.refunded), t.currency)),
            KV(
              'Net',
              fees
                ? net == null
                  ? 'Pending fee'
                  : d.fmt.money(net, t.currency)
                : LOCK,
            ),
            KV('Refundable remaining', d.fmt.money(refundable, t.currency)),
            ...(t.currency !== d.base
              ? [
                  KV(
                    'FX',
                    t.fxRate
                      ? `${num(t.fxRate)} · ${t.fxSource ?? 'Finance › Exchange rates'}`
                      : 'No FX rate stored — excluded from base totals',
                  ),
                  KV(
                    `Reporting (${d.base})`,
                    t.reportAmount != null
                      ? d.fmt.money(num(t.reportAmount))
                      : 'Unavailable',
                  ),
                ]
              : []),
          ],
        },
        {
          h: 'Authorization & capture',
          kv: [
            KV('Authorization', t.authStatus),
            KV('Capture', t.captureStatus),
            KV(
              'Separate capture',
              t.provider === 'stripe' ? 'Supported' : 'Not supported',
            ),
            KV(
              'Partial capture',
              t.provider === 'stripe' ? 'Supported' : 'Not supported',
            ),
            ...(t.authExpiresAt
              ? [KV('Authorization expires', d.fmt.dtm(t.authExpiresAt))]
              : []),
          ],
        },
        {
          h: 'Refunds',
          items: rf.length
            ? rf.map((r) => ({
                a: `${r.number} · ${r.returnId ? 'Orders return' : r.origin}`,
                c: r.reason,
                b: d.fmt.money(num(r.amount), r.currency),
                d: r.status,
              }))
            : [{ a: 'No refunds', c: '', b: '', d: '' }],
        },
        {
          h: 'Disputes',
          items: ds.length
            ? ds.map((x) => ({
                a: `${x.providerDisputeId} · ${x.reason}`,
                c: `Due ${d.fmt.day(x.dueBy)}`,
                b: d.fmt.money(num(x.amount), x.currency),
                d: x.status,
              }))
            : [{ a: 'No disputes', c: '', b: '', d: '' }],
        },
        {
          h: 'Settlement',
          kv: [
            KV('Status', this.data.settleSt(t, sm.po, sm.pend)),
            KV('Payout', po?.providerPayoutId),
            KV(
              'Bank match',
              po
                ? po.status === 'Paid'
                  ? bank?.matched
                    ? 'Bank Matched (Finance)'
                    : 'Bank Match Pending (Finance)'
                  : '—'
                : '—',
            ),
            KV(
              'Settlement speed',
              t.provider === 'manual'
                ? 'n/a'
                : (this.data.conn(d, t.provider)?.payoutSchedule ?? '—'),
            ),
          ],
        },
        {
          h: 'Provider references',
          kv: [
            KV('Provider transaction', t.providerChargeId),
            KV('Payment intent', t.providerIntentId),
            KV(
              'Provider account',
              d.a.raw ? this.data.conn(d, t.provider)?.accountId : LOCK,
            ),
            KV('Correlation ID', t.correlationId),
            KV('Idempotency key', t.idempotencyKey),
            KV('Environment', t.env.toUpperCase()),
          ],
        },
        {
          h: 'Payment method',
          text:
            t.method === 'Card' || t.method === 'Wallet'
              ? `${t.methodBrand ? t.methodBrand.replace(/^./, (x) => x.toUpperCase()) : t.method}${t.methodLast4 ? ` ••••${t.methodLast4}` : ''}${t.riskOutcome ? ` · risk ${t.riskOutcome}` : ''}\nCard number, CVV and tokens stay with the provider.`
              : t.method === 'Cash'
                ? 'Cash at the counter · cash-up in Fast Sale.'
                : `${t.method} · recorded in Noxtill.`,
        },
        {
          h: 'Timeline',
          items: timeline.map((e) => ({
            a: e.a,
            c: `${d.fmt.dtm(e.at)} · ${e.c}`,
            b: e.b,
            d: e.dd,
          })),
        },
        ...(d.a.raw
          ? [
              {
                h: 'Raw sanitised provider events',
                items: events.length
                  ? events.map((e) => ({
                      a: `${e.type} · ${e.externalId}`,
                      c: `${e.signature} · sha256:${e.payloadHash.slice(0, 10)}…`,
                      b: d.fmt.ago(e.receivedAt),
                      d: e.processing,
                    }))
                  : [{ a: 'No stored events', c: '', b: '', d: '' }],
              },
            ]
          : [
              {
                h: 'Raw provider events',
                text: '🔒 Restricted for your role — not sent to this browser.',
              },
            ]),
        {
          h: 'Audit',
          items: audit.length
            ? audit.map((x) => ({
                a: x.action,
                c: `${x.actorName} · ${d.fmt.dtm(x.createdAt)}`,
                b: x.corr ?? '',
                d: x.detail,
              }))
            : [{ a: 'No actions recorded', c: '', b: '', d: '' }],
        },
      ],
      hasActs: true,
      acts: [
        btn('tx:Open source entity', `Open ${this.data.srcOwner(t)}`),
        btn('tx:Copy reference', 'Copy reference'),
        ...(t.status === 'Succeeded' && t.customerId
          ? [btn('tx:Send receipt', 'Send receipt')]
          : []),
        ...(t.provider === 'stripe'
          ? [
              btn(
                'tx:Refresh provider state',
                'Refresh provider state',
                'primary',
              ),
            ]
          : []),
        ...(canCapture ? [btn('tx:Capture', 'Capture', 'dark')] : []),
      ],
    };
  }

  private async req(d: Data, id: string) {
    const r = await this.requests.mustRequest(d.a.rootId, id);
    const dels = await this.db.payRequestDelivery.findMany({
      where: { requestId: r.id },
      orderBy: { sentAt: 'desc' },
    });
    const msgs = dels.filter((x) => x.messageId).length
      ? await this.db.message.findMany({
          where: {
            id: {
              in: dels.map((x) => x.messageId).filter((x): x is string => !!x),
            },
          },
          select: { id: true, status: true },
        })
      : [];
    const pays = await this.db.payTransaction.findMany({
      where: { requestId: r.id },
      orderBy: { occurredAt: 'desc' },
    });
    const names = await this.ctx.userNames([r.createdById]);
    const open = REQUEST_OPEN.includes(r.status);
    return {
      ...this.base,
      kicker: 'Payment request · activity',
      title: `${r.number} · ${r.amountType === 'Flexible' ? 'Flexible amount' : d.fmt.money(num(r.amount), r.currency)}`,
      badges: [BS(r.status), this.env(d)],
      sections: [
        {
          h: 'Request',
          kv: [
            KV('Customer', d.a.pii ? r.recipientName : 'Customer'),
            KV(
              'Linked entity',
              r.linkType ? `${r.linkType} ${r.linkRef ?? ''}` : 'Standalone',
            ),
            KV('Description', r.description),
            KV('Reference', r.reference),
            KV('Due', d.fmt.day(r.dueOn)),
            KV('Expiry', d.fmt.dtm(r.expiresAt)),
            KV('Partial payments', r.allowPartial ? 'Allowed' : 'No'),
            KV('Methods', ((r.methods as string[]) ?? []).join(', ')),
            KV('Paid', d.fmt.money(num(r.amountPaid), r.currency)),
            KV('Created by', names.get(r.createdById)),
          ],
        },
        {
          h: 'Public link',
          text: open
            ? `${this.requests.url(r)}\nSigned opaque token · only its SHA-256 hash is stored. Sequential IDs are never exposed.`
            : `Link closed (${r.status}). Expiring rotates the token, so the old link stops working.`,
        },
        {
          h: 'Deliveries (Unified Inbox)',
          items: dels.length
            ? dels.map((x) => ({
                a: x.channel,
                c: `${x.messageId ? `message ${x.messageId.slice(0, 8)}` : 'not sent'} · ${d.fmt.ago(x.sentAt)}`,
                b: x.messageId
                  ? msgs.find((m) => m.id === x.messageId)
                    ? this.msgStatus(
                        msgs.find((m) => m.id === x.messageId)!.status,
                      )
                    : x.status
                  : 'Failed',
                d: x.error ?? '',
              }))
            : [{ a: 'Not sent yet', c: '', b: '', d: '' }],
        },
        {
          h: 'Payments against this request',
          items: pays.length
            ? pays.map((t) => ({
                a: t.number,
                c: `${this.data.provName(t.provider)} · ${d.fmt.dtm(t.occurredAt)}`,
                b: d.fmt.money(
                  num(t.status === 'Succeeded' ? t.captured : t.amount),
                  t.currency,
                ),
                d: t.status,
              }))
            : [{ a: 'No payments yet', c: '', b: '', d: '' }],
        },
      ],
      hasActs: true,
      acts: [
        btn('rq:Public link preview', 'Public link preview', 'primary'),
        ...(open && d.a.request
          ? [
              btn('rq:Share', 'Share'),
              btn('rq:QR code', 'QR'),
              ...(r.env === 'live'
                ? [btn('rq:Record payment', 'Record payment')]
                : []),
              btn('rq:Expire', 'Expire', 'danger'),
            ]
          : []),
        ...(d.a.request ? [btn('rq:Duplicate', 'Duplicate')] : []),
      ],
    };
  }

  private msgStatus(s: string) {
    return (
      (
        {
          queued: 'Queued',
          sent: 'Sent',
          delivered: 'Delivered',
          read: 'Read',
          failed: 'Failed',
        } as Record<string, string>
      )[s] ?? s
    );
  }

  private async preview(d: Data, id: string) {
    const r = await this.requests.mustRequest(d.a.rootId, id);
    const left =
      r.amountType === 'Flexible' ? null : num(r.amount) - num(r.amountPaid);
    const online = await this.requests.allowedMethods(
      d.a.rootId,
      r.env as 'live' | 'test',
      r.currency,
    );
    const pays = ((r.methods as string[]) ?? []).map(
      (m) =>
        `${m}${online.some((o) => o.method === m && o.provider === 'stripe') ? '' : ' (instructions)'}`,
    );
    return {
      ...this.base,
      kicker: 'Public link preview · what the customer sees',
      title: d.biz.name,
      badges: [
        B('No internal IDs or notes'),
        ...(r.env === 'test' ? [B('◆ TEST MODE', '#FEF6E7', '#B54708')] : []),
      ],
      sections: [
        {
          h: 'Payment page',
          kv: [
            KV(
              'Pay',
              r.amountType === 'Flexible'
                ? 'Enter any amount'
                : d.fmt.money(left, r.currency),
            ),
            KV('For', r.description),
            KV('Reference', r.reference),
            KV('Due', d.fmt.day(r.dueOn)),
            KV('Pay with', pays.join(' · ')),
            KV(
              'Status',
              r.status === 'Paid'
                ? 'Paid — thank you'
                : r.status === 'Expired'
                  ? 'This link has expired'
                  : r.status === 'Cancelled'
                    ? 'This link was cancelled'
                    : 'Ready to pay',
            ),
          ],
        },
        ...(r.note ? [{ h: 'Note from the business', text: r.note }] : []),
        {
          h: 'Hidden from the customer',
          bullets: [
            'Internal request ID and customer ID',
            'Internal notes and created-by',
            'Provider names, accounts and routing',
            'Other customers’ data',
          ],
        },
        {
          h: 'How status changes',
          text: online.some((o) => o.provider === 'stripe')
            ? 'The page opens Stripe Checkout on your account. This request becomes Paid only after Stripe confirms the payment by verified webhook.'
            : 'No online provider is connected for this currency, so the page shows your payment instructions. Your team records the payment when it arrives.',
        },
      ],
      hasActs: REQUEST_OPEN.includes(r.status),
      acts: REQUEST_OPEN.includes(r.status)
        ? [btn(`url:${this.requests.url(r)}`, 'Open the live page', 'dark')]
        : [],
    };
  }

  private async rcv(d: Data, id: string) {
    const c = await this.db.payRecoveryCase.findFirst({
      where: { id, businessId: d.a.rootId },
    });
    if (!c)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Case not found',
        HttpStatus.NOT_FOUND,
      );
    const t = await this.mustTx(d, c.txId);
    const audit = await this.db.payAudit.findMany({
      where: { entityId: c.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const owners = await this.ctx.userNames([c.ownerId]);
    const acts = this.views
      .rcvActs(d, c)
      .filter((x) => !['Open'].includes(x))
      .slice(0, 4);
    return {
      ...this.base,
      kicker: `Recovery case · ${t.number}`,
      title: `${this.data.cname(d, t.customerId)} · ${d.fmt.money(num(t.amount), t.currency)}`,
      badges: [BS(c.status), B(c.category), this.env(d)],
      sections: [
        {
          h: 'Failure',
          kv: [
            KV('Normalized reason', c.category),
            KV('Raw provider code', c.rawCode),
            KV('Recoverability', c.recoverability),
            KV('Provider guidance', c.guidance),
            KV('Attempts', `${c.attempts} of ${d.pol.retry.maxAttempts}`),
            KV(
              'Next retry',
              c.nextRetryAt
                ? d.fmt.until(c.nextRetryAt)
                : c.retryable
                  ? 'Manual'
                  : 'No saved method — send a new link',
            ),
          ],
        },
        {
          h: 'Payment',
          kv: [
            KV('Transaction', t.number),
            KV('Provider', `${this.data.provName(t.provider)} · ${t.method}`),
            KV('Linked entity', this.data.srcLabel(t)),
            KV('Owner', c.ownerId ? owners.get(c.ownerId) : 'Unassigned'),
            KV(
              'Customer notified',
              c.notifiedAt
                ? `${d.fmt.dtm(c.notifiedAt)} via ${c.notifyChannel}`
                : 'Not yet',
            ),
            KV('Idempotency key', t.idempotencyKey),
          ],
        },
        {
          h: 'Recovery timeline',
          items: [
            {
              a: `First failed · ${c.rawCode}`,
              c: d.fmt.dtm(c.firstFailedAt),
              b: 'Verified',
              d: '',
            },
            ...audit.map((x) => ({
              a: x.action,
              c: `${x.actorName} · ${d.fmt.dtm(x.createdAt)}`,
              b: 'Applied',
              d: x.detail.slice(0, 80),
            })),
          ],
        },
        {
          h: 'Retry safety',
          bullets: [
            'Hard declines, risk blocks and duplicate states are never retried',
            'The source is re-checked right before retrying — a cycle already paid is never charged again',
            'The retry carries an idempotency key — it can’t double-charge',
          ],
        },
      ],
      hasActs: d.a.recover && acts.length > 0,
      acts: acts.map((x, i) =>
        btn(`rc:${x}`, x, i === 0 ? 'primary' : 'ghost'),
      ),
    };
  }

  private async rf(d: Data, id: string) {
    const r = await this.refunds.must(d.a.rootId, id);
    const t = r.txId ? await this.mustTx(d, r.txId).catch(() => null) : null;
    const names = await this.ctx.userNames([r.upstreamById, r.executedById]);
    const path = [
      'Approved Upstream',
      'Ready',
      'Queued',
      'Processing',
      'Provider Accepted',
      'Succeeded',
    ];
    const idx = path.indexOf(r.status);
    const refundable = t ? await this.refunds.refundable(t, r.id) : 0;
    const acts = this.views
      .rfActs(d, r, t ?? undefined)
      .filter((x) => x !== 'Open');
    return {
      ...this.base,
      kicker: `Refund execution · ${r.number}`,
      title: `${d.fmt.money(num(r.amount), r.currency)} to ${this.data.cname(d, t?.customerId)}`,
      badges: [BS(r.status), this.env(d)],
      sections: [
        {
          h: 'State',
          text:
            path
              .map(
                (p, i) =>
                  (p === r.status
                    ? '● '
                    : i < idx || r.status === 'Succeeded'
                      ? '✓ '
                      : '○ ') + p,
              )
              .join('\n') +
            ([
              'Failed',
              'Manual Review',
              'Provider Unknown',
              'Approval Required',
            ].includes(r.status)
              ? `\n● ${r.status}`
              : ''),
        },
        {
          h: r.returnId ? 'Approval snapshot (from Orders)' : 'Origin',
          kv: [
            KV(
              'Source',
              r.returnId
                ? 'Orders · Returns & Refunds'
                : r.origin === 'provider'
                  ? 'Issued at the provider'
                  : 'Manual',
            ),
            KV(
              'Approved amount',
              d.fmt.money(num(r.approvedAmount), r.currency),
            ),
            KV('Approved by', r.upstreamById ? names.get(r.upstreamById) : '—'),
            KV('Approved', d.fmt.ago(r.upstreamAt)),
            KV('Reason', r.reason),
            KV(
              'Refundable remaining',
              t ? d.fmt.money(refundable, t.currency) : '—',
            ),
          ],
        },
        {
          h: 'Execution',
          kv: [
            KV('Payment', t?.number),
            KV('Provider', this.data.provName(t?.provider ?? 'manual')),
            KV('Destination', `${t?.method ?? r.method} (original method)`),
            KV('Provider refund ID', r.providerRefundId),
            KV('Idempotency key', r.idempotencyKey),
            KV('Submitted', d.fmt.ago(r.submittedAt)),
            KV('Verified', d.fmt.ago(r.verifiedAt)),
            KV('Executed by', r.executedById ? names.get(r.executedById) : '—'),
            KV('Failure', r.failureCode),
          ],
        },
        ...(r.status === 'Failed' && r.failureCode
          ? [
              {
                h: 'What this means',
                text: this.explain(
                  r.failureCode,
                  this.data.provName(t?.provider),
                ),
              },
            ]
          : []),
      ],
      hasActs: acts.length > 0,
      acts: acts.map((x, i) =>
        btn(
          `rf:${x}`,
          x,
          i === 0 &&
            [
              'Execute refund',
              'Retry execution',
              'Approve & execute',
              'Mark refunded outside Noxtill',
            ].includes(x)
            ? 'primary'
            : 'ghost',
        ),
      ),
    };
  }

  private explain(code: string, prov: string) {
    const c = code.toLowerCase();
    if (c.includes('insufficient'))
      return `${prov} couldn’t fund the refund because your balance was lower than the refund at that moment. Once the next settlement lands, retrying is safe. Nobody but a person can change the approved amount or mark this refund successful.`;
    if (c.includes('charge_already_refunded') || c.includes('already'))
      return `${prov} says this charge was already refunded — check the provider dashboard before retrying, so the customer isn’t refunded twice.`;
    if (c.includes('timeout') || c.includes('provider_timeout'))
      return 'The provider didn’t answer in time. Refresh status asks the provider for the real state using the same idempotency key.';
    return `${prov} returned “${code}”. Review it in the provider dashboard before retrying.`;
  }

  private async dsp(d: Data, id: string) {
    const x = await this.disputes.must(d.a.rootId, id);
    const t = x.txId
      ? await this.db.payTransaction.findUnique({ where: { id: x.txId } })
      : null;
    const ev = await this.db.payDisputeEvidence.findMany({
      where: { disputeId: x.id },
      orderBy: { requirement: 'desc' },
    });
    const req = ev.filter((e) => e.requirement === 'Required');
    const pct = req.length
      ? Math.round(
          (req.filter((e) => e.status !== 'Missing').length / req.length) * 100,
        )
      : 0;
    const miss = ev.filter(
      (e) => e.requirement === 'Required' && e.status === 'Missing',
    );
    const owners = await this.ctx.userNames([x.ownerId]);
    const audit = await this.db.payAudit.findMany({
      where: { entityId: x.id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.base,
      kicker: `Dispute · ${x.providerDisputeId}`,
      title: x.reason,
      badges: [BS(x.status), B(`${pct}% required evidence`), this.env(d)],
      sections: [
        {
          h: 'Case summary',
          kv: [
            KV('Amount', d.fmt.money(num(x.amount), x.currency)),
            KV('Provider', 'Stripe'),
            KV('Transaction', t?.number ?? x.providerChargeId),
            KV(
              'Customer / source',
              t
                ? `${this.data.cname(d, t.customerId)} · ${this.data.srcLabel(t)}`
                : '—',
            ),
            KV(
              'Evidence due',
              x.dueBy ? `${d.fmt.dtm(x.dueBy)} · ${d.fmt.rel(x.dueBy)}` : '—',
            ),
            KV('Timezone', d.biz.timezone),
            KV('Charge refundable', x.chargeRefundable ? 'Yes' : 'No'),
            KV('Owner', x.ownerId ? owners.get(x.ownerId) : 'Unassigned'),
            KV(
              'Dispute fee',
              d.a.fees
                ? x.fee != null
                  ? d.fmt.money(num(x.fee), x.currency)
                  : 'Not reported'
                : LOCK,
            ),
            KV('Outcome', x.outcome),
          ],
        },
        ...(miss.length
          ? [
              {
                h: 'Missing required evidence',
                warn: miss.map((e) => e.label).join(' · '),
              },
            ]
          : []),
        {
          h: 'Evidence checklist',
          items: ev.length
            ? ev.map((e) => ({
                a: e.label,
                c: `${e.module} · ${e.entityType} ${e.entityRef}${e.addedAt ? ` · added ${d.fmt.ago(e.addedAt)}` : ''}`,
                b: e.status,
                d: e.requirement,
              }))
            : [{ a: 'No evidence items', c: '', b: '', d: '' }],
        },
        ...(x.draft
          ? [{ h: 'Response draft (review before submitting)', text: x.draft }]
          : []),
        ...(x.response && x.status !== 'Needs Response'
          ? [{ h: 'Submitted response', text: x.response }]
          : []),
        {
          h: 'Timeline',
          items: [
            {
              a: 'Dispute opened by cardholder bank',
              c: `${d.fmt.dtm(x.openedAt)} · Stripe`,
              b: 'Verified',
              d: x.providerDisputeId,
            },
            ...audit.map((y) => ({
              a: y.action,
              c: `${y.actorName} · ${d.fmt.dtm(y.createdAt)}`,
              b: 'Applied',
              d: y.detail.slice(0, 60),
            })),
            ...(x.outcome
              ? [
                  {
                    a: `Outcome: ${x.outcome}`,
                    c: 'Stripe',
                    b: 'Final',
                    d: 'Original capture history unchanged',
                  },
                ]
              : []),
          ],
        },
      ],
      hasActs: true,
      acts: [
        ...(d.a.dispute && x.status === 'Needs Response'
          ? [
              btn('ds:ai', 'Draft response with AI'),
              btn('ds:Collect evidence', 'Collect evidence'),
              btn('ds:Submit response', 'Submit response', 'primary'),
            ]
          : []),
        ...(x.status === 'Approval Required' && d.a.approve
          ? [btn('ds:Approve submission', 'Approve submission', 'primary')]
          : []),
        btn('ext:/helpdesk', 'Open Helpdesk'),
      ],
    };
  }

  private async po(d: Data, id: string) {
    const p = await this.db.payPayout.findFirst({
      where: { OR: [{ id }, { providerPayoutId: id }], businessId: d.a.rootId },
    });
    if (!p)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Payout not found',
        HttpStatus.NOT_FOUND,
      );
    const bts = await this.db.payBalanceTxn.findMany({
      where: { payoutRef: p.providerPayoutId },
      orderBy: { occurredAt: 'desc' },
    });
    const txs = new Map(
      (
        await this.db.payTransaction.findMany({
          where: {
            id: { in: bts.map((b) => b.txId).filter((x): x is string => !!x) },
          },
        })
      ).map((t) => [t.id, t]),
    );
    const sum = (f: (b: (typeof bts)[number]) => boolean) =>
      bts.filter(f).reduce((s, b) => s + num(b.amount), 0);
    const fees = bts.reduce((s, b) => s + num(b.fee), 0);
    const bm = (await this.views.bankMatch([p])).get(p.id);
    const late =
      ['Pending', 'In Transit'].includes(p.status) &&
      p.arrivalDate &&
      p.arrivalDate.getTime() < Date.now() - d.pol.payout.delayHours * 3600000;
    return {
      ...this.base,
      kicker: 'Payout · Stripe',
      title: `${p.providerPayoutId} · ${d.fmt.money(num(p.amount), p.currency)}`,
      badges: [
        BS(late ? 'Delayed' : p.status),
        ...(p.status === 'Paid'
          ? [BS(bm?.matched ? 'Bank Matched' : 'Bank Match Pending')]
          : []),
        this.env(d),
      ],
      sections: [
        {
          h: 'Breakdown',
          kv: bts.length
            ? [
                KV(
                  'Gross collection',
                  d.fmt.money(
                    sum((b) => ['charge', 'payment'].includes(b.type)),
                    p.currency,
                  ),
                ),
                KV(
                  'Refund deductions',
                  d.fmt.money(
                    sum((b) => b.type.includes('refund')),
                    p.currency,
                  ),
                ),
                KV(
                  'Dispute deductions',
                  d.fmt.money(
                    sum(
                      (b) =>
                        (b.category ?? '').startsWith('dispute') ||
                        b.type === 'dispute',
                    ),
                    p.currency,
                  ),
                ),
                KV('Fees', d.a.fees ? d.fmt.money(-fees, p.currency) : LOCK),
                KV(
                  'Adjustments',
                  d.fmt.money(
                    sum(
                      (b) =>
                        b.type === 'adjustment' &&
                        !(b.category ?? '').startsWith('dispute'),
                    ),
                    p.currency,
                  ),
                ),
                KV(
                  'Reserve',
                  d.fmt.money(
                    sum((b) => b.type.startsWith('reserve')),
                    p.currency,
                  ),
                ),
                KV('Net', d.fmt.money(num(p.amount), p.currency)),
                KV('Destination', d.a.dest ? p.destination : LOCK),
              ]
            : [
                KV('Net', d.fmt.money(num(p.amount), p.currency)),
                KV('Components', 'Not reported yet'),
                KV('Destination', d.a.dest ? p.destination : LOCK),
              ],
        },
        {
          h: 'Dates',
          kv: [
            KV('Created', d.fmt.dtm(p.providerCreatedAt)),
            KV('Expected arrival', d.fmt.day(p.arrivalDate)),
            KV('Bank reference', bm?.ref),
            KV('Data source', 'Stripe payout API'),
          ],
        },
        ...(late
          ? [
              {
                h: 'Delay',
                warn: `Expected ${d.fmt.rel(p.arrivalDate)}. Stripe hasn’t reported it as paid. Noxtill doesn’t call this “missing money” — refresh the provider status or check the Stripe dashboard.`,
              },
            ]
          : []),
        ...(p.status === 'Failed'
          ? [
              {
                h: 'Failure',
                warn: `Stripe reported the payout failed: ${p.failureCode ?? 'no code'}. The money returns to your Stripe balance.`,
              },
            ]
          : []),
        {
          h: 'Status timeline',
          items: [
            {
              a: 'Payout created',
              c: d.fmt.dtm(p.providerCreatedAt),
              b: 'Provider',
              d: '',
            },
            {
              a: `Payout ${p.status.toLowerCase()}`,
              c: d.fmt.day(p.arrivalDate),
              b: p.status,
              d: p.providerPayoutId,
            },
            ...(p.status === 'Paid'
              ? [
                  {
                    a: bm?.matched ? 'Bank Matched' : 'Bank Match Pending',
                    c: 'Finance & Accounting',
                    b: bm?.matched ? 'Matched' : 'Pending',
                    d: 'Bank reconciliation is Finance-owned',
                  },
                ]
              : []),
          ],
        },
        {
          h: `Included transactions (${bts.filter((b) => b.type !== 'payout').length})`,
          items: bts.length
            ? bts
                .filter((b) => b.type !== 'payout')
                .slice(0, 25)
                .map((b) => {
                  const t = b.txId ? txs.get(b.txId) : null;
                  return {
                    a: t
                      ? `${t.number} · ${this.data.cname(d, t.customerId)}`
                      : `${b.type} · ${b.sourceObjectId ?? b.providerTxnId}`,
                    c: `${b.sourceObjectId ?? ''} · ${d.fmt.dtm(b.occurredAt)}`,
                    b: d.fmt.money(num(b.amount), b.currency),
                    d:
                      d.a.fees && num(b.fee)
                        ? `fee ${d.fmt.money(num(b.fee), b.currency)}`
                        : '',
                  };
                })
            : [{ a: 'Not reported yet', c: '', b: '', d: '' }],
        },
      ],
      hasActs: true,
      acts: [
        btn('po:Refresh provider status', 'Refresh provider status', 'primary'),
        btn(
          'po:Export settlement report',
          'Export settlement report',
          'ghost',
          !d.a.export,
        ),
        btn('ext:/finance/bank-feeds', 'Open Finance bank reconciliation'),
      ],
    };
  }

  private async mnd(d: Data, id: string) {
    const m = await this.db.payMandate.findFirst({
      where: { id, businessId: d.a.rootId },
    });
    if (!m)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Mandate not found',
        HttpStatus.NOT_FOUND,
      );
    const hist = await this.db.payMandateAttempt.findMany({
      where: { mandateId: m.id },
      orderBy: { dueAt: 'desc' },
      take: 24,
    });
    const acts = this.views
      .mndActs(d, m)
      .filter((x) => x !== 'Open')
      .slice(0, 4);
    return {
      ...this.base,
      kicker: `Mandate · ${m.planRef}`,
      title: `${this.data.cname(d, m.customerId)} · ${m.planName}`,
      badges: [
        BS(m.status),
        this.env(d),
        ...(m.legacyPlatform
          ? [B('Legacy · platform account', '#FEF6E7', '#B54708')]
          : []),
      ],
      sections: [
        {
          h: 'Mandate',
          kv: [
            KV('Source', `${m.sourceModule} · ${m.planRef}`),
            KV('Source plan status', m.planStatus),
            KV(
              'Provider',
              m.kind === 'manual'
                ? 'Collected at the counter'
                : `Stripe${m.providerSubscriptionId ? ` · ${d.a.raw ? m.providerSubscriptionId : `${m.providerSubscriptionId.slice(0, 8)}…`}` : ' · checkout not completed'}`,
            ),
            KV(
              'Payment method',
              m.kind === 'manual'
                ? '—'
                : 'Saved with Stripe (token never stored in Noxtill)',
            ),
            KV(
              'Amount rule',
              `Fixed ${d.fmt.money(num(m.amount), m.currency)} (from source plan)`,
            ),
            KV('Frequency', m.frequency),
            KV('Next charge', d.fmt.day(m.nextChargeAt)),
            KV(
              'Retry policy',
              m.kind === 'manual'
                ? 'Not applicable'
                : 'Provider schedule (your Stripe Billing retry settings) + manual retry',
            ),
            KV('Failed attempts this cycle', m.attempts),
          ],
        },
        {
          h: 'Attempts',
          items: hist.length
            ? hist.map((h) => ({
                a: `${d.fmt.day(h.dueAt)} · ${d.fmt.money(num(h.amount), m.currency)}`,
                c: `key ${h.idemKey}`,
                b: h.status,
                d: h.failureCode ?? '',
              }))
            : [{ a: 'No attempts recorded yet', c: '', b: '', d: '' }],
        },
        {
          h: 'Ownership',
          text: m.legacyPlatform
            ? 'This membership was billed on the Noxtill platform Stripe account before your own Stripe account was connected. Stripe can’t move a subscription between accounts; new sign-ups bill on your own account. Cancel or change it in Customers › Memberships.'
            : `Payments runs the mandate and attempts. ${m.sourceModule} owns the plan, entitlement and pricing. Raw card details are never stored.`,
        },
      ],
      hasActs: d.a.recover && acts.length > 0,
      acts: acts.map((x) =>
        btn(
          `md:${x}`,
          x,
          x === 'Retry'
            ? 'primary'
            : x === 'Cancel mandate'
              ? 'danger'
              : 'ghost',
        ),
      ),
    };
  }

  private async rec(d: Data, id: string) {
    const r = await this.db.payReconItem.findFirst({
      where: { id, businessId: d.a.rootId },
    });
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    const t = r.txId
      ? await this.db.payTransaction.findUnique({ where: { id: r.txId } })
      : r.candidateTxId
        ? await this.db.payTransaction.findUnique({
            where: { id: r.candidateTxId },
          })
        : null;
    const split = Array.isArray(r.splitTxIds)
      ? await this.db.payTransaction.findMany({
          where: { id: { in: r.splitTxIds as string[] } },
        })
      : [];
    const names = await this.ctx.userNames([r.resolvedById]);
    const diff =
      r.providerGross != null && r.noxtillGross != null
        ? num(r.providerGross) - num(r.noxtillGross)
        : 0;
    const acts = this.views
      .recActs(d, r)
      .filter((x) => x !== 'Open')
      .slice(0, 4);
    return {
      ...this.base,
      kicker: 'Reconciliation item · Stripe',
      title: `${r.providerRef.startsWith('nx:') ? (t?.number ?? 'Noxtill payment') : r.providerRef} · ${r.status}`,
      badges: [
        BS(r.status),
        ...(r.status === 'Suggested'
          ? [B(`${r.confidence} confidence · suggest only`)]
          : []),
      ],
      sections: [
        {
          h: 'Provider says',
          kv: [
            KV(
              'Reference',
              r.providerRef.startsWith('nx:') ? 'Not reported' : r.providerRef,
            ),
            KV('Batch / payout', r.batchRef),
            KV(
              'Gross',
              r.providerGross == null
                ? 'Not reported'
                : d.fmt.money(num(r.providerGross), r.currency),
            ),
            KV(
              'Fee',
              d.a.fees
                ? r.providerFee == null
                  ? '—'
                  : d.fmt.money(num(r.providerFee), r.currency)
                : LOCK,
            ),
            KV('Time', d.fmt.dtm(r.occurredAt)),
            KV('Type', r.type),
          ],
        },
        {
          h: 'Noxtill says',
          kv: [
            KV(
              'Transaction',
              t ? `${t.number}${r.txId ? '' : ' (candidate)'}` : 'None',
            ),
            KV(
              'Gross',
              r.noxtillGross == null
                ? 'Not in Noxtill'
                : d.fmt.money(num(r.noxtillGross), r.currency),
            ),
            KV(
              'Fee',
              t && d.a.fees
                ? t.fee == null
                  ? 'Not reported'
                  : d.fmt.money(num(t.fee), t.currency)
                : '—',
            ),
            KV('Time', t ? d.fmt.dtm(t.occurredAt) : '—'),
            KV(
              'Customer / source',
              t
                ? `${this.data.cname(d, t.customerId)} · ${this.data.srcLabel(t)}`
                : '—',
            ),
            KV('Provider ref on record', t?.providerChargeId),
          ],
        },
        {
          h: 'Difference',
          text:
            [
              diff && Math.abs(diff) >= 0.005
                ? `Gross differs by ${d.fmt.money(diff, r.currency)}.`
                : '',
              r.note ?? '',
              r.suggestionWhy ?? '',
            ]
              .filter(Boolean)
              .join(' ') || 'No difference.',
        },
        ...(split.length
          ? [
              {
                h: 'Split payments',
                items: split.map((x) => ({
                  a: x.number,
                  c: x.providerChargeId ?? '',
                  b: d.fmt.money(num(x.captured), x.currency),
                  d: d.fmt.dtm(x.occurredAt),
                })),
              },
            ]
          : []),
        ...(r.resolution
          ? [
              {
                h: 'Resolution',
                text: `${r.resolution}${r.resolvedById ? ` — ${names.get(r.resolvedById) ?? ''} · ${d.fmt.dtm(r.resolvedAt)}` : ''}`,
              },
            ]
          : []),
      ],
      hasActs: d.a.recon && acts.length > 0,
      acts: acts.map((x, i) =>
        btn(`rn:${x}`, x, i === 0 ? 'primary' : 'ghost'),
      ),
    };
  }

  private async ai(d: Data) {
    const ex = (await this.views.exceptions(d)).slice(0, 6);
    return {
      ...this.base,
      kicker: 'Ask AI · explains, never moves money',
      title: 'What needs attention',
      badges: [this.env(d)],
      sections: [
        {
          h: 'Summary from your data',
          text: ex.length
            ? ex
                .map(
                  (x, i) =>
                    `${i + 1}. ${x.issue} — ${x.amt == null ? '' : `${d.fmt.money(x.amt, x.cur)} · `}${this.data.provName(x.prov)}. Next: ${x.next}.`,
                )
                .join('\n')
            : 'Nothing needs attention in this scope.',
        },
        {
          h: 'What AI can’t do',
          bullets: [
            'Approve or execute refunds',
            'Change approved amounts',
            'Mark anything paid, refunded or settled',
            'Submit dispute responses',
            'Silently change settings',
          ],
        },
      ],
    };
  }

  private async audit(d: Data) {
    const rows = await this.db.payAudit.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const ob = await this.db.payOutbox.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const pv = await this.db.payPolicyVersion.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { version: 'desc' },
      take: 10,
    });
    const names = await this.ctx.userNames(pv.map((x) => x.byId));
    return {
      ...this.base,
      kicker: 'Audit log · append-only',
      title: 'Payments & Billing',
      sections: [
        {
          h: 'Recent actions',
          items: rows.length
            ? rows.map((x) => ({
                a: x.action,
                c: `${x.actorName} · ${d.fmt.dtm(x.createdAt)}`,
                b: x.corr ?? '',
                d: x.detail,
              }))
            : [{ a: 'No actions yet', c: '', b: '', d: '' }],
        },
        {
          h: 'Outbox events (transactional)',
          items: ob.length
            ? ob.map((o) => ({
                a: o.event,
                c: `${d.fmt.dtm(o.createdAt)} → ${(o.consumers as string[]).join(', ')}`,
                b: o.status,
                d: '',
              }))
            : [{ a: 'No events emitted yet', c: '', b: '', d: '' }],
        },
        {
          h: 'Policy history',
          items: pv.map((x) => ({
            a: `v${x.version}${x.highRisk ? ' · high-risk' : ''}`,
            c: `${names.get(x.byId) ?? x.byId} · ${d.fmt.dtm(x.createdAt)}`,
            b: (x.changed as string[]).join(', ') || 'Defaults',
            d: x.reason ?? '',
          })),
        },
      ],
    };
  }

  private async approvals(d: Data) {
    const rows = await this.db.payApproval.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const names = await this.ctx.userNames(
      rows.flatMap((x) => [x.requestedById, x.decidedById]),
    );
    const pending = rows.filter((x) => x.status === 'Pending');
    return {
      ...this.base,
      kicker: 'Action Center',
      title: 'Payment approvals',
      sections: [
        {
          h: 'Pending & recent',
          items: rows.length
            ? rows.map((x) => ({
                a: `${x.kind} · ${x.title}`,
                c: `${names.get(x.requestedById) ?? x.requestedById} · ${d.fmt.dtm(x.createdAt)}`,
                b: x.amount != null ? d.fmt.money(num(x.amount)) : '',
                d:
                  x.status === 'Pending'
                    ? 'Pending'
                    : `${x.status} by ${names.get(x.decidedById ?? '') ?? '—'}`,
              }))
            : [{ a: 'No approvals requested', c: '', b: '', d: '' }],
        },
        {
          h: 'Engine',
          text: 'Approvals appear in the central Action Center on the Dashboard. Payments only records the decision and runs the approved action.',
        },
      ],
      hasActs: d.a.approve && pending.length > 0,
      acts: d.a.approve
        ? pending
            .slice(0, 3)
            .map((x) =>
              btn(
                `apr:${x.id}`,
                `Approve ${x.kind} · ${x.title.slice(0, 24)}`,
                'primary',
              ),
            )
        : [],
    };
  }

  private help(d: Data) {
    return {
      ...this.base,
      kicker: 'Help',
      title: 'Payments & Billing',
      badges: [this.env(d)],
      sections: [
        {
          h: 'What lives here',
          text: 'Money requested, collected, failed, refunded, disputed and paid out — the operational payment ledger. Accounting entries live in Finance & Accounting; invoices and returns stay in Orders; plans stay in Customers and Credit.',
        },
        {
          h: 'Providers',
          bullets: [
            'Stripe — full: payment links, capture, refunds, disputes, payouts (connect in Integrations with payment access)',
            'Square, PayPal — read-only imports',
            'Cash and counter payments — from Fast Sale, deposits and credit',
            'PayFast, JazzCash, Easypaisa — not available (no adapter)',
          ],
        },
        {
          h: 'Safety',
          bullets: [
            'Every money action carries an idempotency key',
            '“Succeeded” only after the provider confirms',
            'Test mode never reaches live totals',
          ],
        },
      ],
    };
  }
}
