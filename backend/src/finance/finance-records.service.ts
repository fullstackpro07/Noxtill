import { HttpStatus, Injectable } from '@nestjs/common';
import { FinJournal, FinJournalLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  monthKey,
  monthLabel,
  num,
  r2,
  FAR_FUTURE,
} from './finance-context.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { SOURCE_MODULE } from './finance-sources.service';
import { FinanceBankingService, Suggestion } from './finance-banking.service';
import { FinanceReceivablesService } from './finance-receivables.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinanceTaxService, TaxCalc } from './finance-tax.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceCloseService } from './finance-close.service';
import { FinanceViewsService, ScopeQuery, Ctx } from './finance-views.service';
import { APPROVER_LABEL, approvalLevel } from './finance-posting.service';
import { ACCOUNT_TYPES, FIN_ERRORS } from './finance.constants';
import { L, ListItem, md, mdy, money } from './finance-format';

export interface Act {
  l: string;
  a: string;
  kind: 'p' | 's' | 'd';
  dis?: boolean;
  why?: string;
}
export interface Trace {
  mod: string;
  ref: string;
  d: string;
  href?: string;
  open?: string;
}
export interface Rec {
  kind: string;
  title: string;
  sub: string;
  status: string;
  amount: string;
  tabs: string[];
  kv: [string, string][];
  adv: [string, string][];
  note: string;
  noteTone: 'info' | 'warn' | 'bad';
  lines: { acct: string; desc: string; dr: number | null; cr: number | null }[];
  trace: Trace[];
  lists: Record<string, ListItem[]>;
  actions: Act[];
  compare?: unknown;
  threeWay?: unknown;
  evidence?: { type: string; id: string };
  cur: string;
}

const TABS = [
  'Overview',
  'Accounting',
  'Source',
  'Evidence',
  'Activity',
  'Audit',
];
const atLabel = (d: Date) => `${mdy(d)}, ${d.toISOString().slice(11, 16)} UTC`;

