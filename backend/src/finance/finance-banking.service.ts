import { HttpStatus, Injectable } from '@nestjs/common';
import { FinBankAccount, FinBankLine, Prisma } from '@prisma/client';
import { parse as csvParse } from 'csv-parse/sync';

const parse = csvParse as unknown as (
  input: string,
  opts: Record<string, unknown>,
) => Record<string, string>[];
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  num,
  r2,
  ymd,
} from './finance-context.service';
import { FinancePostingService, LineInput } from './finance-posting.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FIN_ERRORS } from './finance.constants';

export interface Suggestion {
  kind: 'journal' | 'account' | 'rule' | 'bill';
  label: string;
  accountId?: string;
  journalId?: string;
  lineIds?: string[];
  ruleId?: string;
  billId?: string;
  taxCode?: string | null;
  evidence: string;
  /** Why matching is not possible yet (shown as the disabled reason). */
  blocked?: string;
}

interface ParsedLine {
  date: Date;
  description: string;
  payee: string | null;
  reference: string | null;
  amount: number;
  fitid: string | null;
}

const PROVIDERS = ['stripe', 'square', 'paypal'];

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w)),
  );

/**
 * Bank & cash accounts, statement imports (CSV / OFX), the payout feed from connected payment
 * providers, matching (always confirmed by a person unless an owner-made rule says auto), bank
 * rules and reconciliation. Matching links a bank line to ledger lines; it never marks anything
 * paid — payments are recorded where they happen (sales, credit, bills).
 */