/** The record drawer for every Finance row: real fields, real lines, a real source trail. */
@Injectable()
export class FinanceRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly ledger: FinanceLedgerService,
    private readonly views: FinanceViewsService,
    private readonly banking: FinanceBankingService,
    private readonly ar: FinanceReceivablesService,
    private readonly ap: FinancePayablesService,
    private readonly tax: FinanceTaxService,
    private readonly assets: FinanceAssetsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly close: FinanceCloseService,
  ) {}

  private R(c: Ctx, o: Partial<Rec> & { kind: string; title: string }): Rec {
    return {
      sub: '',
      status: '',
      amount: '',
      tabs: TABS,
      kv: [],
      adv: [],
      note: '',
      noteTone: 'info',
      lines: [],
      trace: [],
      lists: {},
      actions: [],
      cur: c.base,
      ...o,
    };
  }

  private async audit(
    rootId: string,
    type: string,
    id: string,
  ): Promise<ListItem[]> {
    const rows = await this.prisma.finAudit.findMany({
      where: { businessId: rootId, subjectType: type, subjectId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) =>
      L(
        `${r.action.replace(/[._]/g, ' ')} · ${r.actorName}`,
        `${atLabel(r.createdAt)} · finance.${r.action}`,
        r.detail ?? '',
      ),
    );
  }

  private async approvals(
    rootId: string,
    type: string,
    id: string,
  ): Promise<ListItem[]> {
    const rows = await this.prisma.finApproval.findMany({
      where: { businessId: rootId, subjectType: type, subjectId: id },
      orderBy: { createdAt: 'desc' },
    });
    const names = await this.ctx.userNames(
      rows.flatMap((r) => [r.requestedById, r.decidedById]),
    );
    return rows.map((r) =>
      L(
        `${r.status}${r.decidedById ? ` by ${names.get(r.decidedById) ?? '—'}` : ` · waiting on ${r.approverRole.replace('/', ' / ')}`}`,
        `${r.rule} · requested by ${names.get(r.requestedById) ?? '—'} ${md(r.createdAt)}`,
        r.comment ?? '',
      ),
    );
  }

  private files(list: unknown): ListItem[] {
    return (
      (Array.isArray(list) ? list : []) as {
        name: string;
        by?: string;
        at?: string;
        size?: number;
        key: string;
      }[]
    ).map((f) => ({
      ...L(
        f.name,
        `Uploaded by ${f.by ?? '—'}${f.at ? ` · ${mdy(new Date(f.at))}` : ''}`,
        f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : '',
      ),
      k: f.key,
    }));
  }

  private lineView(c: Ctx, ls: FinJournalLine[], txn = false) {
    return ls.map((l) => ({
      acct: l.accountId
        ? `${c.byId.get(l.accountId)?.code ?? ''} ${c.byId.get(l.accountId)?.name ?? ''}`.trim()
        : 'No account',
      desc: l.description ?? '',
      dr: (txn ? num(l.txnDebit) : num(l.debit)) || null,
      cr: (txn ? num(l.txnCredit) : num(l.credit)) || null,
    }));
  }

  /** Where a system journal came from, with links into the module that owns the record. */
  private async sourceTrace(c: Ctx, j: FinJournal): Promise<Trace[]> {
    const t: Trace[] = [];
    const id = j.sourceId ?? '';
    const branches = c.branches.map((b) => b.id);
    switch (j.sourceType) {
      case 'order': {
        const o = await this.prisma.order.findFirst({
          where: { id, businessId: { in: branches } },
          select: {
            orderNo: true,
            status: true,
            createdAt: true,
            customerId: true,
            businessId: true,
          },
        });
        if (o) {
          if (o.customerId)
            t.push({
              mod: 'Customers',
              ref:
                (
                  await this.prisma.customer.findUnique({
                    where: { id: o.customerId },
                    select: { name: true },
                  })
                )?.name ?? 'Customer',
              d: 'Customer record',
              href: `/customers/${o.customerId}`,
            });
          t.push({
            mod: 'Orders',
            ref: `Order #${o.orderNo}`,
            d: `${o.status === 'completed' ? 'Completed sale' : `Now ${o.status}`} · ${this.views['branchName'](c, o.businessId)} · ${mdy(o.createdAt)}`,
            href: `/orders?order=${id}`,
          });
        } else
          t.push({
            mod: 'Orders',
            ref: j.sourceLabel ?? 'Order',
            d: 'Source record no longer exists',
          });
        break;
      }
      case 'payment': {
        const p = await this.prisma.payment.findUnique({
          where: { id },
          include: { order: { select: { id: true, orderNo: true } } },
        });
        if (p) {
          t.push({
            mod: 'Orders',
            ref: `Order #${p.order.orderNo}`,
            d: 'Sale being settled',
            href: `/orders?order=${p.order.id}`,
          });
          t.push({
            mod: 'Payments',
            ref: `${p.method} ${money(num(p.amount), c.base)}`,
            d: `Recorded ${mdy(p.createdAt)}${p.providerRef ? ` · ref ${p.providerRef}` : ''}`,
          });
        }
        break;
      }
      case 'credit': {
        const e = await this.prisma.creditEntry.findUnique({
          where: { id },
          include: { customer: { select: { name: true } } },
        });
        if (e)
          t.push({
            mod: 'Customer credit',
            ref: `${e.customer.name} · ${e.kind.replace('_', '-')}`,
            d: `${mdy(e.createdAt)}${e.note ? ` · ${e.note}` : ''}`,
            href: `/credit/${e.customerId}`,
          });
        break;
      }
      case 'return': {
        const r = await this.prisma.return.findUnique({
          where: { id },
          include: { order: { select: { id: true, orderNo: true } } },
        });
        if (r)
          t.push(
            {
              mod: 'Orders',
              ref: `Order #${r.order.orderNo}`,
              d: 'Original sale',
              href: `/orders?order=${r.order.id}`,
            },
            {
              mod: 'Returns',
              ref: `Return · ${r.refundMethod.replace('_', ' ')}`,
              d: `${r.status} · ${r.reason}`,
              href: '/orders/returns',
            },
          );
        break;
      }
      case 'stock': {
        const m = await this.prisma.stockMovement.findUnique({
          where: { id },
          include: { product: { select: { name: true } } },
        });
        if (m)
          t.push({
            mod: 'Inventory',
            ref: `${m.kind.replace('_', ' ')} · ${m.product.name}`,
            d: `${m.qty} units${m.unitCost != null ? ` @ ${money(num(m.unitCost), c.base)}` : ''} · ${mdy(m.createdAt)}`,
            href:
              m.kind === 'purchase'
                ? '/inventory/purchases'
                : '/inventory/movements',
          });
        break;
      }
      case 'expense': {
        const e = await this.prisma.expense.findUnique({ where: { id } });
        t.push(
          e
            ? {
                mod: 'Expenses',
                ref: `${e.category} · ${money(num(e.amount), c.base)}`,
                d: `${e.description.slice(0, 80)} · ${mdy(e.incurredOn)}`,
                href: '/expenses',
              }
            : {
                mod: 'Expenses',
                ref: 'Expense',
                d: 'Deleted in Expenses — this journal was reversed',
              },
        );
        break;
      }
      case 'voucher':
        t.push({
          mod: 'Vouchers',
          ref: j.reference ?? 'Voucher',
          d: 'Issued voucher',
          href: '/marketing',
        });
        break;
      case 'cash':
      case 'shift':
        t.push({
          mod: 'Cash register',
          ref: j.sourceLabel ?? 'Cash movement',
          d: 'Register record',
          href: '/sales',
        });
        break;
      case 'deposit':
        t.push({
          mod: 'Booking deposits',
          ref: j.reference ?? 'Deposit',
          d: j.sourceLabel ?? '',
          href: '/bookings',
        });
        break;
      case 'bill':
      case 'billpay': {
        const billId =
          j.sourceType === 'bill'
            ? id
            : (await this.prisma.finBillPayment.findUnique({ where: { id } }))
                ?.billId;
        const b = billId
          ? await this.prisma.finBill.findUnique({ where: { id: billId } })
          : null;
        if (b)
          t.push({
            mod: 'Bills',
            ref: `${b.number} · ${b.vendorName}`,
            d: `${b.status}${b.vendorInvoiceNo ? ` · vendor inv ${b.vendorInvoiceNo}` : ''}`,
            open: `openRec:bills|${b.id}`,
          });
        break;
      }
      case 'asset':
      case 'depreciation':
        t.push({
          mod: 'Fixed Assets',
          ref: j.sourceLabel ?? 'Asset',
          d: j.memo ?? '',
          open: j.sourceType === 'asset' ? `openRec:fa|${id}` : 'go:fa',
        });
        break;
      case 'bankline': {
        const bl = await this.prisma.finBankLine.findUnique({ where: { id } });
        if (bl)
          t.push({
            mod: 'Bank feeds',
            ref: bl.description,
            d: `${mdy(bl.date)} · ${money(num(bl.amount), c.base)}`,
            open: `openRec:feeds|${bl.id}`,
          });
        break;
      }
      case 'bankopen':
        t.push({
          mod: 'Bank & cash',
          ref: j.sourceLabel ?? 'Opening balance',
          d: 'Opening balance entered when the account was added',
          open: `openRec:bankacc|${id}`,
        });
        break;
      case 'fx':
        t.push({
          mod: 'FX revaluation',
          ref: j.sourceLabel ?? '',
          d: 'Closing-rate revaluation',
          open: 'go:settings',
        });
        break;
      default:
        t.push({
          mod: 'Manual',
          ref: j.reversalOfId ? 'Reversal' : 'Journal',
          d: 'Prepared in Finance',
        });
    }
    t.push({
      mod: 'Journal',
      ref: j.number,
      d:
        j.status === 'Posted' || j.status === 'Reversed'
          ? `Posted ${mdy(j.postedAt)}`
          : j.status,
      open: `openRec:journals|${j.id}`,
    });
    t.push({
      mod: 'General ledger',
      ref: 'Lines',
      d: j.postedAt ? 'Immutable' : 'Not posted',
    });
    return t;
  }

  async record(
    actor: FinActor,
    kind: string,
    id: string,
    q: ScopeQuery,
  ): Promise<Rec> {
    const c = await this.views.scope(actor, q);
    const fn: Record<string, () => Promise<Rec>> = {
      journals: () => this.journal(c, id),
      gl: () => this.glLine(c, id),
      coa: () => this.account(c, id, q),
      feeds: () => this.feed(c, id),
      recon: () => this.recon(c, id),
      ar: () => this.arItem(c, id),
      ap: () => (id === 'AP-DIFF' ? this.apDiff(c) : this.bill(c, id, 'ap')),
      bills: () => this.bill(c, id, 'bills'),
      taxes: () => this.taxReturn(c, id),
      fa: () => this.asset(c, id),
      budgets: () => this.budgetLine(c, id),
      close: () => this.closeTask(c, id),
      bankacc: () => this.bankAccount(c, id),
      statements: () => this.drill(c, id),
    };
    if (!fn[kind])
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Unknown record kind',
        HttpStatus.NOT_FOUND,
      );
    return fn[kind]();
  }

  // ── journals & ledger ────────────────────────────────────────────────────

  async journal(c: Ctx, id: string): Promise<Rec> {
    const j = await this.prisma.finJournal.findFirst({
      where: { businessId: c.rootId, OR: [{ id }, { number: id }] },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!j)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Journal not found',
        HttpStatus.NOT_FOUND,
      );
    const cfg = await this.ctx.config(c.rootId);
    const names = await this.ctx.userNames([
      j.preparedById,
      j.approvedById,
      j.postedById,
    ]);
    const dr = r2(j.lines.reduce((a, l) => a + num(l.debit), 0));
    const cr = r2(j.lines.reduce((a, l) => a + num(l.credit), 0));
    const diff = r2(dr - cr);
    const touches = j.lines.some(
      (l) => l.accountId && c.byId.get(l.accountId)?.control,
    );
    const level = approvalLevel(cfg, dr, touches);
    const pend = await this.prisma.finApproval.findFirst({
      where: {
        businessId: c.rootId,
        subjectType: 'journal',
        subjectId: j.id,
        status: 'Pending',
      },
    });
    const rev = j.reversedById
      ? await this.prisma.finJournal.findUnique({
          where: { id: j.reversedById },
          select: { id: true, number: true, postedAt: true },
        })
      : null;
    const orig = j.reversalOfId
      ? await this.prisma.finJournal.findUnique({
          where: { id: j.reversalOfId },
          select: { id: true, number: true },
        })
      : null;
    const { year, month } = monthKey(j.date);
    const per = await this.ctx.period(c.rootId, year, month);
    const a = c.actor;
    const mine = j.preparedById === a.userId;
    const acts: Act[] = [];
    const manual = j.sourceType == null;
    if (manual && j.status === 'Draft') {
      acts.push({
        l: 'Edit Draft',
        a: `editJournal:${j.id}`,
        kind: 's',
        dis: !a.manage,
        why: a.manage ? '' : 'Needs finance.manage',
      });
      if (level === 'none')
        acts.push({
          l: 'Post Journal',
          a: `postJournal:${j.id}`,
          kind: 'p',
          dis: diff !== 0 || !a.manage,
          why: diff !== 0 ? 'Balance the journal first' : '',
        });
      acts.push({
        l: 'Submit for Approval',
        a: `submitJournal:${j.id}`,
        kind: level === 'none' ? 's' : 'p',
        dis: diff !== 0 || !a.manage,
        why: diff !== 0 ? 'Balance the journal first' : '',
      });
      acts.push({
        l: 'Void Draft',
        a: `voidJournal:${j.id}`,
        kind: 'd',
        dis: !a.manage,
      });
    }
    if (j.status === 'Pending Review')
      acts.push({
        l: 'Mark Reviewed',
        a: `reviewJournal:${j.id}`,
        kind: 'p',
        dis: (cfg.sod.sod1 && mine) || !a.manage,
        why:
          cfg.sod.sod1 && mine
            ? 'You prepared this journal — someone else reviews it'
            : '',
      });
    if (j.status === 'Approval Required') {
      const can = level === 'admin' ? a.admin : a.approve;
      acts.push({
        l: 'Review & Approve',
        a: `approveJournal:${j.id}`,
        kind: 'p',
        dis: !can || (cfg.sod.sod1 && mine),
        why: !can
          ? `Needs ${APPROVER_LABEL[level === 'none' ? 'approve' : level]}`
          : cfg.sod.sod1 && mine
            ? 'You can’t approve your own journal'
            : '',
      });
      if (manual)
        acts.push({
          l: 'Void',
          a: `voidJournal:${j.id}`,
          kind: 'd',
          dis: !a.manage,
        });
    }
    if (j.status === 'Ready to Post')
      acts.push({
        l: 'Post Journal',
        a: `postJournal:${j.id}`,
        kind: 'p',
        dis: !a.manage,
      });
    if (j.status === 'Posted') {
      if (manual) {
        acts.push({
          l: 'Reverse Journal',
          a: `reverseJournal:${j.id}`,
          kind: 's',
          dis: !a.manage || !!rev,
        });
        acts.push({
          l: 'Create Adjustment',
          a: `adjustJournal:${j.id}`,
          kind: 's',
          dis: !a.manage,
        });
      }
      acts.push({ l: 'Export', a: `exportJournal:${j.id}`, kind: 's' });
    }
    if (j.status === 'Reversed' && rev)
      acts.push({
        l: `Open Reversal ${rev.number}`,
        a: `openRec:journals|${rev.id}`,
        kind: 's',
      });
    if (j.status === 'Failed') {
      const bad = j.lines
        .map((l) => (l.accountId ? c.byId.get(l.accountId) : null))
        .find((x) => x && !x.active);
      if (bad)
        acts.push({
          l: `Open Account ${bad.code}`,
          a: `openRec:coa|${bad.id}`,
          kind: 's',
        });
      if (manual)
        acts.push({
          l: 'Edit Draft',
          a: `editJournal:${j.id}`,
          kind: 's',
          dis: !a.manage,
        });
      acts.push({
        l: 'Retry Posting',
        a: `postJournal:${j.id}`,
        kind: 'p',
        dis: !a.manage,
      });
    }
    let note = '';
    let tone: Rec['noteTone'] = 'info';
    if (j.status === 'Posted')
      note = manual
        ? 'Posted entries are immutable. To correct this journal, reverse it or post an adjustment — the original stays unchanged and linked.'
        : `Generated from ${j.sourceLabel ?? 'a source record'}. To change it, change that record — the ledger follows automatically with a reversal and a new revision.`;
    if (j.status === 'Reversed')
      note = `This journal was reversed${rev ? ` by ${rev.number}${rev.postedAt ? ` on ${mdy(rev.postedAt)}` : ''}` : ''}. Its lines remain in the ledger, offset by the reversal.`;
    if (diff !== 0) {
      note = `This journal cannot be posted because debit and credit totals differ by ${money(Math.abs(diff), c.base)}.`;
      tone = 'bad';
    }
    if (j.status === 'Failed') {
      note = `Posting failed and nothing was committed: ${j.failureReason ?? 'validation failed'}`;
      tone = 'bad';
    }
    if (j.status === 'Approval Required') {
      note = `Waiting on ${pend?.approverRole.replace('/', ' / ') ?? APPROVER_LABEL[level === 'none' ? 'approve' : level]} — ${pend?.rule ?? ''}`;
      tone = 'warn';
    }
    if (j.status === 'Voided')
      note =
        'Voided — this journal never touched the ledger. It stays in history.';
    const typeL = j.sourceType
      ? `System · ${SOURCE_MODULE[j.sourceType] ?? j.sourceType}`
      : j.type === 'Reversal'
        ? 'Reversal'
        : `Manual · ${j.type}`;
    const fxLine = j.lines.find((l) => num(l.fxRate) !== 1);
    const activity: ListItem[] = [
      L(
        'Prepared',
        `${j.preparedById ? (names.get(j.preparedById) ?? '—') : 'System'} · ${atLabel(j.createdAt)}`,
      ),
    ];
    if (j.submittedAt) activity.push(L('Submitted', atLabel(j.submittedAt)));
    if (j.approvedAt)
      activity.push(
        L(
          'Approved',
          `${names.get(j.approvedById ?? '') ?? '—'} · ${atLabel(j.approvedAt)}`,
        ),
      );
    if (j.postedAt)
      activity.push(
        L(
          'Posted',
          `${j.postedById ? (names.get(j.postedById) ?? '—') : 'System'} · ${atLabel(j.postedAt)}`,
        ),
      );
    activity.push(L(j.status, 'Current status'));
    return this.R(c, {
      kind: 'Journal',
      title: j.number,
      sub: j.memo ?? j.sourceLabel ?? '',
      status: j.status,
      amount: money(dr, c.base),
      note,
      noteTone: tone,
      kv: [
        ['Journal date', mdy(j.date)],
        ['Type', typeL],
        ['Reference', j.reference ?? '—'],
        ['Entity', c.entity],
        ['Branch', this.views['branchName'](c, j.branchId)],
        [
          'Period',
          `${monthLabel(year, month)} · ${per.status === 'locked' ? 'Locked' : per.status === 'soft' ? 'Soft close' : 'Open'}`,
        ],
        ['Currency', j.currency],
        [
          'Prepared by',
          j.preparedById ? (names.get(j.preparedById) ?? '—') : 'System',
        ],
        [
          'Approver',
          j.approvedById
            ? (names.get(j.approvedById) ?? '—')
            : pend
              ? `${pend.approverRole.replace('/', ' / ')} (pending)`
              : manual
                ? level === 'none'
                  ? 'Not required'
                  : '—'
                : 'Auto-posted',
        ],
        [
          'Source',
          j.sourceLabel ?? (orig ? `Reversal of ${orig.number}` : 'Manual'),
        ],
        ['Version', `v${j.version}`],
      ],
      adv: [
        ['Journal ID', j.id],
        [
          'Source key',
          j.sourceType
            ? `${j.sourceType}:${j.sourceId}:${j.sourceEvent} rev ${j.sourceRev}`
            : '—',
        ],
        ['Reversal of', orig?.number ?? '—'],
        ['Reversed by', rev?.number ?? '—'],
        ['Auto-reverse on', j.autoReverseOn ? mdy(j.autoReverseOn) : '—'],
        [
          'FX snapshot',
          fxLine
            ? `1 ${j.currency} = ${num(fxLine.fxRate)} ${c.base} (posted rate)`
            : 'Base currency — no FX',
        ],
      ],
      lines: this.lineView(c, j.lines),
      trace: await this.sourceTrace(c, j),
      lists: {
        Evidence: this.files(j.attachments),
        Activity: [
          ...activity,
          ...(await this.approvals(c.rootId, 'journal', j.id)),
        ],
        Audit: await this.audit(c.rootId, 'journal', j.id),
      },
      actions: acts,
      evidence: { type: 'journal', id: j.id },
    });
  }

  async glLine(c: Ctx, id: string): Promise<Rec> {
    const g = await this.prisma.finJournalLine.findFirst({
      where: { id, businessId: c.rootId },
      include: {
        journal: { include: { lines: { orderBy: { lineNo: 'asc' } } } },
      },
    });
    if (!g)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Ledger line not found',
        HttpStatus.NOT_FOUND,
      );
    const j = g.journal;
    const acct = g.accountId ? c.byId.get(g.accountId) : null;
    const mod = j.sourceType
      ? (SOURCE_MODULE[j.sourceType] ?? j.sourceType)
      : 'Manual';
    const names = await this.ctx.userNames([j.postedById, j.preparedById]);
    const trace = await this.sourceTrace(c, j);
    const src = trace[0];
    return this.R(c, {
      kind: 'Ledger entry',
      title: acct ? `${acct.code} ${acct.name}` : 'Ledger line',
      sub: g.description ?? j.memo ?? '',
      status: 'Posted',
      amount: num(g.debit)
        ? `Dr ${money(num(g.debit), c.base)}`
        : `Cr ${money(num(g.credit), c.base)}`,
      note: 'Posted GL entries are immutable. Corrections are made with a reversal or adjustment journal.',
      kv: [
        ['Posting date', mdy(g.date)],
        ['Journal', j.number],
        ['Account', acct ? `${acct.code} ${acct.name}` : '—'],
        [
          'Debit / credit',
          num(g.debit)
            ? `Debit ${money(num(g.debit), c.base)}`
            : `Credit ${money(num(g.credit), c.base)}`,
        ],
        ['Original currency', g.currency],
        ['Base currency', c.base],
        ['Branch', this.views['branchName'](c, g.branchId)],
        ['Department', g.department ?? '—'],
        ['Source module', mod],
        ['Source record', j.sourceLabel ?? j.reference ?? '—'],
        [
          'Actor',
          j.sourceType
            ? 'System (posting rule)'
            : (names.get(j.preparedById ?? '') ?? '—'),
        ],
        ['Posting timestamp', g.postedAt ? atLabel(g.postedAt) : '—'],
      ],
      adv:
        g.currency !== c.base
          ? [
              [
                'Transaction amount',
                money(num(g.txnDebit) || num(g.txnCredit), g.currency),
              ],
              ['FX rate snapshot', `${num(g.fxRate)} (immutable)`],
              ['Base amount', money(num(g.debit) || num(g.credit), c.base)],
              ['Line ID', g.id],
            ]
          : [
              ['FX', 'Base currency — no conversion'],
              ['Line ID', g.id],
            ],
      lines: this.lineView(c, j.lines),
      trace,
      lists: {
        Evidence: this.files(j.attachments),
        Activity: [
          L(
            'Posted',
            `${atLabel(g.postedAt ?? j.createdAt)} · ${j.sourceType ? 'System' : (names.get(j.postedById ?? '') ?? '—')}`,
          ),
        ],
        Audit: await this.audit(c.rootId, 'journal', j.id),
      },
      actions: [
        ...(src?.href
          ? [{ l: 'Open Source', a: `link:${src.href}`, kind: 's' as const }]
          : src?.open
            ? [{ l: 'Open Source', a: src.open, kind: 's' as const }]
            : []),
        { l: 'Open Journal', a: `openRec:journals|${j.id}`, kind: 's' },
        {
          l: 'Attach Evidence',
          a: `attach:journal:${j.id}`,
          kind: 's',
          dis: !c.actor.manage,
        },
        ...(j.sourceType == null && j.status === 'Posted'
          ? [
              {
                l: 'Create Reversal / Adjustment',
                a: `reverseJournal:${j.id}`,
                kind: 'p' as const,
                dis: !c.actor.manage,
              },
            ]
          : []),
      ],
      evidence: { type: 'journal', id: j.id },
    });
  }

  async account(c: Ctx, id: string, q: ScopeQuery): Promise<Rec> {
    const a = c.byId.get(id) ?? c.accounts.find((x) => x.code === id);
    if (!a)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Account not found',
        HttpStatus.NOT_FOUND,
      );
    const t = await this.ledger.totals(c.rootId, c.branchId, null, c.range.to);
    const bal = a.isHeader
      ? (this.ledger.rollup(c.accounts, t).get(a.id) ?? 0)
      : this.ledger.bal(t, a);
    const { rows } = await this.views.glLines(c, { ...q, account: a.id }, 50);
    const rules = await this.prisma.finBankRule.count({
      where: { businessId: c.rootId, accountId: a.id, active: true },
    });
    const codes = await this.prisma.finTaxCode.findMany({
      where: { businessId: c.rootId, accountId: a.id },
    });
    const bank = await this.prisma.finBankAccount.findFirst({
      where: { glAccountId: a.id },
    });
    const cfg = await this.ctx.config(c.rootId);
    const expenseCats = Object.entries(cfg.expenseMap)
      .filter(([, code]) => code === a.code)
      .map(([k]) => k);
    const parent = a.parentId ? c.byId.get(a.parentId) : null;
    const acts: Act[] = [
      { l: 'View Ledger', a: `glAccount:${a.id}`, kind: 's' },
      { l: 'Export', a: `exportAccount:${a.id}`, kind: 's' },
    ];
    if (a.active)
      acts.push({
        l: 'Deactivate',
        a: `deactivate:${a.id}`,
        kind: 'd',
        dis: !!a.control || a.isHeader || !!a.systemKey || !c.actor.admin,
        why: a.control
          ? 'Control accounts cannot be deactivated'
          : a.isHeader
            ? 'Headers cannot be deactivated'
            : a.systemKey
              ? 'Used by automatic postings'
              : !c.actor.admin
                ? 'Needs Owner / Controller'
                : '',
      });
    else
      acts.push({
        l: 'Reactivate',
        a: `reactivate:${a.id}`,
        kind: 's',
        dis: !c.actor.admin,
      });
    acts.push({
      l: a.control && !c.actor.admin ? 'Request Edit' : 'Edit Account',
      a: `editAccount:${a.id}`,
      kind: 'p',
      dis: !c.actor.manage,
    });
    return this.R(c, {
      kind: 'Account',
      title: `${a.code} ${a.name}`,
      sub: `${ACCOUNT_TYPES[a.type]} · ${a.subtype}`,
      status: !a.active ? 'Inactive' : a.isHeader ? 'Header' : 'Active',
      amount: money(bal, c.base),
      tabs: [
        'Overview',
        'Transactions',
        'Mappings',
        'Dimensions',
        'Activity',
        'Audit',
      ],
      note: a.control
        ? 'Control account — fed by a subledger. Code, type and currency can’t change after postings exist. Other edits need Owner / Controller approval.'
        : !a.active
          ? 'Inactive — no new postings allowed. All history is kept.'
          : 'Accounts are never deleted. Deactivate an account to stop new postings.',
      noteTone: a.control ? 'warn' : 'info',
      kv: [
        ['Code', a.code],
        ['Name', a.name],
        ['Type', ACCOUNT_TYPES[a.type]],
        ['Subtype', a.subtype],
        ['Parent', parent ? `${parent.code} ${parent.name}` : '—'],
        ['Currency', a.currency ?? c.base],
        ['Allow reconciliation', a.reconcilable ? 'Yes' : 'No'],
        ['Control account', a.control ? 'Yes' : 'No'],
        [`Balance (${md(c.range.to)})`, money(bal, c.base)],
        ['Description', a.description ?? '—'],
      ],
      adv: [
        ['Account ID', a.id],
        ['Posting rule key', a.systemKey ?? '—'],
        ['Requires department', a.requiresDepartment ? 'Yes' : 'No'],
      ],
      lists: {
        Transactions: rows.length
          ? rows.map((g) =>
              L(
                `${g.journal.number} · ${g.description ?? g.journal.memo ?? ''}`,
                `${md(g.date)} · ${g.journal.sourceType ? SOURCE_MODULE[g.journal.sourceType] : 'Manual'}`,
                num(g.debit)
                  ? `Dr ${money(num(g.debit), c.base)}`
                  : `Cr ${money(num(g.credit), c.base)}`,
              ),
            )
          : [
              L(
                `No postings in ${c.range.label}`,
                'Change the period to see other months',
              ),
            ],
        Mappings: [
          L(
            a.systemKey ? 'Automatic postings' : 'Manual postings only',
            a.systemKey
              ? `Posting rule “${a.systemKey.replace(/_/g, ' ')}”`
              : 'No posting rule uses this account',
          ),
          L(
            'Bank feed rules',
            rules ? `${rules} rule${rules === 1 ? '' : 's'} post here` : 'None',
          ),
          ...codes.map((x) =>
            L(`Tax code ${x.code}`, `${x.name} ${num(x.rate)}%`),
          ),
          ...(bank
            ? [
                L(
                  'Bank account',
                  `${bank.name}${bank.mask ? ` ••${bank.mask}` : ''}`,
                ),
              ]
            : []),
          ...(expenseCats.length
            ? [L('Expense categories', expenseCats.join(', '))]
            : []),
        ],
        Dimensions: [
          L('Branch', 'Recorded on every line'),
          L(
            'Department',
            a.requiresDepartment ||
              (cfg.posting.reqDept && a.type === 'expense')
              ? 'Required'
              : 'Optional',
          ),
        ],
        Activity: [
          L('Created', atLabel(a.createdAt)),
          L('Last changed', atLabel(a.updatedAt)),
        ],
        Audit: await this.audit(c.rootId, 'account', a.id),
      },
      actions: acts,
    });
  }

  // ── banking ──────────────────────────────────────────────────────────────

  async feed(c: Ctx, id: string): Promise<Rec> {
    const f = await this.banking.mustLine(c.rootId, id);
    const bank = await this.banking.mustAccount(c.rootId, f.bankAccountId);
    const s = f.suggestion as unknown as Suggestion | null;
    const amt = num(f.amount);
    const done = f.status === 'Matched' || f.status === 'Excluded';
    let right: [string, string][] = [['Record', 'No likely record found']];
    let diff = '—';
    let dfg = '#B42318';
    if (s) {
      right = [['Record', s.label]];
      if (s.kind === 'journal' && s.lineIds?.length) {
        const gl = await this.prisma.finJournalLine.findMany({
          where: { id: { in: s.lineIds } },
        });
        const v = r2(
          gl.reduce((x, g) => x + num(g.txnDebit) - num(g.txnCredit), 0),
        );
        right.push(
          ['Amount', money(v, bank.currency)],
          ['Date', gl[0] ? mdy(gl[0].date) : '—'],
          ['Currency', gl[0]?.currency ?? bank.currency],
          ['Owner module', 'Ledger (already posted)'],
        );
        diff =
          r2(v - amt) === 0
            ? 'No difference'
            : `${money(r2(v - amt), bank.currency)} difference`;
        dfg = r2(v - amt) === 0 ? '#0E8442' : '#B42318';
      } else if (s.kind === 'bill' && s.billId) {
        const b = await this.prisma.finBill.findUnique({
          where: { id: s.billId },
        });
        if (b) {
          const open = r2(num(b.total) - num(b.amountPaid));
          right.push(
            ['Amount', money(-open, b.currency)],
            ['Due', mdy(b.dueDate)],
            ['Currency', b.currency],
            ['Owner module', 'Bills'],
          );
          diff =
            r2(open + amt) === 0
              ? 'No difference'
              : `${money(r2(-amt - open), b.currency)} difference`;
          dfg = r2(open + amt) === 0 ? '#0E8442' : '#B42318';
        }
      } else {
        right.push(
          ['Amount', money(amt, bank.currency)],
          [
            'Account',
            s.accountId
              ? `${c.byId.get(s.accountId)?.code} ${c.byId.get(s.accountId)?.name}`
              : '—',
          ],
          [
            'Owner module',
            s.kind === 'rule'
              ? 'Finance rule'
              : 'Finance (new categorization journal)',
          ],
        );
        diff = 'No difference';
        dfg = '#0E8442';
      }
    }
    const mj = f.matchedJournalId
      ? await this.prisma.finJournal.findUnique({
          where: { id: f.matchedJournalId },
          include: { lines: true },
        })
      : null;
    const imp = f.importId
      ? await this.prisma.finBankImport.findUnique({
          where: { id: f.importId },
        })
      : null;
    const locked = f.reconciliationId
      ? (
          await this.prisma.finReconciliation.findUnique({
            where: { id: f.reconciliationId },
          })
        )?.status === 'Locked'
      : false;
    const m = c.actor.manage;
    return this.R(c, {
      kind: 'Bank transaction',
      title: f.description,
      sub: `${mdy(f.date)} · ${bank.name}${bank.mask ? ` ••${bank.mask}` : ''}`,
      status: f.status,
      amount: money(amt, bank.currency),
      tabs: ['Overview', 'Accounting', 'Evidence', 'Audit'],
      note:
        f.status === 'Excluded'
          ? `Excluded: ${f.excludeReason ?? ''}`
          : 'Matching links this bank line to ledger entries. It never marks a sale or bill as paid — record payments where they happen.',
      noteTone: 'warn',
      compare: {
        left: [
          ['Amount', money(amt, bank.currency)],
          ['Date', mdy(f.date)],
          ['Reference', f.reference ?? '—'],
          ['Payee', f.payee ?? '—'],
          ['Currency', bank.currency],
          [
            'Source',
            f.source === 'payout'
              ? 'Provider payout'
              : `Statement import${imp ? ` · ${imp.fileName}` : ''}`,
          ],
        ],
        right,
        diff,
        dfg,
        conf: f.confidence ? `${f.confidence}% confidence` : 'No suggestion',
        ev:
          s?.evidence ?? 'No payee, reference or amount match in open records',
        hasRight: !!s,
      },
      kv: [
        ['Status', f.status],
        ...(mj
          ? ([
              ['Matched journal', mj.number],
              ['Matched', f.matchedAt ? atLabel(f.matchedAt) : '—'],
            ] as [string, string][])
          : []),
        [
          'Reconciliation',
          f.reconciliationId
            ? locked
              ? 'In a locked reconciliation'
              : 'In a reconciliation'
            : 'Not yet reconciled',
        ],
      ],
      lines: mj ? this.lineView(c, mj.lines) : [],
      lists: {
        Evidence: [
          L(
            'Bank statement line',
            `${f.source === 'payout' ? 'Payout sync' : `Import ${imp ? atLabel(imp.createdAt) : ''}`} · dedupe key ${f.dedupeKey.slice(0, 12)}`,
          ),
        ],
        Audit: await this.audit(c.rootId, 'feed', f.id),
      },
      actions: done
        ? [
            {
              l: 'Undo (before reconciliation)',
              a: `unmatchFeed:${f.id}`,
              kind: 's',
              dis: locked || !m,
              why: locked ? 'In a locked reconciliation' : '',
            },
          ]
        : [
            {
              l: 'Exclude with Reason',
              a: `excludeFeed:${f.id}`,
              kind: 'd',
              dis: !m,
            },
            { l: 'Create Rule', a: `createRule:${f.id}`, kind: 's', dis: !m },
            { l: 'Split', a: `split:${f.id}`, kind: 's', dis: !m },
            {
              l: 'Choose Different',
              a: `chooseDiff:${f.id}`,
              kind: 's',
              dis: !m,
            },
            {
              l: s && s.kind !== 'bill' ? 'Match' : 'Categorize',
              a:
                s && s.kind !== 'bill'
                  ? `matchFeed:${f.id}`
                  : `chooseDiff:${f.id}`,
              kind: 'p',
              dis: !m || !!s?.blocked,
              why: s?.blocked ?? '',
            },
          ],
    });
  }

  async recon(c: Ctx, id: string): Promise<Rec> {
    const w = await this.banking.workspace(c.rootId, id);
    const names = await this.ctx.userNames([
      w.recon.preparedById,
      w.recon.approvedById,
    ]);
    return this.R(c, {
      kind: 'Reconciliation',
      title: `${w.account.name}${w.account.mask ? ` ••${w.account.mask}` : ''}`,
      sub: `To ${mdy(w.recon.periodEnd)} · ${w.recon.status === 'Locked' ? 'completed and locked' : w.recon.status}`,
      status: w.recon.status,
      amount: money(w.statement, w.account.currency),
      tabs: ['Overview', 'Evidence', 'Audit'],
      note:
        w.recon.status === 'Locked'
          ? 'Locked reconciliations can only be reopened by an Owner / Controller with a reason. Reopening is audited.'
          : '',
      kv: [
        ['Statement balance', money(w.statement, w.account.currency)],
        ['Difference', money(w.diff, w.account.currency)],
        ['Matched lines', String(w.matchedCount)],
        ['Prepared by', names.get(w.recon.preparedById ?? '') ?? '—'],
        ['Approved by', names.get(w.recon.approvedById ?? '') ?? '—'],
        ['Locked', w.recon.approvedAt ? mdy(w.recon.approvedAt) : '—'],
        ...(w.recon.reopenReason
          ? ([['Last reopened', w.recon.reopenReason]] as [string, string][])
          : []),
      ],
      lists: {
        Evidence: this.files(w.recon.attachments),
        Audit: await this.audit(c.rootId, 'recon', id),
      },
      actions:
        w.recon.status === 'Locked'
          ? [
              {
                l: c.actor.admin ? 'Reopen' : 'Request Reopen',
                a: `reopenRecon:${id}`,
                kind: 's',
                dis: !c.actor.admin,
                why: c.actor.admin ? '' : 'Needs Owner / Controller',
              },
            ]
          : [{ l: 'Open Workspace', a: `openRecon:${id}`, kind: 'p' }],
      evidence: { type: 'recon', id },
    });
  }

  async bankAccount(c: Ctx, id: string): Promise<Rec> {
    const b = await this.banking.mustAccount(c.rootId, id);
    const book = await this.banking.bookBalance(c.rootId, b);
    const imports = await this.prisma.finBankImport.findMany({
      where: { businessId: c.rootId, bankAccountId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const recs = await this.prisma.finReconciliation.findMany({
      where: { businessId: c.rootId, bankAccountId: id },
      orderBy: { periodEnd: 'desc' },
      take: 12,
    });
    const gl = c.byId.get(b.glAccountId);
    const open = recs.find((r) => r.status !== 'Locked');
    return this.R(c, {
      kind: 'Bank account',
      title: `${b.name}${b.mask ? ` ••${b.mask}` : ''}`,
      sub: `GL ${gl?.code ?? ''} ${gl?.name ?? ''}`,
      status: b.active ? 'Active' : 'Inactive',
      amount: money(book.own, b.currency),
      tabs: ['Overview', 'Feed', 'Reconciliation', 'Audit'],
      note: b.payoutProvider
        ? `Payouts from ${b.payoutProvider} sync here automatically from Integrations. Statement lines can also be imported.`
        : 'Import a CSV or OFX statement to bring transactions in. Noxtill never sees bank credentials.',
      kv: [
        ['Type', b.kind],
        ['Institution', b.institution ?? '—'],
        ['Currency', b.currency],
        ['Linked GL account', gl ? `${gl.code} ${gl.name}` : '—'],
        ['Branch', this.views['branchName'](c, b.branchId)],
        ['Book balance', money(book.own, b.currency)],
        [
          'Last statement balance',
          b.statementBalance != null
            ? `${money(num(b.statementBalance), b.currency)} on ${mdy(b.statementDate)}`
            : 'None imported',
        ],
        ['Payout feed', b.payoutProvider ?? '—'],
      ],
      lists: {
        Feed: imports.length
          ? imports.map((i) =>
              L(
                i.fileName,
                `${atLabel(i.createdAt)} · ${i.format.toUpperCase()}`,
                `${i.imported} new · ${i.duplicates} duplicate`,
              ),
            )
          : [L('Nothing imported yet', 'Use Import Statement')],
        Reconciliation: recs.length
          ? recs.map((r) =>
              L(
                `To ${mdy(r.periodEnd)}`,
                r.status,
                money(num(r.statementBalance), b.currency),
              ),
            )
          : [L('Never reconciled', '')],
        Audit: await this.audit(c.rootId, 'bankacc', id),
      },
      actions: [
        {
          l: 'Import Statement',
          a: `importStatement:${b.id}`,
          kind: 's',
          dis: !c.actor.manage,
        },
        { l: 'Edit', a: `editBank:${b.id}`, kind: 's', dis: !c.actor.admin },
        open
          ? { l: 'Open Reconciliation', a: `openRecon:${open.id}`, kind: 'p' }
          : {
              l: 'Start Reconciliation',
              a: `startRecon:${b.id}`,
              kind: 'p',
              dis: !c.actor.manage,
            },
      ],
    });
  }

  // ── receivables & payables ───────────────────────────────────────────────

  async arItem(c: Ctx, id: string): Promise<Rec> {
    const it = (await this.ar.items(c.rootId, { includeSettled: true })).find(
      (i) => i.id === id,
    );
    if (!it)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Receivable not found',
        HttpStatus.NOT_FOUND,
      );
    const st = it.dispute
      ? 'Disputed'
      : it.balance > 0 && it.daysPastDue > 0
        ? 'Overdue'
        : 'Current';
    let lines: Rec['lines'] = [];
    let trace: Trace[] = [];
    if (it.orderId) {
      const j = await this.prisma.finJournal.findFirst({
        where: {
          businessId: c.rootId,
          sourceType: 'order',
          sourceId: it.orderId,
          superseded: false,
        },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      });
      if (j) {
        lines = this.lineView(c, j.lines);
        trace = await this.sourceTrace(c, j);
      } else
        trace = [
          {
            mod: 'Orders',
            ref: `Order #${it.orderNo}`,
            d: 'Not posted yet',
            href: `/orders?order=${it.orderId}`,
          },
        ];
    }
    if (it.customerId)
      trace.push({
        mod: 'Customer credit',
        ref: it.customer,
        d: 'Customer ledger',
        href: `/credit/${it.customerId}`,
      });
    const reasonWhy = it.dispute
      ? 'Disputed items are excluded from collections'
      : it.balance <= 0
        ? 'Nothing owed'
        : it.daysPastDue <= 0
          ? 'Not overdue'
          : !it.customerId
            ? 'Walk-in sale — no customer to remind'
            : '';
    return this.R(c, {
      kind: 'Receivable',
      title: it.customer,
      sub: `${it.orderNo ? `Order #${it.orderNo}` : 'Opening balance'} · due ${mdy(it.due)}`,
      status: st,
      amount: money(it.balance, it.currency),
      tabs: [
        'Overview',
        'Accounting',
        'Source',
        'Payments',
        'Activity',
        'Audit',
      ],
      note: 'Accounting balance only. The sale is owned by Orders; payments are recorded at checkout or in Customer credit.',
      kv: [
        ['Accounting balance', money(it.balance, it.currency)],
        ['Original amount', money(it.original, it.currency)],
        ['Paid / credited', money(it.paid, it.currency)],
        [
          'Aging',
          it.balance > 0
            ? `${it.bucket}${it.daysPastDue > 0 ? ` · ${it.daysPastDue} days past due` : ''}`
            : '—',
        ],
        ['Posting date', mdy(it.date)],
        ['Due date', mdy(it.due)],
        ['Currency', it.currency],
        ['Branch', this.views['branchName'](c, it.branchId)],
        ['Dispute', it.dispute ?? 'None'],
      ],
      adv: [
        [
          'Control account',
          `${c.byKey.get('ar')!.code} ${c.byKey.get('ar')!.name}`,
        ],
        ['Aging policy', 'Days past due date'],
        [
          'FX',
          it.currency === c.base
            ? 'Base currency'
            : `Shown in ${it.currency}; base ${money(it.balanceBase, c.base)} at today’s rate`,
        ],
      ],
      lines,
      trace,
      lists: {
        Payments: it.payments.length
          ? it.payments.map((p) =>
              L(p.label, mdy(p.date), money(p.amount, it.currency)),
            )
          : [L('No payments recorded', '')],
        Activity: [L(`Aging: ${it.bucket}`, `As of ${mdy(dayOf(new Date()))}`)],
        Audit: it.orderId ? await this.audit(c.rootId, 'ar', it.orderId) : [],
      },
      actions: [
        ...(it.orderId
          ? [
              {
                l: 'Open Source Sale',
                a: `link:/orders?order=${it.orderId}`,
                kind: 's' as const,
              },
            ]
          : []),
        ...(it.customerId
          ? [
              {
                l: 'Open Customer',
                a: `link:/customers/${it.customerId}`,
                kind: 's' as const,
              },
            ]
          : []),
        {
          l: 'Create Accounting Adjustment',
          a: `adjustAR:${it.id}`,
          kind: 's',
          dis: !c.actor.manage,
        },
        ...(it.orderId
          ? [
              it.dispute
                ? {
                    l: 'Resolve Dispute',
                    a: `resolveDispute:${it.orderId}`,
                    kind: 's' as const,
                    dis: !c.actor.manage,
                  }
                : {
                    l: 'Flag Dispute',
                    a: `dispute:${it.orderId}`,
                    kind: 's' as const,
                    dis: !c.actor.manage,
                  },
            ]
          : []),
        {
          l: 'Send Payment Reminder',
          a: `collections:${it.id}`,
          kind: 'p',
          dis: !!reasonWhy || !c.actor.manage,
          why: reasonWhy,
        },
      ],
    });
  }

  async apDiff(c: Ctx): Promise<Rec> {
    const apA = c.byKey.get('ap')!;
    const ctl = this.ledger.bal(
      await this.ledger.totals(c.rootId, null, null, FAR_FUTURE),
      apA,
    );
    const sub = r2(
      (await this.ap.openItems(c.rootId)).reduce((s, i) => s + i.openBase, 0),
    );
    const manual = await this.prisma.finJournalLine.findMany({
      where: {
        businessId: c.rootId,
        accountId: apA.id,
        postedAt: { not: null },
        journal: { sourceType: null },
      },
      include: { journal: true },
      orderBy: { date: 'desc' },
      take: 20,
    });
    const diff = r2(ctl - sub);
    return this.R(c, {
      kind: 'Control check',
      title: 'A/P control difference',
      sub: `Subledger vs GL ${apA.code}`,
      status: diff ? 'Mismatch' : 'Balanced',
      amount: money(diff, c.base),
      tabs: ['Overview', 'Accounting', 'Audit'],
      note: diff
        ? 'A journal posted directly to a control account bypasses the subledger. Reverse it and enter the item through Bills, or record an A/P adjustment.'
        : 'The A/P subledger agrees to the control account.',
      noteTone: diff ? 'bad' : 'info',
      kv: [
        ['A/P subledger', money(sub, c.base)],
        [`GL ${apA.code} balance`, money(ctl, c.base)],
        ['Difference', money(diff, c.base)],
        [
          'Manual journals to the control account',
          String(new Set(manual.map((m) => m.journalId)).size),
        ],
      ],
      lines: manual.map((m) => ({
        acct: `${apA.code} ${apA.name}`,
        desc: `${m.journal.number} · ${m.description ?? m.journal.memo ?? ''}`,
        dr: num(m.debit) || null,
        cr: num(m.credit) || null,
      })),
      lists: { Audit: [] },
      actions: manual.slice(0, 3).map((m) => ({
        l: `Open ${m.journal.number}`,
        a: `openRec:journals|${m.journalId}`,
        kind: 's' as const,
      })),
    });
  }

  async bill(c: Ctx, id: string, from: 'ap' | 'bills'): Promise<Rec> {
    const b = await this.ap.mustBill(c.rootId, id);
    const pend = await this.prisma.finApproval.findFirst({
      where: {
        businessId: c.rootId,
        subjectType: 'bill',
        subjectId: id,
        status: 'Pending',
      },
    });
    const cfg = await this.ctx.config(c.rootId);
    const level = this.ap.approvalLevelOf(b, cfg.thresholds.billOwner);
    const apL = this.views.billApprovalLabel(b, !!pend);
    const match = this.views.billMatchLabel(b);
    const detail = (b.matchDetail ?? {}) as {
      rows?: {
        item: string;
        ordered: number;
        received: number;
        billed: number;
        poPrice: number;
        billPrice: number;
        result: string;
      }[];
      duplicateOf?: string[];
      poRef?: string;
      reviewedBy?: string;
      reviewNote?: string;
    };
    const j = b.journalId
      ? await this.prisma.finJournal.findUnique({
          where: { id: b.journalId },
          include: { lines: { orderBy: { lineNo: 'asc' } } },
        })
      : null;
    const pays = await this.prisma.finBillPayment.findMany({
      where: { billId: id },
      orderBy: { date: 'asc' },
    });
    const banks = await this.banking.list(c.rootId);
    const names = await this.ctx.userNames([b.createdById, b.approvedById]);
    const a = c.actor;
    const open = r2(num(b.total) - num(b.amountPaid));
    const acts: Act[] = [];
    const draftLike = ['Draft', 'Review Required', 'Rejected'].includes(
      b.status,
    );
    if (b.status === 'Review Required') {
      acts.push({
        l: 'Void as Duplicate',
        a: `voidBill:${id}`,
        kind: 'd',
        dis: !a.approve,
        why: a.approve ? '' : 'Needs Finance Manager',
      });
      acts.push({
        l: 'Not a Duplicate',
        a: `clearReview:${id}`,
        kind: 's',
        dis: !a.manage,
      });
    }
    if (draftLike)
      acts.push({
        l: 'Edit Draft',
        a: `editBill:${id}`,
        kind: 's',
        dis: !a.manage,
      });
    if (['Draft', 'Rejected'].includes(b.status) && !pend)
      acts.push({
        l: 'Submit for Approval',
        a: `submitBill:${id}`,
        kind: 'p',
        dis: !a.manage,
      });
    if (pend) {
      const can = level === 'admin' ? a.admin : a.approve;
      const sod =
        cfg.sod.sod2 && level === 'admin' && b.createdById === a.userId;
      acts.push({
        l: 'Reject',
        a: `rejectBill:${id}`,
        kind: 'd',
        dis: !a.approve,
      });
      acts.push({
        l: 'Approve',
        a: `approveBill:${id}`,
        kind: 'p',
        dis: !can || sod,
        why: !can
          ? `Needs ${level === 'admin' ? 'Owner / Controller' : 'Finance Manager'}`
          : sod
            ? 'You created this bill — someone else approves it (above threshold)'
            : '',
      });
    }
    if (b.status === 'Approved')
      acts.push({
        l: 'Post Bill',
        a: `postBill:${id}`,
        kind: 'p',
        dis: !a.manage,
      });
    if (
      ['Posted', 'Partially Paid', 'Approved for Payment'].includes(b.status)
    ) {
      if (b.status !== 'Approved for Payment')
        acts.push({
          l: 'Approve for Payment',
          a: `approvePay:${id}`,
          kind: 's',
          dis: !a.approve,
        });
      acts.push({ l: 'Hold', a: `hold:${id}`, kind: 's', dis: !a.manage });
      if (!num(b.amountPaid))
        acts.push({
          l: 'Void / Reverse',
          a: `voidBill:${id}`,
          kind: 'd',
          dis: !a.approve,
        });
      acts.push({
        l: 'Record Payment',
        a: `payBill:${id}`,
        kind: 'p',
        dis: !a.manage || !banks.length,
        why: !banks.length ? 'Add a bank or cash account first' : '',
      });
    }
    if (b.status === 'On Hold')
      acts.push({
        l: 'Release Accounting Hold',
        a: `releaseHold:${id}`,
        kind: 'p',
        dis: !a.approve,
      });
    if (b.purchaseOrderId)
      acts.unshift({ l: 'View PO', a: 'link:/inventory/purchases', kind: 's' });
    const nTone: Rec['noteTone'] =
      b.status === 'Review Required'
        ? 'bad'
        : b.status === 'On Hold'
          ? 'warn'
          : 'info';
    let note = '';
    if (b.status === 'Review Required')
      note = detail.duplicateOf?.length
        ? `Possible duplicate: vendor invoice ${b.vendorInvoiceNo} already exists on ${detail.duplicateOf.join(', ')}. Review before submitting.`
        : 'Three-way match exception: billed quantity or price differs from the purchase order or what was received.';
    else if (b.status === 'On Hold') note = `On hold: ${b.holdReason ?? ''}`;
    else if (b.status === 'Rejected')
      note = `Rejected: ${b.rejectReason ?? ''}`;
    else if (b.intake === 'Photo Digitizer')
      note =
        'Extracted by Photo Digitizer and reviewed by a person. Scanned output never posts on its own.';
    else if (b.status === 'Approved for Payment')
      note =
        'Approved for payment. Pay it from your bank, then use Record Payment — the bill stays unpaid until you do.';
    const sup = b.supplierId
      ? await this.prisma.supplier.findUnique({
          where: { id: b.supplierId },
          select: { name: true },
        })
      : null;
    return this.R(c, {
      kind: from === 'ap' ? 'Payable' : 'Vendor bill',
      title: from === 'ap' ? b.vendorName : `${b.number} · ${b.vendorName}`,
      sub: `${from === 'ap' ? `${b.number} · ` : ''}Vendor invoice ${b.vendorInvoiceNo ?? '—'} · via ${b.intake}`,
      status: b.status,
      amount: money(from === 'ap' ? open : num(b.total), b.currency),
      tabs:
        from === 'ap'
          ? [
              'Overview',
              'Accounting',
              'Source',
              'Payments',
              'Approvals',
              'Audit',
            ]
          : [
              'Overview',
              'Accounting',
              'Source',
              'Documents',
              'Approvals',
              'Audit',
            ],
      threeWay: detail.rows?.length
        ? {
            rows: detail.rows.map((r) => ({
              a: r.item,
              b: `${r.ordered} @ ${money(r.poPrice, b.currency)}`,
              c: String(r.received),
              d: `${r.billed} @ ${money(r.billPrice, b.currency)}`,
              e: r.result === 'Match' ? 'Match' : 'Exception',
              fg: r.result === 'Match' ? '#0E8442' : '#B42318',
            })),
            tol: `Tolerance ±2% quantity, ±1% price · ${detail.poRef ?? 'purchase order'}`,
          }
        : null,
      note,
      noteTone: nTone,
      kv: [
        ['Vendor', b.vendorName],
        ['Supplier record', sup?.name ?? 'Not linked'],
        ['Vendor invoice #', b.vendorInvoiceNo ?? '—'],
        ['Bill date', mdy(b.billDate)],
        ['Due date', mdy(b.dueDate)],
        ['PO reference', detail.poRef ?? '—'],
        ['Subtotal', money(num(b.subtotal), b.currency)],
        ['Tax', money(num(b.tax), b.currency)],
        ['Total', money(num(b.total), b.currency)],
        ['Paid', money(num(b.amountPaid), b.currency)],
        ['Open balance', money(open, b.currency)],
        ['Match status', match],
        ['Approval', apL],
        ['Accounting status', b.status],
        ['Created by', names.get(b.createdById ?? '') ?? '—'],
      ],
      adv: [
        ['Bill ID', b.id],
        [
          'FX rate',
          b.currency === c.base
            ? 'Base currency'
            : `1 ${b.currency} = ${num(b.fxRate)} ${c.base} (bill date)`,
        ],
        ['Journal', j?.number ?? 'Not posted'],
        ...(detail.reviewedBy
          ? ([
              ['Review', `${detail.reviewedBy}: ${detail.reviewNote ?? ''}`],
            ] as [string, string][])
          : []),
      ],
      lines: j
        ? this.lineView(c, j.lines)
        : b.lines
            .map((l) => ({
              acct: `${c.byId.get(l.accountId)?.code ?? ''} ${c.byId.get(l.accountId)?.name ?? ''}`,
              desc: `${l.description} (proposed)`,
              dr: num(l.amount) || null,
              cr: null as number | null,
            }))
            .concat(
              num(b.tax)
                ? [
                    {
                      acct: `${c.byKey.get('input_tax')!.code} ${c.byKey.get('input_tax')!.name}`,
                      desc: 'Input tax (proposed)',
                      dr: num(b.tax),
                      cr: null,
                    },
                  ]
                : [],
              [
                {
                  acct: `${c.byKey.get('ap')!.code} ${c.byKey.get('ap')!.name}`,
                  desc: `${b.vendorName} (proposed)`,
                  dr: null,
                  cr: num(b.total),
                },
              ],
            ),
      trace: [
        ...(b.supplierId
          ? [
              {
                mod: 'Suppliers',
                ref: sup?.name ?? b.vendorName,
                d: 'Supplier record',
                href: '/inventory/purchases',
              },
            ]
          : []),
        {
          mod: 'Purchase order',
          ref: detail.poRef ?? 'No PO',
          d: b.purchaseOrderId ? 'Three-way match source' : 'Direct bill',
          ...(b.purchaseOrderId ? { href: '/inventory/purchases' } : {}),
        },
        { mod: 'Bills', ref: b.number, d: b.status },
        ...(j
          ? [
              {
                mod: 'Journal',
                ref: j.number,
                d: `Posted ${mdy(j.postedAt)}`,
                open: `openRec:journals|${j.id}`,
              },
            ]
          : []),
      ],
      lists: {
        Documents: this.files(b.attachments),
        Payments: pays.length
          ? pays.map((p) =>
              L(
                `${p.voidedAt ? 'Voided · ' : ''}${banks.find((x) => x.id === p.bankAccountId)?.name ?? 'Bank'}${p.reference ? ` · ${p.reference}` : ''}`,
                mdy(p.date),
                money(num(p.amount), b.currency),
              ),
            )
          : [L('No payments recorded', '')],
        Approvals: await this.approvals(c.rootId, 'bill', id),
        Audit: await this.audit(c.rootId, 'bill', id),
      },
      actions: acts,
      evidence: { type: 'bill', id },
      cur: b.currency,
    });
  }

  // ── compliance & assets ──────────────────────────────────────────────────

  async taxReturn(c: Ctx, id: string): Promise<Rec> {
    const all = await this.tax.list(c.rootId);
    const r = all.find((x) => x.ret.id === id);
    if (!r)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Tax return not found',
        HttpStatus.NOT_FOUND,
      );
    const calc: TaxCalc = r.calc;
    const period = monthLabel(
      r.ret.periodStart.getUTCFullYear(),
      r.ret.periodStart.getUTCMonth() + 1,
    );
    const a = c.actor;
    const names = await this.ctx.userNames([
      r.ret.preparedById,
      r.ret.approvedById,
    ]);
    const acts: Act[] = [];
    if (['Calculated', 'Review Required'].includes(r.status))
      acts.push({
        l: 'Submit Return for Approval',
        a: `taxSubmit:${id}`,
        kind: 'p',
        dis: !a.manage,
      });
    if (r.status === 'Open')
      acts.push({
        l: 'Submit Return for Approval',
        a: '',
        kind: 'p',
        dis: true,
        why: 'The period hasn’t ended yet',
      });
    if (r.status === 'Approval Required')
      acts.push({
        l: 'Approve & Lock Calculation',
        a: `taxApprove:${id}`,
        kind: 'p',
        dis: !a.admin || r.ret.preparedById === a.userId,
        why: !a.admin
          ? 'Needs Owner / Controller'
          : r.ret.preparedById === a.userId
            ? 'You prepared this return'
            : '',
      });
    if (['Approval Required', 'Locked'].includes(r.status))
      acts.push({
        l: 'Reopen',
        a: `taxReopen:${id}`,
        kind: 's',
        dis: !a.admin,
      });
    if (['Locked', 'Filed'].includes(r.status))
      acts.push({ l: 'Export Filing Pack', a: `exportTax:${id}`, kind: 's' });
    if (r.status === 'Locked')
      acts.push({
        l: 'Record Filing Evidence',
        a: `taxFiled:${id}`,
        kind: 'p',
        dis: !a.manage,
      });
    return this.R(c, {
      kind: 'Tax return',
      title: `${r.taxType} · ${period}`,
      sub: r.jurisdiction,
      status: r.status,
      amount: money(calc.net, c.base),
      tabs: [
        'Overview',
        'Transactions',
        'Exceptions',
        'Evidence',
        'Filing',
        'Audit',
      ],
      note: r.drift
        ? `The ledger changed by ${money(r.drift, c.base)} for this period since the return was locked. Reopen to recalculate, or post the difference to the next return.`
        : 'Filed status requires a filing confirmation reference. Noxtill never claims a return was filed without one.',
      noteTone: r.drift ? 'warn' : 'info',
      kv: [
        ['Taxable base', money(calc.base, c.base)],
        ['Output / collected', money(calc.output, c.base)],
        ['Input / recoverable', money(calc.input, c.base)],
        ['Net liability', money(calc.net, c.base)],
        ['Period', `${mdy(r.ret.periodStart)} – ${mdy(r.ret.periodEnd)}`],
        ['Due date', mdy(r.ret.dueOn)],
        [
          'Control accounts',
          `${c.byKey.get('output_tax')!.code} / ${c.byKey.get('input_tax')!.code}`,
        ],
        ['Prepared by', names.get(r.ret.preparedById ?? '') ?? '—'],
        ['Approved by', names.get(r.ret.approvedById ?? '') ?? '—'],
        ['Filing reference', r.ret.filingRef ?? '—'],
      ],
      lists: {
        Transactions: [
          L(
            `${calc.outputLines} sales tax line${calc.outputLines === 1 ? '' : 's'}`,
            'Output tax',
            money(calc.output, c.base),
          ),
          L(
            `${calc.inputLines} purchase tax line${calc.inputLines === 1 ? '' : 's'}`,
            'Input tax',
            money(calc.input, c.base),
          ),
        ],
        Exceptions: calc.exceptions.length
          ? calc.exceptions.map((e) =>
              L(e.ref, e.what, e.amount ? money(e.amount, c.base) : ''),
            )
          : [L('No exceptions', '')],
        Evidence: this.files(r.ret.attachments),
        Filing: [
          L(r.status, 'Current step'),
          ...(r.ret.filedAt
            ? [
                L(
                  `Filed ${mdy(r.ret.filedAt)}`,
                  `Reference ${r.ret.filingRef ?? ''}`,
                ),
              ]
            : []),
        ],
        Audit: await this.audit(c.rootId, 'tax', id),
      },
      actions: acts,
      evidence: { type: 'tax', id },
    });
  }

  async asset(c: Ctx, id: string): Promise<Rec> {
    if (id.startsWith('pending:')) {
      const billId = id.slice(8);
      const p = (await this.assets.pendingCapitalization(c.rootId)).filter(
        (x) => x.billId === billId,
      );
      if (!p.length)
        throw new AppException(
          FIN_ERRORS.NOT_FOUND,
          'Nothing pending for that bill',
          HttpStatus.NOT_FOUND,
        );
      return this.R(c, {
        kind: 'Pending capitalization',
        title: p[0].description,
        sub: `${p[0].bill} · ${p[0].vendor}`,
        status: 'Pending Review',
        amount: money(r2(p.reduce((s, x) => s + x.amount, 0)), c.base),
        tabs: ['Overview'],
        note: 'This bill was posted to Fixed Assets — Cost but no asset record exists, so it isn’t depreciating. Capitalize it to add it to the register.',
        noteTone: 'warn',
        kv: p.map(
          (x) => [x.description, money(x.amount, c.base)] as [string, string],
        ),
        actions: [
          { l: 'Open Bill', a: `openRec:bills|${billId}`, kind: 's' },
          {
            l: 'Capitalize Asset',
            a: `capitalize:${billId}`,
            kind: 'p',
            dis: !c.actor.manage,
          },
        ],
      });
    }
    const a = await this.assets.mustAsset(c.rootId, id);
    const acc = (await this.assets.accumulated(c.rootId)).get(a.id) ?? 0;
    const lines = await this.prisma.finJournalLine.findMany({
      where: { businessId: c.rootId, assetId: a.id, postedAt: { not: null } },
      include: { journal: { select: { id: true, number: true, memo: true } } },
      orderBy: { date: 'desc' },
      take: 40,
    });
    const end = monthKey(dayOf(new Date()));
    const next = this.assets.monthly(a, acc, end.year, end.month);
    const bill = a.billId
      ? await this.prisma.finBill.findUnique({
          where: { id: a.billId },
          select: { number: true, vendorName: true },
        })
      : null;
    return this.R(c, {
      kind: 'Asset book',
      title: a.name,
      sub: `${a.category} · ${a.number}${a.location ? ` · ${a.location}` : ''}`,
      status: a.status,
      amount: money(
        a.status === 'Disposed' ? 0 : r2(num(a.cost) - acc),
        c.base,
      ),
      tabs: ['Overview', 'Accounting', 'Source', 'Audit'],
      note:
        a.status === 'Disposed'
          ? `Disposed ${mdy(a.disposedOn)} for ${money(num(a.disposalProceeds), c.base)}.`
          : 'Depreciation posts monthly from the register. Accumulated depreciation is read back from the ledger.',
      kv: [
        ['Cost', money(num(a.cost), c.base)],
        ['Salvage', money(num(a.salvage), c.base)],
        [
          'Method',
          a.method === 'declining'
            ? 'Double-declining balance'
            : 'Straight-line',
        ],
        ['Useful life', `${a.lifeMonths} months`],
        ['Acquired', mdy(a.acquiredOn)],
        ['In service', mdy(a.inServiceOn)],
        ['Accumulated depreciation', money(acc, c.base)],
        ['Net book value', money(r2(num(a.cost) - acc), c.base)],
        ['This month’s charge', next ? money(next, c.base) : '—'],
        ['Branch', this.views['branchName'](c, a.branchId)],
      ],
      lines: lines.map((l) => ({
        acct: `${c.byId.get(l.accountId ?? '')?.code ?? ''} ${c.byId.get(l.accountId ?? '')?.name ?? ''} · ${l.journal.number}`,
        desc: l.description ?? l.journal.memo ?? '',
        dr: num(l.debit) || null,
        cr: num(l.credit) || null,
      })),
      trace: [
        ...(bill
          ? [
              {
                mod: 'Bills',
                ref: `${bill.number} · ${bill.vendorName}`,
                d: 'Acquisition bill',
                open: `openRec:bills|${a.billId}`,
              },
            ]
          : []),
        { mod: 'Fixed asset book', ref: a.number, d: a.status },
      ],
      lists: { Audit: await this.audit(c.rootId, 'asset', a.id) },
      actions:
        a.status === 'Disposed'
          ? []
          : [
              {
                l: 'Dispose (Accounting)',
                a: `dispose:${a.id}`,
                kind: 's',
                dis: !c.actor.approve,
                why: c.actor.approve ? '' : 'Needs Finance Manager',
              },
            ],
    });
  }

  // ── planning & reporting ─────────────────────────────────────────────────

  async budgetLine(c: Ctx, id: string): Promise<Rec> {
    const [budgetId, accountId] = id.split('|');
    const b = await this.budgets.mustBudget(c.rootId, budgetId);
    const row = (
      await this.budgets.bva(c.rootId, budgetId, c.range, c.branchId)
    ).find((r) => r.account.id === accountId);
    if (!row)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Budget line not found',
        HttpStatus.NOT_FOUND,
      );
    const names = await this.ctx.userNames([b.createdById, b.approvedById]);
    const a = c.actor;
    const acts: Act[] = [
      {
        l: 'Add Explanation',
        a: `explain:${budgetId}|${accountId}`,
        kind: 's',
        dis: !a.manage,
      },
    ];
    if (b.status === 'Draft')
      acts.push({
        l: 'Submit for Approval',
        a: `submitBudget:${budgetId}`,
        kind: 'p',
        dis: !a.manage,
      });
    if (b.status === 'Submitted')
      acts.push(
        {
          l: 'Reject',
          a: `rejectBudget:${budgetId}`,
          kind: 'd',
          dis: !a.admin,
        },
        {
          l: 'Approve',
          a: `approveBudget:${budgetId}`,
          kind: 'p',
          dis: !a.admin,
          why: a.admin ? '' : 'Needs Owner / Controller',
        },
      );
    if (b.status === 'Approved' || b.status === 'Locked')
      acts.push({
        l: 'Create Revision',
        a: `reviseBudget:${budgetId}`,
        kind: 'p',
        dis: !a.manage,
      });
    return this.R(c, {
      kind: 'Budget line',
      title: `${row.account.code} ${row.account.name}`,
      sub: `${b.name} v${b.version} · ${c.range.label}`,
      status: b.status === 'Approved' ? 'Approved' : b.status,
      amount: money(row.variance, c.base),
      tabs: ['Overview', 'Activity', 'Audit'],
      note:
        b.status === 'Approved' || b.status === 'Locked'
          ? 'To change an approved budget, create a revision. The approved version is never overwritten.'
          : '',
      kv: [
        ['Budget', money(row.budget, c.base)],
        ['Actual (posted)', money(row.actual, c.base)],
        ['Variance', money(row.variance, c.base)],
        ['Variance %', `${row.pct.toFixed(1)}%`],
        [
          'Materiality',
          row.material ? 'Material — explanation required' : 'Within threshold',
        ],
        ['Explanation', row.explanation ?? '—'],
      ],
      lists: {
        Activity: [
          L(
            'Created',
            `${names.get(b.createdById ?? '') ?? '—'} · ${mdy(b.createdAt)}`,
          ),
          ...(b.approvedAt
            ? [
                L(
                  'Approved',
                  `${names.get(b.approvedById ?? '') ?? '—'} · ${mdy(b.approvedAt)}`,
                ),
              ]
            : []),
        ],
        Audit: await this.audit(c.rootId, 'budget', budgetId),
      },
      actions: acts,
    });
  }

  async closeTask(c: Ctx, id: string): Promise<Rec> {
    const t = await this.close.mustTask(c.rootId, id);
    const v = await this.close.view(c.rootId, t.run.year, t.run.month);
    const tv = v.tasks.find((x) => x.task.id === id)!;
    const names = await this.ctx.userNames([t.ownerUserId, t.completedById]);
    const cfg = await this.ctx.config(c.rootId);
    const done = tv.status === 'Done' || tv.status === 'N/A';
    const ev = (Array.isArray(t.attachments) ? t.attachments : []) as unknown[];
    return this.R(c, {
      kind: 'Close control',
      title: t.title,
      sub: `${monthLabel(t.run.year, t.run.month)} close · ${t.key}`,
      status: tv.status,
      tabs: ['Overview', 'Evidence', 'Audit'],
      note: tv.na
        ? `Not applicable: ${tv.na}`
        : tv.exception && !done
          ? tv.exception
          : '',
      noteTone: 'warn',
      kv: [
        ['Owner', names.get(t.ownerUserId ?? '') ?? '—'],
        ['Due', mdy(t.dueOn)],
        ['Status', tv.status],
        ['Area', t.area],
        [
          'Evidence',
          ev.length
            ? `${ev.length} file${ev.length === 1 ? '' : 's'}`
            : t.notes
              ? 'Note recorded'
              : 'None yet',
        ],
        [
          'Completed by',
          t.completedById
            ? `${names.get(t.completedById) ?? '—'} · ${mdy(t.completedAt)}`
            : '—',
        ],
        [
          'Check',
          tv.exception
            ? 'Failing'
            : tv.na
              ? 'Not applicable'
              : CLOSE_CHECKED.has(t.key)
                ? 'Passing'
                : 'Manual review',
        ],
      ],
      lists: {
        Evidence: [
          ...this.files(t.attachments),
          ...(t.notes ? [L('Note', t.notes)] : []),
        ],
        Audit: await this.audit(c.rootId, 'close', id),
      },
      actions: [
        {
          l: 'Attach Evidence',
          a: `attach:close:${id}`,
          kind: 's',
          dis: !c.actor.manage,
        },
        ...(tv.go && tv.go !== 'cutoff'
          ? [{ l: 'Open Related', a: `go:${tv.go}`, kind: 's' as const }]
          : []),
        ...(done && tv.status === 'Done'
          ? [
              {
                l: 'Reopen Control',
                a: `closeReopenTask:${id}`,
                kind: 's' as const,
                dis: !c.actor.manage || t.run.status === 'Hard Closed',
              },
            ]
          : []),
        ...(!done
          ? [
              {
                l: 'Mark Complete',
                a: `closeDone:${id}`,
                kind: 'p' as const,
                dis: !!tv.exception || !c.actor.manage,
                why: tv.exception
                  ? 'Resolve exceptions first'
                  : cfg.close.reqEvidence && !ev.length
                    ? 'Evidence or a note is required'
                    : '',
              },
            ]
          : []),
      ],
      evidence: { type: 'close', id },
    });
  }

  async drill(c: Ctx, code: string): Promise<Rec> {
    const scope = { rootId: c.rootId, branchId: c.branchId, range: c.range };
    if (code === 'PL') {
      const p = await this.ledger.pnl(scope, c.accounts, false);
      return this.R(c, {
        kind: 'Statement drilldown',
        title: 'Current period earnings',
        sub: `${c.range.label} · posted ledger`,
        status: 'Posted',
        amount: money(p.net, c.base),
        tabs: ['Overview'],
        kv: [
          ['Accounts contributing', 'All P&L accounts'],
          ['Period', `${mdy(c.range.from)} – ${mdy(c.range.to)}`],
          ['Entity', c.entity],
          ['Basis', 'Posted entries only'],
        ],
        actions: [{ l: 'Open Profit & Loss', a: 'stmt:pl', kind: 'p' }],
      });
    }
    const a = c.accounts.find((x) => x.code === code);
    if (!a)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Account not found',
        HttpStatus.NOT_FOUND,
      );
    const pl = ['revenue', 'cos', 'expense', 'other_inc', 'other_exp'].includes(
      a.type,
    );
    const from = pl ? c.range.from : null;
    const t = await this.ledger.totals(c.rootId, c.branchId, from, c.range.to);
    const amt = this.ledger.bal(t, a);
    const js = await this.prisma.finJournalLine.groupBy({
      by: ['journalId'],
      where: {
        businessId: c.rootId,
        accountId: a.id,
        postedAt: { not: null },
        date: pl
          ? { gte: c.range.from, lte: c.range.to }
          : { gte: c.range.from, lte: c.range.to },
        ...(c.branchId ? { branchId: c.branchId } : {}),
      },
      _sum: { debit: true, credit: true },
    });
    const top = [...js]
      .sort(
        (x, y) =>
          Math.abs(num(y._sum.debit) - num(y._sum.credit)) -
          Math.abs(num(x._sum.debit) - num(x._sum.credit)),
      )
      .slice(0, 25);
    const jr = await this.prisma.finJournal.findMany({
      where: { id: { in: top.map((x) => x.journalId) } },
      select: {
        id: true,
        number: true,
        date: true,
        memo: true,
        sourceLabel: true,
        sourceType: true,
      },
    });
    const jb = new Map(jr.map((j) => [j.id, j]));
    const rest = js.length - top.length;
    const byBranch = await this.prisma.finJournalLine.groupBy({
      by: ['branchId'],
      where: {
        businessId: c.rootId,
        accountId: a.id,
        postedAt: { not: null },
        date: { gte: c.range.from, lte: c.range.to },
      },
      _sum: { debit: true, credit: true },
    });
    const tot = byBranch.reduce(
      (s, x) => s + Math.abs(num(x._sum.debit) - num(x._sum.credit)),
      0,
    );
    return this.R(c, {
      kind: 'Statement drilldown',
      title: `${a.code} ${a.name}`,
      sub: `${c.range.label} · posted ledger`,
      status: 'Posted',
      amount: money(amt, c.base),
      tabs: ['Overview', 'Journals', 'Dimensions'],
      kv: [
        ['Account', `${a.code} ${a.name}`],
        [
          'Period',
          pl
            ? `${mdy(c.range.from)} – ${mdy(c.range.to)}`
            : `Balance at ${mdy(c.range.to)}`,
        ],
        ['Entity', c.entity],
        ['Basis', 'Posted entries only'],
        ['Journals this period', String(js.length)],
      ],
      lists: {
        Journals: [
          ...top.map((x) => {
            const j = jb.get(x.journalId)!;
            const v = DEBIT_NAT(a.type)
              ? num(x._sum.debit) - num(x._sum.credit)
              : num(x._sum.credit) - num(x._sum.debit);
            return L(
              `${j.number} · ${j.memo ?? j.sourceLabel ?? ''}`,
              `${md(j.date)} · ${j.sourceType ? (SOURCE_MODULE[j.sourceType] ?? j.sourceType) : 'Manual'}`,
              money(r2(v), c.base),
            );
          }),
          ...(rest > 0
            ? [
                L(
                  `${rest} more journal${rest === 1 ? '' : 's'}`,
                  'Open the General Ledger for all entries',
                ),
              ]
            : []),
        ],
        Dimensions: byBranch.map((x) =>
          L(
            this.views['branchName'](c, x.branchId),
            'Branch',
            tot
              ? `${Math.round((Math.abs(num(x._sum.debit) - num(x._sum.credit)) / tot) * 100)}%`
              : '—',
          ),
        ),
      },
      actions: [
        { l: 'Open in General Ledger', a: `glAccount:${a.id}`, kind: 'p' },
      ],
    });
  }
}

const DEBIT_NAT = (t: string) =>
  ['asset', 'cos', 'expense', 'other_exp'].includes(t);
const CLOSE_CHECKED = new Set([
  'CL-01',
  'CL-02',
  'CL-03',
  'CL-04',
  'CL-05',
  'CL-07',
  'CL-11',
  'CL-12',
  'CL-13',
  'CL-14',
]);