@Injectable()
export class FinanceBankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly posting: FinancePostingService,
    private readonly journals: FinanceJournalsService,
  ) {}

  // ── accounts ─────────────────────────────────────────────────────────────

  async list(rootId: string) {
    return this.prisma.finBankAccount.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async mustAccount(rootId: string, id: string) {
    const a = await this.prisma.finBankAccount.findFirst({
      where: { id, businessId: rootId },
    });
    if (!a)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Bank account not found',
        HttpStatus.NOT_FOUND,
      );
    return a;
  }

  private async nextCode(rootId: string, from: number, to: number) {
    const used = new Set(
      (
        await this.prisma.finAccount.findMany({
          where: { businessId: rootId },
          select: { code: true },
        })
      ).map((a) => a.code),
    );
    for (let c = from; c <= to; c++) if (!used.has(String(c))) return String(c);
    throw new AppException(
      FIN_ERRORS.CONFLICT,
      `No free account code between ${from} and ${to}.`,
      HttpStatus.CONFLICT,
    );
  }

  async create(
    actor: FinActor,
    dto: {
      name: string;
      kind: string;
      institution?: string;
      mask?: string;
      currency?: string;
      branchId?: string | null;
      payoutProvider?: string | null;
      glAccountId?: string | null;
      openingBalance?: number;
      openingDate?: string;
    },
  ) {
    this.ctx.need(actor, 'admin', 'Adding a bank or cash account');
    const rootId = actor.rootId;
    const base = await this.ctx.baseCurrency(rootId);
    const currency = (dto.currency || base).toUpperCase();
    if (currency !== base)
      await this.ctx.mustRate(rootId, currency, new Date());
    if (dto.payoutProvider && !PROVIDERS.includes(dto.payoutProvider))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Unknown payout provider.',
        HttpStatus.BAD_REQUEST,
      );
    let glId = dto.glAccountId ?? null;
    if (glId) {
      const gl = await this.prisma.finAccount.findFirst({
        where: { id: glId, businessId: rootId },
      });
      if (!gl || gl.isHeader || gl.type !== 'asset')
        throw new AppException(
          FIN_ERRORS.INVALID,
          'Choose an asset account to link.',
          HttpStatus.BAD_REQUEST,
        );
      if (
        await this.prisma.finBankAccount.findFirst({
          where: { glAccountId: glId },
        })
      )
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          `${gl.code} ${gl.name} is already linked to a bank account.`,
          HttpStatus.CONFLICT,
        );
      await this.prisma.finAccount.update({
        where: { id: glId },
        data: { reconcilable: true },
      });
    } else {
      const maps = await this.ctx.accountMaps(rootId);
      const parent = maps.byCode.get('1100');
      const code =
        dto.kind === 'cash'
          ? await this.nextCode(rootId, 1121, 1149)
          : await this.nextCode(rootId, 1110, 1119).catch(() =>
              this.nextCode(rootId, 1101, 1109),
            );
      const gl = await this.prisma.finAccount.create({
        data: {
          businessId: rootId,
          code,
          name: dto.name.slice(0, 120),
          type: 'asset',
          subtype: dto.kind === 'cash' ? 'Cash' : 'Bank',
          parentId: parent?.id ?? null,
          currency: currency === base ? null : currency,
          reconcilable: true,
          control: null,
        },
      });
      glId = gl.id;
    }
    const acct = await this.prisma.finBankAccount.create({
      data: {
        businessId: rootId,
        name: dto.name.slice(0, 120),
        kind: dto.kind,
        institution: dto.institution?.slice(0, 120) || null,
        mask: dto.mask?.slice(-4) || null,
        currency,
        glAccountId: glId,
        branchId: dto.branchId ?? null,
        payoutProvider: dto.payoutProvider ?? null,
      },
    });
    if (dto.openingBalance) {
      const date = dayOf(dto.openingDate ?? new Date());
      const rate = await this.ctx.mustRate(rootId, currency, date);
      const maps = await this.ctx.accountMaps(rootId);
      const amt = r2(dto.openingBalance);
      await this.posting.postSystem(
        rootId,
        {
          type: 'bankopen',
          id: acct.id,
          event: 'opening',
          hash: `${amt}|${ymd(date)}`,
          label: `Opening balance · ${acct.name}`,
        },
        {
          date,
          currency,
          fxRate: rate,
          branchId: acct.branchId,
          memo: `Opening balance · ${acct.name}`,
          reference: `OPEN-${acct.mask ?? acct.name}`.slice(0, 80),
          lines:
            amt > 0
              ? [
                  {
                    accountId: glId,
                    debit: amt,
                    credit: 0,
                    description: 'Opening balance',
                  },
                  {
                    accountId: maps.byKey.get('opening_equity')!.id,
                    debit: 0,
                    credit: amt,
                    description: `Opening balance · ${acct.name}`,
                  },
                ]
              : [
                  {
                    accountId: maps.byKey.get('opening_equity')!.id,
                    debit: -amt,
                    credit: 0,
                    description: `Opening balance · ${acct.name}`,
                  },
                  {
                    accountId: glId,
                    debit: 0,
                    credit: -amt,
                    description: 'Opening overdraft',
                  },
                ],
        },
      );
    }
    await this.ctx.audit(
      rootId,
      actor,
      'bank.account_created',
      'bankacc',
      acct.id,
      `${acct.name} linked to GL`,
    );
    return acct;
  }

  async update(
    actor: FinActor,
    id: string,
    dto: {
      name?: string;
      institution?: string;
      mask?: string;
      payoutProvider?: string | null;
      active?: boolean;
    },
  ) {
    this.ctx.need(actor, 'admin', 'Editing a bank account');
    await this.mustAccount(actor.rootId, id);
    const a = await this.prisma.finBankAccount.update({
      where: { id },
      data: {
        name: dto.name?.slice(0, 120),
        institution: dto.institution,
        mask: dto.mask?.slice(-4),
        payoutProvider:
          dto.payoutProvider === undefined ? undefined : dto.payoutProvider,
        active: dto.active,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bank.account_updated',
      'bankacc',
      id,
      a.name,
    );
    return a;
  }

  /** Book balance of a bank account, in its own currency (txn amounts) and in base. */
  async bookBalance(rootId: string, a: FinBankAccount, asAt?: Date) {
    const t = await this.prisma.finJournalLine.aggregate({
      where: {
        businessId: rootId,
        accountId: a.glAccountId,
        postedAt: { not: null },
        ...(asAt ? { date: { lte: asAt } } : {}),
      },
      _sum: { txnDebit: true, txnCredit: true, debit: true, credit: true },
    });
    return {
      own: r2(num(t._sum.txnDebit) - num(t._sum.txnCredit)),
      base: r2(num(t._sum.debit) - num(t._sum.credit)),
    };
  }

  // ── imports ──────────────────────────────────────────────────────────────

  private parseAmount(s: string | undefined) {
    if (s == null) return NaN;
    let t = String(s).trim();
    const neg = /^\(.*\)$/.test(t) || /-$/.test(t);
    t = t.replace(/[()\s$€£₨,]/g, '').replace(/-$/, '');
    if (/^[A-Z]{3}/.test(t)) t = t.slice(3);
    const n = Number(t);
    return neg ? -Math.abs(n) : n;
  }

  private parseDate(s: string | undefined): Date | null {
    if (!s) return null;
    const t = s.trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
    if (m) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      // Day-first unless the first part can't be a day.
      const [d, mo] =
        +m[1] > 12
          ? [+m[1], +m[2]]
          : +m[2] > 12
            ? [+m[2], +m[1]]
            : [+m[1], +m[2]];
      return new Date(Date.UTC(y, mo - 1, d));
    }
    m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : dayOf(d);
  }

  parseCsv(buf: Buffer): { lines: ParsedLine[]; closing: number | null } {
    const rows = parse(buf.toString('utf8').replace(/^\uFEFF/, ''), {
      columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    if (!rows.length)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'The file has no rows.',
        HttpStatus.BAD_REQUEST,
      );
    const cols = Object.keys(rows[0]);
    const find = (...re: RegExp[]) =>
      cols.find((c) => re.some((r) => r.test(c)));
    const cDate = find(/^date$/, /posted|transaction date|value date|^date/);
    const cDesc = find(/desc|narrat|details|memo|particular/);
    const cPayee = find(/payee|name|merchant|counterparty/);
    const cRef = find(/ref|cheque|check|fitid|id$/);
    const cAmt = find(/^amount$/, /amount/);
    const cIn = find(/credit|deposit|money in|paid in/);
    const cOut = find(/debit|withdraw|money out|paid out/);
    const cBal = find(/balance/);
    if (!cDate || (!cAmt && !(cIn || cOut)))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Couldn’t find the date and amount columns. The file needs a “Date” column and either “Amount” or “Debit”/“Credit” columns.',
        HttpStatus.BAD_REQUEST,
      );
    const lines: ParsedLine[] = [];
    let closing: number | null = null;
    rows.forEach((r, i) => {
      const date = this.parseDate(r[cDate]);
      let amount = cAmt ? this.parseAmount(r[cAmt]) : NaN;
      if (Number.isNaN(amount)) {
        const inn = cIn ? this.parseAmount(r[cIn]) : 0;
        const out = cOut ? this.parseAmount(r[cOut]) : 0;
        amount =
          (Number.isNaN(inn) ? 0 : Math.abs(inn)) -
          (Number.isNaN(out) ? 0 : Math.abs(out));
      }
      if (!date || Number.isNaN(amount))
        throw new AppException(
          FIN_ERRORS.INVALID,
          `Row ${i + 2}: couldn’t read the date or amount.`,
          HttpStatus.BAD_REQUEST,
        );
      if (cBal) {
        const b = this.parseAmount(r[cBal]);
        if (!Number.isNaN(b)) closing = b;
      }
      lines.push({
        date,
        description: (
          r[cDesc ?? ''] ||
          r[cPayee ?? ''] ||
          'Bank transaction'
        ).slice(0, 300),
        payee:
          cPayee && cPayee !== cDesc ? r[cPayee]?.slice(0, 160) || null : null,
        reference: cRef ? r[cRef]?.slice(0, 120) || null : null,
        amount: r2(amount),
        fitid: null,
      });
    });
    return { lines, closing };
  }

  parseOfx(buf: Buffer): { lines: ParsedLine[]; closing: number | null } {
    const s = buf.toString('utf8');
    const tag = (block: string, t: string) => {
      const m = new RegExp(`<${t}>([^<\\r\\n]*)`, 'i').exec(block);
      return m ? m[1].trim() : null;
    };
    const blocks = s
      .split(/<STMTTRN>/i)
      .slice(1)
      .map((b) => b.split(/<\/STMTTRN>/i)[0]);
    if (!blocks.length)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'No transactions found in the OFX file.',
        HttpStatus.BAD_REQUEST,
      );
    const lines = blocks.map((b, i) => {
      const date = this.parseDate(tag(b, 'DTPOSTED') ?? undefined);
      const amount = Number(tag(b, 'TRNAMT'));
      if (!date || Number.isNaN(amount))
        throw new AppException(
          FIN_ERRORS.INVALID,
          `Transaction ${i + 1}: couldn’t read the date or amount.`,
          HttpStatus.BAD_REQUEST,
        );
      const name = tag(b, 'NAME');
      const memo = tag(b, 'MEMO');
      return {
        date,
        description: (name && memo
          ? `${name} ${memo}`
          : name || memo || 'Bank transaction'
        ).slice(0, 300),
        payee: name?.slice(0, 160) ?? null,
        reference: tag(b, 'CHECKNUM') ?? tag(b, 'REFNUM'),
        amount: r2(amount),
        fitid: tag(b, 'FITID'),
      };
    });
    const bal = /<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i.exec(s);
    return { lines, closing: bal ? Number(bal[1]) : null };
  }

  async importStatement(
    actor: FinActor,
    bankAccountId: string,
    file: { buffer: Buffer; originalname: string },
  ) {
    this.ctx.need(actor, 'manage', 'Importing a statement');
    const a = await this.mustAccount(actor.rootId, bankAccountId);
    const isOfx =
      /\.(ofx|qfx)$/i.test(file.originalname) ||
      /<OFX>/i.test(file.buffer.subarray(0, 4000).toString('utf8'));
    const { lines, closing } = isOfx
      ? this.parseOfx(file.buffer)
      : this.parseCsv(file.buffer);
    const seen = new Map<string, number>();
    let imported = 0;
    const imp = await this.prisma.finBankImport.create({
      data: {
        businessId: actor.rootId,
        bankAccountId,
        fileName: file.originalname.slice(0, 200),
        format: isOfx ? 'ofx' : 'csv',
        rows: lines.length,
        statementStart: lines.length
          ? new Date(Math.min(...lines.map((l) => l.date.getTime())))
          : null,
        statementEnd: lines.length
          ? new Date(Math.max(...lines.map((l) => l.date.getTime())))
          : null,
        closingBalance: closing,
        createdById: actor.userId,
      },
    });
    const created: FinBankLine[] = [];
    for (const l of lines) {
      const basis = l.fitid
        ? `fitid:${l.fitid}`
        : `${ymd(l.date)}|${l.amount.toFixed(2)}|${l.description}|${l.reference ?? ''}`;
      const n = (seen.get(basis) ?? 0) + 1;
      seen.set(basis, n);
      const key = createHash('sha1').update(`${basis}#${n}`).digest('hex');
      try {
        created.push(
          await this.prisma.finBankLine.create({
            data: {
              businessId: actor.rootId,
              bankAccountId,
              importId: imp.id,
              date: l.date,
              description: l.description,
              payee: l.payee,
              reference: l.reference,
              amount: l.amount,
              dedupeKey: key,
              source: 'import',
              status: 'New',
            },
          }),
        );
        imported += 1;
      } catch (e) {
        if (!(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ))
          throw e;
      }
    }
    await this.prisma.finBankImport.update({
      where: { id: imp.id },
      data: { imported, duplicates: lines.length - imported },
    });
    const end = imp.statementEnd;
    await this.prisma.finBankAccount.update({
      where: { id: a.id },
      data: {
        lastImportAt: new Date(),
        ...(closing != null && end
          ? { statementBalance: closing, statementDate: end }
          : {}),
      },
    });
    for (const line of created) await this.suggest(actor.rootId, line, actor);
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bank.statement_imported',
      'bankacc',
      a.id,
      `${file.originalname}: ${imported} new, ${lines.length - imported} duplicates skipped`,
    );
    return {
      imported,
      duplicates: lines.length - imported,
      rows: lines.length,
      closing,
    };
  }

  /** Payouts already synced from Stripe / Square / PayPal become bank lines on the account they pay into. */
  async syncPayouts(rootId: string) {
    const accts = (await this.list(rootId)).filter(
      (a) => a.payoutProvider && a.active,
    );
    if (!accts.length) return 0;
    const ids = (await this.ctx.branches(rootId)).map((b) => b.id);
    let n = 0;
    for (const a of accts) {
      const payouts = await this.prisma.externalPayment.findMany({
        where: {
          businessId: a.branchId ? a.branchId : { in: ids },
          provider: a.payoutProvider as never,
          kind: 'payout',
        },
        orderBy: { occurredAt: 'asc' },
      });
      for (const p of payouts) {
        if (p.status && /fail|cancel/i.test(p.status)) continue;
        const key = createHash('sha1')
          .update(`payout:${p.provider}:${p.externalId}`)
          .digest('hex');
        try {
          const line = await this.prisma.finBankLine.create({
            data: {
              businessId: rootId,
              bankAccountId: a.id,
              date: dayOf(p.occurredAt),
              description:
                `${p.provider.toUpperCase()} PAYOUT ${p.externalId}`.slice(
                  0,
                  300,
                ),
              payee: p.provider,
              reference: p.externalId.slice(0, 120),
              amount: Math.abs(num(p.amount)),
              dedupeKey: key,
              source: 'payout',
              externalPaymentId: p.id,
              status: 'New',
            },
          });
          await this.suggest(rootId, line, null);
          n += 1;
        } catch (e) {
          if (!(
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ))
            throw e;
        }
      }
      if (payouts.length)
        await this.prisma.finBankAccount.update({
          where: { id: a.id },
          data: { lastImportAt: new Date() },
        });
    }
    return n;
  }

  // ── suggestions ──────────────────────────────────────────────────────────

  /** Ledger lines on this bank's GL account that are already linked to some bank line. */
  private async matchedLedgerLineIds(rootId: string, bankAccountId: string) {
    const rows = await this.prisma.finBankLine.findMany({
      where: { businessId: rootId, bankAccountId, status: 'Matched' },
      select: { matchedLineIds: true, createdJournalId: true },
    });
    const ids = new Set<string>();
    for (const r of rows)
      for (const id of (r.matchedLineIds as string[] | null) ?? []) ids.add(id);
    return {
      ids,
      createdJournals: new Set(
        rows.map((r) => r.createdJournalId).filter(Boolean) as string[],
      ),
    };
  }

  async candidates(rootId: string, line: FinBankLine, windowDays = 30) {
    const a = await this.mustAccount(rootId, line.bankAccountId);
    const { ids, createdJournals } = await this.matchedLedgerLineIds(
      rootId,
      a.id,
    );
    const from = new Date(line.date.getTime() - windowDays * 86_400_000);
    const to = new Date(line.date.getTime() + windowDays * 86_400_000);
    const gl = await this.prisma.finJournalLine.findMany({
      where: {
        businessId: rootId,
        accountId: a.glAccountId,
        postedAt: { not: null },
        date: { gte: from, lte: to },
      },
      include: {
        journal: {
          select: {
            id: true,
            number: true,
            memo: true,
            sourceLabel: true,
            reference: true,
            status: true,
          },
        },
      },
      orderBy: { date: 'asc' },
      take: 500,
    });
    return gl.filter(
      (l) => !ids.has(l.id) && !createdJournals.has(l.journalId),
    );
  }

  async suggest(
    rootId: string,
    line: FinBankLine,
    actor: FinActor | null,
  ): Promise<FinBankLine> {
    if (line.status === 'Matched' || line.status === 'Excluded') return line;
    const a = await this.mustAccount(rootId, line.bankAccountId);
    const amt = num(line.amount);
    const text = `${line.description} ${line.payee ?? ''} ${line.reference ?? ''}`;
    const best: { s: Suggestion; conf: number }[] = [];

    const rules = await this.prisma.finBankRule.findMany({
      where: { businessId: rootId, active: true },
    });
    for (const r of rules) {
      if (r.bankAccountId && r.bankAccountId !== a.id) continue;
      if (r.direction === 'in' && amt <= 0) continue;
      if (r.direction === 'out' && amt >= 0) continue;
      if (!text.toLowerCase().includes(r.contains.toLowerCase())) continue;
      best.push({
        conf: 99,
        s: {
          kind: 'rule',
          ruleId: r.id,
          accountId: r.accountId,
          taxCode: r.taxCode,
          label: `Rule: ${r.name}`,
          evidence: `Description contains “${r.contains}”`,
        },
      });
      break;
    }

    if (line.source === 'payout') {
      const maps = await this.ctx.accountMaps(rootId);
      best.push({
        conf: 98,
        s: {
          kind: 'account',
          accountId: maps.byKey.get('clearing')!.id,
          label: `Payout ${line.reference ?? ''} · ${line.payee ?? 'provider'} → Payment Clearing`,
          evidence:
            'Synced payout from the connected payments provider · moves card/online takings from clearing to the bank',
        },
      });
    }

    for (const g of await this.candidates(rootId, line, 7)) {
      const v = r2(num(g.txnDebit) - num(g.txnCredit));
      if (v !== amt) continue;
      const days =
        Math.abs(g.date.getTime() - line.date.getTime()) / 86_400_000;
      const ledgerText = `${g.description ?? ''} ${g.journal.memo ?? ''} ${g.journal.reference ?? ''} ${g.journal.sourceLabel ?? ''}`;
      const lw = words(ledgerText);
      const overlap = [...words(text)].filter((w) => lw.has(w)).length;
      const conf = Math.min(
        97,
        Math.round(60 + Math.max(0, 25 - days * 5) + Math.min(15, overlap * 8)),
      );
      best.push({
        conf,
        s: {
          kind: 'journal',
          journalId: g.journalId,
          lineIds: [g.id],
          label:
            `${g.journal.number} · ${g.journal.sourceLabel ?? g.journal.memo ?? g.description ?? ''}`.slice(
              0,
              200,
            ),
          evidence: `Amount agrees · ${days === 0 ? 'same day' : `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'} apart`}${overlap ? ' · description words match' : ''}`,
        },
      });
    }

    if (amt < 0) {
      const bills = await this.prisma.finBill.findMany({
        where: {
          businessId: rootId,
          status: {
            in: [
              'Posted',
              'Partially Paid',
              'Approved',
              'Approval Required',
              'Needs Review',
              'Draft',
            ],
          },
        },
        select: {
          id: true,
          number: true,
          vendorName: true,
          total: true,
          amountPaid: true,
          status: true,
        },
      });
      for (const b of bills) {
        const open = r2(num(b.total) - num(b.amountPaid));
        const vw = words(b.vendorName);
        const hit = [...words(text)].some((w) => vw.has(w));
        if (!hit) continue;
        const diff = r2(-amt - open);
        const conf = diff === 0 ? 80 : 64;
        best.push({
          conf,
          s: {
            kind: 'bill',
            billId: b.id,
            label: `Bill ${b.number} · ${b.vendorName}${diff ? ` (${open.toFixed(2)})` : ''}`,
            evidence: `Payee matches · ${diff === 0 ? 'amount agrees' : `amount differs by ${Math.abs(diff).toFixed(2)}`}`,
            blocked: ['Posted', 'Partially Paid'].includes(b.status)
              ? `Record the payment on ${b.number} first (Bills › Record Payment) — matching links the bank line to that payment.`
              : `${b.number} is ${b.status === 'Approval Required' ? 'not approved' : b.status === 'Approved' ? 'approved but not posted' : 'not posted'} yet.`,
          },
        });
      }
    }

    best.sort((x, y) => y.conf - x.conf);
    const top = best[0];
    const status = !top
      ? 'New'
      : top.conf >= 85 && !top.s.blocked
        ? 'Suggested'
        : 'Needs Review';
    let updated = await this.prisma.finBankLine.update({
      where: { id: line.id },
      data: {
        suggestion: top
          ? (top.s as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        confidence: top ? top.conf : null,
        ruleId: top?.s.kind === 'rule' ? top.s.ruleId : null,
        status,
      },
    });
    if (top?.s.kind === 'rule') {
      const rule = rules.find((r) => r.id === top.s.ruleId);
      if (rule?.mode === 'auto')
        updated = await this.applyMatch(
          rootId,
          updated,
          top.s,
          actor,
          'Auto-matched by rule',
        );
    }
    return updated;
  }

  async resuggestAll(rootId: string) {
    const lines = await this.prisma.finBankLine.findMany({
      where: {
        businessId: rootId,
        status: { in: ['New', 'Suggested', 'Needs Review'] },
      },
    });
    for (const l of lines) await this.suggest(rootId, l, null);
    return lines.length;
  }

  // ── matching ─────────────────────────────────────────────────────────────

  async mustLine(rootId: string, id: string) {
    const l = await this.prisma.finBankLine.findFirst({
      where: { id, businessId: rootId },
    });
    if (!l)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Bank transaction not found',
        HttpStatus.NOT_FOUND,
      );
    return l;
  }

  private async assertUnlocked(rootId: string, l: FinBankLine) {
    if (!l.reconciliationId) return;
    const r = await this.prisma.finReconciliation.findFirst({
      where: { id: l.reconciliationId, businessId: rootId },
    });
    if (r && r.status === 'Locked')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'This line is in a locked reconciliation. Reopen the reconciliation first.',
        HttpStatus.CONFLICT,
      );
  }

  /** Post the categorization journal for a bank line (bank vs the chosen accounts). */
  private async postCategorization(
    rootId: string,
    l: FinBankLine,
    parts: {
      accountId: string;
      amount: number;
      description?: string;
      taxCode?: string | null;
    }[],
    label: string,
  ) {
    const a = await this.mustAccount(rootId, l.bankAccountId);
    const rate = await this.ctx.mustRate(rootId, a.currency, l.date);
    const amt = num(l.amount);
    const lines: LineInput[] = [];
    if (amt > 0) {
      lines.push({
        accountId: a.glAccountId,
        debit: amt,
        credit: 0,
        description: l.description,
        branchId: a.branchId,
      });
      for (const p of parts)
        lines.push({
          accountId: p.accountId,
          debit: 0,
          credit: Math.abs(p.amount),
          description: p.description || l.description,
          taxCode: p.taxCode ?? null,
          branchId: a.branchId,
        });
    } else {
      for (const p of parts)
        lines.push({
          accountId: p.accountId,
          debit: Math.abs(p.amount),
          credit: 0,
          description: p.description || l.description,
          taxCode: p.taxCode ?? null,
          branchId: a.branchId,
        });
      lines.push({
        accountId: a.glAccountId,
        debit: 0,
        credit: -amt,
        description: l.description,
        branchId: a.branchId,
      });
    }
    const hash = createHash('sha1')
      .update(JSON.stringify(parts) + Date.now())
      .digest('hex');
    const res = await this.posting.postSystem(
      rootId,
      { type: 'bankline', id: l.id, event: 'categorize', hash, label },
      {
        date: l.date,
        currency: a.currency,
        fxRate: rate,
        branchId: a.branchId,
        memo: `${label} · ${l.description}`,
        reference: l.reference,
        lines,
      },
    );
    if (res === 'failed')
      throw new AppException(
        FIN_ERRORS.INVALID,
        'The categorization journal failed validation — check the account is active and the period is open.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const j = await this.prisma.finJournal.findFirst({
      where: {
        businessId: rootId,
        sourceType: 'bankline',
        sourceId: l.id,
        superseded: false,
      },
      orderBy: { sourceRev: 'desc' },
    });
    return j!.id;
  }

  async applyMatch(
    rootId: string,
    l: FinBankLine,
    s: Suggestion,
    actor: FinActor | null,
    why?: string,
  ) {
    await this.assertUnlocked(rootId, l);
    if (s.blocked)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        s.blocked,
        HttpStatus.CONFLICT,
      );
    let matchedJournalId: string | null = null;
    let matchedLineIds: string[] | null = null;
    let createdJournalId: string | null = null;
    if (s.kind === 'journal') {
      const gl = await this.prisma.finJournalLine.findMany({
        where: {
          businessId: rootId,
          id: { in: s.lineIds ?? [] },
          postedAt: { not: null },
        },
      });
      const a = await this.mustAccount(rootId, l.bankAccountId);
      if (!gl.length || gl.some((g) => g.accountId !== a.glAccountId))
        throw new AppException(
          FIN_ERRORS.INVALID,
          'Those ledger lines aren’t on this bank account.',
          HttpStatus.BAD_REQUEST,
        );
      const sum = r2(
        gl.reduce((x, g) => x + num(g.txnDebit) - num(g.txnCredit), 0),
      );
      if (sum !== num(l.amount))
        throw new AppException(
          FIN_ERRORS.INVALID,
          `The ledger lines total ${sum.toFixed(2)} but the bank line is ${num(l.amount).toFixed(2)}.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const { ids } = await this.matchedLedgerLineIds(rootId, a.id);
      if (gl.some((g) => ids.has(g.id)))
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          'One of those ledger lines is already matched to another bank line.',
          HttpStatus.CONFLICT,
        );
      matchedJournalId = gl[0].journalId;
      matchedLineIds = gl.map((g) => g.id);
    } else if (s.kind === 'account' || s.kind === 'rule') {
      createdJournalId = await this.postCategorization(
        rootId,
        l,
        [
          {
            accountId: s.accountId!,
            amount: Math.abs(num(l.amount)),
            taxCode: s.taxCode,
          },
        ],
        s.label,
      );
      matchedJournalId = createdJournalId;
      if (s.ruleId)
        await this.prisma.finBankRule.update({
          where: { id: s.ruleId },
          data: { hits: { increment: 1 } },
        });
    } else {
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        s.blocked ?? 'Choose a ledger record or an account.',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.prisma.finBankLine.update({
      where: { id: l.id },
      data: {
        status: 'Matched',
        matchedJournalId,
        matchedLineIds: matchedLineIds ?? undefined,
        createdJournalId,
        matchedById: actor?.userId ?? null,
        matchedAt: new Date(),
        suggestion: s as unknown as Prisma.InputJsonValue,
      },
    });
    await this.ctx.audit(
      rootId,
      actor,
      'bank.matched',
      'feed',
      l.id,
      `${why ?? 'Matched'}: ${s.label}`,
    );
    return updated;
  }

  async match(
    actor: FinActor,
    id: string,
    choice?: {
      lineIds?: string[];
      accountId?: string;
      taxCode?: string | null;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Matching a bank transaction');
    const l = await this.mustLine(actor.rootId, id);
    if (l.status === 'Matched' || l.status === 'Excluded')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `This transaction is already ${l.status.toLowerCase()}.`,
        HttpStatus.CONFLICT,
      );
    let s: Suggestion | null = null;
    if (choice?.lineIds?.length)
      s = {
        kind: 'journal',
        lineIds: choice.lineIds,
        label: 'Chosen ledger record',
        evidence: 'Chosen by hand',
      };
    else if (choice?.accountId) {
      const acct = await this.prisma.finAccount.findFirst({
        where: { id: choice.accountId, businessId: actor.rootId },
      });
      if (!acct)
        throw new AppException(
          FIN_ERRORS.NOT_FOUND,
          'Account not found',
          HttpStatus.NOT_FOUND,
        );
      s = {
        kind: 'account',
        accountId: acct.id,
        taxCode: choice.taxCode ?? null,
        label: `Categorized to ${acct.code} ${acct.name}`,
        evidence: 'Chosen by hand',
      };
    } else s = (l.suggestion as unknown as Suggestion) ?? null;
    if (!s)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'No suggestion — choose a ledger record or an account.',
        HttpStatus.BAD_REQUEST,
      );
    return this.applyMatch(actor.rootId, l, s, actor);
  }

  async split(
    actor: FinActor,
    id: string,
    parts: { accountId: string; amount: number; description?: string }[],
  ) {
    this.ctx.need(actor, 'manage', 'Splitting a bank transaction');
    const l = await this.mustLine(actor.rootId, id);
    if (l.status === 'Matched' || l.status === 'Excluded')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `This transaction is already ${l.status.toLowerCase()}.`,
        HttpStatus.CONFLICT,
      );
    await this.assertUnlocked(actor.rootId, l);
    const total = r2(parts.reduce((a, p) => a + Math.abs(p.amount), 0));
    if (parts.length < 2 || total !== r2(Math.abs(num(l.amount))))
      throw new AppException(
        FIN_ERRORS.INVALID,
        `Split parts total ${total.toFixed(2)} — they must add up to the bank amount ${Math.abs(num(l.amount)).toFixed(2)}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const jid = await this.postCategorization(
      actor.rootId,
      l,
      parts,
      `Split into ${parts.length} lines`,
    );
    const updated = await this.prisma.finBankLine.update({
      where: { id },
      data: {
        status: 'Matched',
        matchedJournalId: jid,
        createdJournalId: jid,
        matchedById: actor.userId,
        matchedAt: new Date(),
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bank.split',
      'feed',
      id,
      `Split into ${parts.length} lines`,
    );
    return updated;
  }

  async unmatch(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Undoing a match');
    const l = await this.mustLine(actor.rootId, id);
    await this.assertUnlocked(actor.rootId, l);
    if (l.createdJournalId) {
      await this.posting.postSystem(
        actor.rootId,
        {
          type: 'bankline',
          id: l.id,
          event: 'categorize',
          hash: `undo-${Date.now()}`,
          label: 'Match undone',
        },
        {
          date: l.date,
          currency: 'XXX',
          fxRate: 1,
          branchId: null,
          memo: 'Match undone',
          lines: [],
        },
      );
    }
    const updated = await this.prisma.finBankLine.update({
      where: { id },
      data: {
        status: 'New',
        matchedJournalId: null,
        matchedLineIds: Prisma.DbNull,
        createdJournalId: null,
        excludeReason: null,
        matchedById: null,
        matchedAt: null,
        reconciliationId: null,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bank.unmatched',
      'feed',
      id,
      l.status === 'Excluded' ? 'Exclusion undone' : 'Match undone',
    );
    return this.suggest(actor.rootId, updated, actor);
  }

  async exclude(actor: FinActor, id: string, reason: string) {
    this.ctx.need(actor, 'manage', 'Excluding a bank transaction');
    const l = await this.mustLine(actor.rootId, id);
    if (l.status === 'Matched')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Undo the match first.',
        HttpStatus.CONFLICT,
      );
    await this.assertUnlocked(actor.rootId, l);
    const updated = await this.prisma.finBankLine.update({
      where: { id },
      data: { status: 'Excluded', excludeReason: reason.slice(0, 300) },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bank.excluded',
      'feed',
      id,
      reason,
    );
    return updated;
  }

  async createRule(
    actor: FinActor,
    dto: {
      name: string;
      contains: string;
      direction?: string;
      accountId: string;
      taxCode?: string | null;
      mode?: string;
      bankAccountId?: string | null;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Creating a bank rule');
    const acct = await this.prisma.finAccount.findFirst({
      where: { id: dto.accountId, businessId: actor.rootId },
    });
    if (!acct || acct.isHeader || !acct.active)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose an active, postable account.',
        HttpStatus.BAD_REQUEST,
      );
    if (dto.mode === 'auto')
      this.ctx.need(actor, 'approve', 'An auto-apply rule');
    const rule = await this.prisma.finBankRule.create({
      data: {
        businessId: actor.rootId,
        name: dto.name.slice(0, 120),
        contains: dto.contains.slice(0, 120),
        direction: dto.direction ?? 'any',
        accountId: acct.id,
        taxCode: dto.taxCode ?? null,
        mode: dto.mode === 'auto' ? 'auto' : 'suggest',
        bankAccountId: dto.bankAccountId ?? null,
        createdById: actor.userId,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'bank.rule_created',
      'rule',
      rule.id,
      `${rule.name}: contains “${rule.contains}” → ${acct.code}`,
    );
    const n = await this.resuggestAll(actor.rootId);
    return { rule, rescanned: n };
  }

  async deleteRule(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Removing a bank rule');
    await this.prisma.finBankRule.updateMany({
      where: { id, businessId: actor.rootId },
      data: { active: false },
    });
    await this.ctx.audit(actor.rootId, actor, 'bank.rule_disabled', 'rule', id);
  }

  // ── reconciliation ───────────────────────────────────────────────────────

  async mustRecon(rootId: string, id: string) {
    const r = await this.prisma.finReconciliation.findFirst({
      where: { id, businessId: rootId },
    });
    if (!r)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Reconciliation not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  async startRecon(
    actor: FinActor,
    dto: { bankAccountId: string; periodEnd: string; statementBalance: number },
  ) {
    this.ctx.need(actor, 'manage', 'Starting a reconciliation');
    const a = await this.mustAccount(actor.rootId, dto.bankAccountId);
    const open = await this.prisma.finReconciliation.findFirst({
      where: {
        businessId: actor.rootId,
        bankAccountId: a.id,
        status: { in: ['In Progress', 'Review Required', 'Reopened'] },
      },
    });
    if (open)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${a.name} already has a reconciliation in progress.`,
        HttpStatus.CONFLICT,
      );
    const last = await this.prisma.finReconciliation.findFirst({
      where: {
        businessId: actor.rootId,
        bankAccountId: a.id,
        status: 'Locked',
      },
      orderBy: { periodEnd: 'desc' },
    });
    const periodEnd = dayOf(dto.periodEnd);
    if (last && periodEnd <= last.periodEnd)
      throw new AppException(
        FIN_ERRORS.INVALID,
        `${a.name} is already reconciled to ${ymd(last.periodEnd)} — choose a later statement date.`,
        HttpStatus.BAD_REQUEST,
      );
    const r = await this.prisma.finReconciliation.create({
      data: {
        businessId: actor.rootId,
        bankAccountId: a.id,
        periodEnd,
        statementBalance: r2(dto.statementBalance),
        status: 'In Progress',
        preparedById: actor.userId,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'recon.started',
      'recon',
      r.id,
      `${a.name} to ${ymd(periodEnd)}`,
    );
    return r;
  }

  /** Everything the reconciliation workspace shows, computed from the bank lines and the ledger. */
  async workspace(rootId: string, id: string) {
    const r = await this.mustRecon(rootId, id);
    const a = await this.mustAccount(rootId, r.bankAccountId);
    const last = await this.prisma.finReconciliation.findFirst({
      where: {
        businessId: rootId,
        bankAccountId: a.id,
        status: 'Locked',
        periodEnd: { lt: r.periodEnd },
        NOT: { id: r.id },
      },
      orderBy: { periodEnd: 'desc' },
    });
    const lines = await this.prisma.finBankLine.findMany({
      where: {
        businessId: rootId,
        bankAccountId: a.id,
        date: { lte: r.periodEnd },
        status: { not: 'Excluded' },
        OR: [{ reconciliationId: null }, { reconciliationId: r.id }],
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    // Opening: last locked statement balance; first reconciliation: ledger balance before the first line.
    let opening: number;
    if (last) opening = num(last.statementBalance);
    else {
      const first = lines[0]?.date ?? r.periodEnd;
      const before = new Date(first.getTime() - 86_400_000);
      // The account's opening-balance entry counts as opening even when dated inside the statement.
      const ob = await this.prisma.finJournalLine.aggregate({
        where: {
          businessId: rootId,
          accountId: a.glAccountId,
          postedAt: { not: null },
          date: { gt: before },
          journal: { sourceType: 'bankopen' },
        },
        _sum: { txnDebit: true, txnCredit: true },
      });
      opening = r2(
        (await this.bookBalance(rootId, a, before)).own +
          num(ob._sum.txnDebit) -
          num(ob._sum.txnCredit),
      );
    }
    const items = (Array.isArray(r.items) ? r.items : []) as {
      lineId: string;
      kind: string;
      note?: string;
    }[];
    const timing = new Set(
      items.filter((i) => i.kind === 'timing').map((i) => i.lineId),
    );
    const journalIds = [
      ...new Set(
        lines.map((l) => l.matchedJournalId).filter(Boolean) as string[],
      ),
    ];
    const js = await this.prisma.finJournal.findMany({
      where: { id: { in: journalIds } },
      select: { id: true, number: true, sourceLabel: true, memo: true },
    });
    const jById = new Map(js.map((j) => [j.id, j]));
    const rows = lines.map((l) => {
      const j = l.matchedJournalId ? jById.get(l.matchedJournalId) : null;
      const matched = l.status === 'Matched';
      return {
        id: l.id,
        date: l.date,
        desc: l.description,
        amt: num(l.amount),
        status: l.status,
        matched,
        timing: timing.has(l.id),
        led: j ? (j.sourceLabel ?? j.memo ?? j.number) : null,
        je: j?.number ?? null,
        jeId: j?.id ?? null,
        suggestion:
          (l.suggestion as unknown as Suggestion | null)?.label ?? null,
      };
    });
    const cleared = r2(
      rows.filter((x) => x.matched).reduce((s, x) => s + x.amt, 0),
    );
    const explained = r2(
      rows.filter((x) => !x.matched && x.timing).reduce((s, x) => s + x.amt, 0),
    );
    const diff = r2(num(r.statementBalance) - (opening + cleared + explained));
    const book = await this.bookBalance(rootId, a, r.periodEnd);
    const { ids } = await this.matchedLedgerLineIds(rootId, a.id);
    const uncleared = await this.prisma.finJournalLine.findMany({
      where: {
        businessId: rootId,
        accountId: a.glAccountId,
        postedAt: { not: null },
        date: { lte: r.periodEnd },
      },
      include: {
        journal: {
          select: {
            number: true,
            sourceLabel: true,
            memo: true,
            sourceType: true,
            sourceId: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 300,
    });
    const created = new Set(
      lines.map((l) => l.createdJournalId).filter(Boolean),
    );
    const outstanding = uncleared
      .filter(
        (g) =>
          !ids.has(g.id) &&
          !(g.journal.sourceType === 'bankline' && created.has(g.journalId)),
      )
      .filter((g) => g.journal.sourceType !== 'bankline')
      .slice(0, 50)
      .map((g) => ({
        id: g.id,
        date: g.date,
        amt: r2(num(g.txnDebit) - num(g.txnCredit)),
        je: g.journal.number,
        desc: g.journal.sourceLabel ?? g.journal.memo ?? g.description,
      }));
    return {
      recon: r,
      account: a,
      opening: r2(opening),
      statement: num(r.statementBalance),
      cleared,
      explained,
      diff,
      book: book.own,
      rows,
      outstanding,
      matchedCount: rows.filter((x) => x.matched).length,
      openCount: rows.filter((x) => !x.matched && !x.timing).length,
    };
  }

  async markTiming(
    actor: FinActor,
    id: string,
    lineId: string,
    on: boolean,
    note?: string,
  ) {
    this.ctx.need(actor, 'manage', 'Marking a timing difference');
    const r = await this.mustRecon(actor.rootId, id);
    if (!['In Progress', 'Reopened', 'Review Required'].includes(r.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `This reconciliation is ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    const items = (
      (Array.isArray(r.items) ? r.items : []) as {
        lineId: string;
        kind: string;
        note?: string;
      }[]
    ).filter((i) => i.lineId !== lineId);
    if (on) items.push({ lineId, kind: 'timing', note: note?.slice(0, 300) });
    await this.prisma.finReconciliation.update({
      where: { id },
      data: {
        items: items,
        status: 'In Progress',
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      on ? 'recon.timing_marked' : 'recon.timing_cleared',
      'recon',
      id,
      note,
    );
  }

  async submitRecon(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Submitting a reconciliation');
    const w = await this.workspace(actor.rootId, id);
    if (!['In Progress', 'Reopened'].includes(w.recon.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `This reconciliation is ${w.recon.status}.`,
        HttpStatus.CONFLICT,
      );
    if (w.diff !== 0)
      throw new AppException(
        FIN_ERRORS.INVALID,
        `The difference is ${w.diff.toFixed(2)} — it must be zero before submitting.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finReconciliation.update({
        where: { id },
        data: {
          status: 'Review Required',
          submittedAt: new Date(),
          preparedById: actor.userId,
          bookBalance: w.book,
        },
      });
      await this.journals.requestApproval(
        actor.rootId,
        actor,
        {
          subjectType: 'reconciliation',
          subjectId: id,
          title: `Reconciliation · ${w.account.name} to ${ymd(w.recon.periodEnd)}`,
          amount: w.statement,
          rule: 'Reconciliation needs an independent approver',
          level: 'approve',
        },
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'recon.submitted',
      'recon',
      id,
      'Difference 0.00 — submitted for approval',
    );
  }

  async approveRecon(actor: FinActor, id: string) {
    const w = await this.workspace(actor.rootId, id);
    if (w.recon.status !== 'Review Required')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Submit the reconciliation for approval first.',
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    this.journals.assertCanApprove(
      actor,
      'approve',
      w.recon.preparedById,
      cfg.sod.sod3,
      'Approving a reconciliation',
    );
    if (w.diff !== 0)
      throw new AppException(
        FIN_ERRORS.INVALID,
        `The difference is ${w.diff.toFixed(2)} — something changed since it was submitted.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBankLine.updateMany({
        where: {
          id: {
            in: w.rows.filter((x) => x.matched || x.timing).map((x) => x.id),
          },
        },
        data: { reconciliationId: id },
      });
      await tx.finReconciliation.update({
        where: { id },
        data: {
          status: 'Locked',
          approvedById: actor.userId,
          approvedAt: new Date(),
        },
      });
      await tx.finBankAccount.update({
        where: { id: w.account.id },
        data: {
          statementBalance: w.statement,
          statementDate: w.recon.periodEnd,
        },
      });
      await this.journals.decide(
        actor.rootId,
        'reconciliation',
        id,
        'Approved',
        actor,
        undefined,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'recon.locked',
      'recon',
      id,
      `${w.account.name} reconciled and locked`,
    );
  }

  async reopenRecon(actor: FinActor, id: string, reason: string) {
    this.ctx.need(actor, 'admin', 'Reopening a locked reconciliation');
    const r = await this.mustRecon(actor.rootId, id);
    if (r.status !== 'Locked' && r.status !== 'Review Required')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Only a locked or submitted reconciliation can be reopened.',
        HttpStatus.CONFLICT,
      );
    const later = await this.prisma.finReconciliation.count({
      where: {
        businessId: actor.rootId,
        bankAccountId: r.bankAccountId,
        status: 'Locked',
        periodEnd: { gt: r.periodEnd },
      },
    });
    if (later)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'A later reconciliation for this account is locked — reopen that one first.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.finReconciliation.update({
      where: { id },
      data: {
        status: 'Reopened',
        reopenReason: reason.slice(0, 500),
        approvedById: null,
        approvedAt: null,
      },
    });
    await this.prisma.finApproval.updateMany({
      where: {
        businessId: actor.rootId,
        subjectType: 'reconciliation',
        subjectId: id,
        status: 'Pending',
      },
      data: { status: 'Cancelled' },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'recon.reopened',
      'recon',
      id,
      reason,
    );
  }
}
