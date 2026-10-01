import { HttpStatus, Injectable } from '@nestjs/common';
import { FinAsset } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  monthEnd,
  monthKey,
  monthLabel,
  num,
  r2,
  ymd,
} from './finance-context.service';
import { FinancePostingService, LineInput } from './finance-posting.service';
import { FIN_ERRORS } from './finance.constants';

export interface DepRow {
  asset: FinAsset;
  open: number;
  dep: number;
  close: number;
}

/**
 * The fixed-asset book: capitalization, monthly depreciation (straight-line or double-declining,
 * never below salvage) and disposal. Accumulated depreciation per asset is always read back from
 * posted ledger lines tagged with the asset, so the register and account 1590 can't drift apart.
 */
@Injectable()
export class FinanceAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly posting: FinancePostingService,
  ) {}

  async mustAsset(rootId: string, id: string) {
    const a = await this.prisma.finAsset.findFirst({
      where: { id, businessId: rootId },
    });
    if (!a)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Asset not found',
        HttpStatus.NOT_FOUND,
      );
    return a;
  }

  /** Posted accumulated depreciation per asset (credit balance on its accumulated account). */
  async accumulated(rootId: string, asAt?: Date) {
    const rows = await this.prisma.finJournalLine.groupBy({
      by: ['assetId', 'accountId'],
      where: {
        businessId: rootId,
        assetId: { not: null },
        postedAt: { not: null },
        ...(asAt ? { date: { lte: asAt } } : {}),
      },
      _sum: { debit: true, credit: true },
    });
    const assets = await this.prisma.finAsset.findMany({
      where: { businessId: rootId },
      select: { id: true, accumAccountId: true },
    });
    const accumOf = new Map(assets.map((a) => [a.id, a.accumAccountId]));
    const out = new Map<string, number>();
    for (const r of rows)
      if (r.assetId && accumOf.get(r.assetId) === r.accountId)
        out.set(
          r.assetId,
          r2(
            (out.get(r.assetId) ?? 0) + num(r._sum.credit) - num(r._sum.debit),
          ),
        );
    return out;
  }

  /** One month's charge for an asset given what is already depreciated. */
  monthly(
    a: FinAsset,
    accumulated: number,
    year: number,
    month: number,
  ): number {
    if (a.status !== 'Active') return 0;
    const svc = monthKey(a.inServiceOn);
    if (year * 12 + month < svc.year * 12 + svc.month) return 0;
    const cost = num(a.cost);
    const salvage = num(a.salvage);
    const remaining = r2(cost - salvage - accumulated);
    if (remaining <= 0) return 0;
    let charge: number;
    if (a.method === 'declining')
      charge = ((cost - accumulated) * 2) / a.lifeMonths;
    else charge = (cost - salvage) / a.lifeMonths;
    const elapsed = year * 12 + month - (svc.year * 12 + svc.month) + 1;
    // Last month of straight-line life takes whatever is left (rounding).
    if (a.method !== 'declining' && elapsed >= a.lifeMonths) charge = remaining;
    return r2(Math.min(remaining, Math.max(0, charge)));
  }

  /** Bill lines posted to Fixed Assets — Cost that no asset record covers yet. */
  async pendingCapitalization(rootId: string) {
    const maps = await this.ctx.accountMaps(rootId);
    const fa = maps.byKey.get('fa_cost')!;
    const lines = await this.prisma.finBillLine.findMany({
      where: {
        businessId: rootId,
        accountId: fa.id,
        bill: {
          status: {
            in: [
              'Posted',
              'Partially Paid',
              'Paid',
              'Approved for Payment',
              'On Hold',
            ],
          },
        },
      },
      include: {
        bill: {
          select: {
            id: true,
            number: true,
            vendorName: true,
            billDate: true,
            fxRate: true,
          },
        },
      },
    });
    const covered = new Set(
      (
        await this.prisma.finAsset.findMany({
          where: { businessId: rootId, billId: { not: null } },
          select: { billId: true },
        })
      ).map((a) => a.billId),
    );
    return lines
      .filter((l) => !covered.has(l.billId))
      .map((l) => ({
        billId: l.billId,
        bill: l.bill.number,
        vendor: l.bill.vendorName,
        description: l.description,
        amount: r2(num(l.amount) * num(l.bill.fxRate)),
        date: l.bill.billDate,
      }));
  }

  async capitalize(
    actor: FinActor,
    dto: {
      name: string;
      category: string;
      branchId?: string | null;
      acquiredOn: string;
      inServiceOn: string;
      cost: number;
      salvage?: number;
      lifeMonths: number;
      method?: string;
      fundingAccountId?: string | null;
      billId?: string | null;
      location?: string;
      notes?: string;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Capitalizing an asset');
    const rootId = actor.rootId;
    const cost = r2(dto.cost);
    const salvage = r2(dto.salvage ?? 0);
    if (cost <= 0 || salvage < 0 || salvage >= cost)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Cost must be positive and salvage below cost.',
        HttpStatus.BAD_REQUEST,
      );
    if (!(dto.lifeMonths >= 1 && dto.lifeMonths <= 600))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Useful life must be 1–600 months.',
        HttpStatus.BAD_REQUEST,
      );
    const maps = await this.ctx.accountMaps(rootId);
    const faCost = maps.byKey.get('fa_cost')!;
    // From a bill already posted to 1500: the cost is in the ledger; the register just records it.
    const viaBill =
      !!dto.billId &&
      (dto.fundingAccountId == null || dto.fundingAccountId === faCost.id);
    if (dto.billId) {
      const pend = (await this.pendingCapitalization(rootId)).find(
        (p) => p.billId === dto.billId,
      );
      if (!pend)
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          'That bill has no uncapitalized Fixed Assets line.',
          HttpStatus.CONFLICT,
        );
    }
    if (!viaBill) {
      const f = dto.fundingAccountId
        ? maps.byId.get(dto.fundingAccountId)
        : null;
      if (!f || f.isHeader || !f.active || f.id === faCost.id)
        throw new AppException(
          FIN_ERRORS.INVALID,
          'Choose the account the asset was paid from (bank, A/P or clearing).',
          HttpStatus.BAD_REQUEST,
        );
    }
    const acquiredOn = dayOf(dto.acquiredOn);
    const asset = await this.prisma.$transaction(async (tx) => {
      const number = await this.ctx.nextNumber(
        tx,
        rootId,
        'asset',
        acquiredOn.getUTCFullYear(),
      );
      return tx.finAsset.create({
        data: {
          businessId: rootId,
          number,
          name: dto.name.slice(0, 160),
          category: dto.category.slice(0, 60),
          branchId: dto.branchId ?? null,
          acquiredOn,
          inServiceOn: dayOf(dto.inServiceOn),
          cost,
          salvage,
          lifeMonths: Math.round(dto.lifeMonths),
          method: dto.method === 'declining' ? 'declining' : 'straight_line',
          assetAccountId: faCost.id,
          accumAccountId: maps.byKey.get('fa_accum')!.id,
          expenseAccountId: maps.byKey.get('depreciation')!.id,
          fundingAccountId: viaBill ? faCost.id : dto.fundingAccountId!,
          billId: dto.billId ?? null,
          status: 'Active',
          location: dto.location?.slice(0, 120) ?? null,
          notes: dto.notes ?? null,
          createdById: actor.userId,
        },
      });
    });
    if (!viaBill) {
      const res = await this.posting.postSystem(
        rootId,
        {
          type: 'asset',
          id: asset.id,
          event: 'capitalize',
          hash: `${cost}`,
          label: `Capitalize ${asset.number} · ${asset.name}`,
        },
        {
          date: acquiredOn,
          currency: await this.ctx.baseCurrency(rootId),
          fxRate: 1,
          branchId: asset.branchId,
          memo: `Capitalize ${asset.number} · ${asset.name}`,
          reference: asset.number,
          lines: [
            {
              accountId: faCost.id,
              debit: cost,
              credit: 0,
              description: asset.name,
              assetId: asset.id,
            },
            {
              accountId: dto.fundingAccountId!,
              debit: 0,
              credit: cost,
              description: `Paid for ${asset.name}`,
            },
          ],
        },
      );
      const j = await this.prisma.finJournal.findFirst({
        where: {
          businessId: rootId,
          sourceType: 'asset',
          sourceId: asset.id,
          sourceEvent: 'capitalize',
          superseded: false,
        },
      });
      if (res === 'failed' || !j || j.status !== 'Posted') {
        await this.prisma.finAsset.delete({ where: { id: asset.id } });
        throw new AppException(
          FIN_ERRORS.INVALID,
          `Capitalization failed: ${j?.failureReason ?? 'validation failed'}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      await this.prisma.finAsset.update({
        where: { id: asset.id },
        data: { capitalJournalId: j.id },
      });
    }
    await this.ctx.audit(
      rootId,
      actor,
      'asset.capitalized',
      'asset',
      asset.id,
      `${asset.number} ${asset.name} · cost ${cost.toFixed(2)}${viaBill ? ' (from bill)' : ''}`,
    );
    return asset;
  }

  async preview(
    rootId: string,
    year: number,
    month: number,
  ): Promise<{
    rows: DepRow[];
    total: number;
    run: { journalId: string; total: number } | null;
    blocked: string | null;
  }> {
    const run = await this.prisma.finDepreciationRun.findUnique({
      where: { businessId_year_month: { businessId: rootId, year, month } },
    });
    const assets = await this.prisma.finAsset.findMany({
      where: {
        businessId: rootId,
        status: { in: ['Active', 'Fully Depreciated'] },
      },
      orderBy: { number: 'asc' },
    });
    const before = await this.accumulated(
      rootId,
      new Date(Date.UTC(year, month - 1, 0)),
    );
    const rows: DepRow[] = [];
    if (run) {
      const lines = await this.prisma.finJournalLine.findMany({
        where: { journalId: run.journalId, assetId: { not: null } },
      });
      for (const a of assets) {
        const dep = r2(
          lines
            .filter((l) => l.assetId === a.id)
            .reduce((s, l) => s + num(l.credit), 0),
        );
        if (!dep) continue;
        const open = r2(num(a.cost) - (before.get(a.id) ?? 0));
        rows.push({ asset: a, open, dep, close: r2(open - dep) });
      }
    } else
      for (const a of assets) {
        const acc = before.get(a.id) ?? 0;
        const dep = this.monthly(a, acc, year, month);
        if (!dep) continue;
        const open = r2(num(a.cost) - acc);
        rows.push({ asset: a, open, dep, close: r2(open - dep) });
      }
    const p = await this.ctx.period(rootId, year, month);
    const blocked = run
      ? null
      : p.status === 'locked'
        ? `${monthLabel(year, month)} is locked — reopen it to run depreciation.`
        : null;
    return {
      rows,
      total: r2(rows.reduce((s, r) => s + r.dep, 0)),
      run: run ? { journalId: run.journalId, total: num(run.total) } : null,
      blocked,
    };
  }

  async run(
    actor: FinActor | null,
    rootId: string,
    year: number,
    month: number,
  ) {
    if (actor) this.ctx.need(actor, 'manage', 'Running depreciation');
    const pv = await this.preview(rootId, year, month);
    if (pv.run)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `Depreciation for ${monthLabel(year, month)} is already posted.`,
        HttpStatus.CONFLICT,
      );
    if (pv.blocked)
      throw new AppException(
        FIN_ERRORS.PERIOD_LOCKED,
        pv.blocked,
        HttpStatus.CONFLICT,
      );
    if (!pv.rows.length)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `No depreciation is due for ${monthLabel(year, month)}.`,
        HttpStatus.CONFLICT,
      );
    const lines: LineInput[] = [];
    for (const r of pv.rows) {
      lines.push({
        accountId: r.asset.expenseAccountId,
        debit: r.dep,
        credit: 0,
        description: `${r.asset.number} ${r.asset.name}`,
        assetId: r.asset.id,
        branchId: r.asset.branchId,
      });
      lines.push({
        accountId: r.asset.accumAccountId,
        debit: 0,
        credit: r.dep,
        description: `${r.asset.number} ${r.asset.name}`,
        assetId: r.asset.id,
        branchId: r.asset.branchId,
      });
    }
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const res = await this.posting.postSystem(
      rootId,
      {
        type: 'depreciation',
        id: key,
        event: 'run',
        hash: `${pv.total}`,
        label: `${monthLabel(year, month)} depreciation run · ${pv.rows.length} assets`,
      },
      {
        date: monthEnd(year, month),
        currency: await this.ctx.baseCurrency(rootId),
        fxRate: 1,
        branchId: null,
        memo: `${monthLabel(year, month)} depreciation run · ${pv.rows.length} assets`,
        reference: `DEP-${key}`,
        lines,
      },
    );
    const j = await this.prisma.finJournal.findFirst({
      where: {
        businessId: rootId,
        sourceType: 'depreciation',
        sourceId: key,
        superseded: false,
      },
      orderBy: { sourceRev: 'desc' },
    });
    if (res === 'failed' || !j || j.status !== 'Posted')
      throw new AppException(
        FIN_ERRORS.INVALID,
        `Depreciation journal failed: ${j?.failureReason ?? 'validation failed'}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.finDepreciationRun.create({
      data: {
        businessId: rootId,
        year,
        month,
        total: pv.total,
        assets: pv.rows.length,
        journalId: j.id,
        runById: actor?.userId ?? null,
      },
    });
    const acc = await this.accumulated(rootId);
    for (const r of pv.rows)
      if (
        r2(
          num(r.asset.cost) - num(r.asset.salvage) - (acc.get(r.asset.id) ?? 0),
        ) <= 0
      )
        await this.prisma.finAsset.update({
          where: { id: r.asset.id },
          data: { status: 'Fully Depreciated' },
        });
    await this.ctx.audit(
      rootId,
      actor,
      'asset.depreciation_run',
      'depreciation',
      key,
      `${pv.rows.length} assets · ${pv.total.toFixed(2)} (${j.number})`,
    );
    return { journal: j, total: pv.total, assets: pv.rows.length };
  }

  /** The job: post last month's depreciation once it's over, if it's due and the period is open. */
  async autoRun(rootId: string) {
    const now = new Date();
    const y =
      now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const m = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
    const pv = await this.preview(rootId, y, m);
    if (pv.run || pv.blocked || !pv.rows.length) return null;
    return this.run(null, rootId, y, m);
  }

  async dispose(
    actor: FinActor,
    id: string,
    dto: {
      date: string;
      proceeds: number;
      proceedsAccountId?: string | null;
      reason?: string;
    },
  ) {
    this.ctx.need(actor, 'approve', 'Disposing of an asset');
    const a = await this.mustAsset(actor.rootId, id);
    if (a.status === 'Disposed')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Already disposed.',
        HttpStatus.CONFLICT,
      );
    const date = dayOf(dto.date);
    const acc = (await this.accumulated(actor.rootId, date)).get(a.id) ?? 0;
    const proceeds = r2(dto.proceeds || 0);
    const maps = await this.ctx.accountMaps(actor.rootId);
    if (proceeds > 0 && !dto.proceedsAccountId)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose the account the proceeds went to.',
        HttpStatus.BAD_REQUEST,
      );
    const nbv = r2(num(a.cost) - acc);
    const gain = r2(proceeds - nbv);
    const lines: LineInput[] = [];
    if (acc)
      lines.push({
        accountId: a.accumAccountId,
        debit: acc,
        credit: 0,
        description: `Remove accumulated depreciation · ${a.number}`,
        assetId: a.id,
      });
    if (proceeds)
      lines.push({
        accountId: dto.proceedsAccountId!,
        debit: proceeds,
        credit: 0,
        description: `Disposal proceeds · ${a.number}`,
      });
    lines.push({
      accountId: a.assetAccountId,
      debit: 0,
      credit: num(a.cost),
      description: `Derecognize ${a.number} ${a.name}`,
      assetId: a.id,
    });
    if (gain)
      lines.push(
        gain > 0
          ? {
              accountId: maps.byKey.get('disposal')!.id,
              debit: 0,
              credit: gain,
              description: `Gain on disposal · ${a.number}`,
            }
          : {
              accountId: maps.byKey.get('disposal')!.id,
              debit: -gain,
              credit: 0,
              description: `Loss on disposal · ${a.number}`,
            },
      );
    const res = await this.posting.postSystem(
      actor.rootId,
      {
        type: 'asset',
        id: a.id,
        event: 'dispose',
        hash: `${proceeds}|${ymd(date)}`,
        label: `Dispose ${a.number} · ${a.name}`,
      },
      {
        date,
        currency: await this.ctx.baseCurrency(actor.rootId),
        fxRate: 1,
        branchId: a.branchId,
        memo: `Disposal of ${a.number} ${a.name} · NBV ${nbv.toFixed(2)} · proceeds ${proceeds.toFixed(2)}${dto.reason ? ` · ${dto.reason}` : ''}`,
        reference: a.number,
        lines,
      },
    );
    const j = await this.prisma.finJournal.findFirst({
      where: {
        businessId: actor.rootId,
        sourceType: 'asset',
        sourceId: a.id,
        sourceEvent: 'dispose',
        superseded: false,
      },
    });
    if (res === 'failed' || !j || j.status !== 'Posted')
      throw new AppException(
        FIN_ERRORS.INVALID,
        `Disposal journal failed: ${j?.failureReason ?? 'validation failed'}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.finAsset.update({
      where: { id },
      data: {
        status: 'Disposed',
        disposedOn: date,
        disposalProceeds: proceeds,
        disposalJournalId: j.id,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'asset.disposed',
      'asset',
      id,
      `${gain >= 0 ? 'Gain' : 'Loss'} ${Math.abs(gain).toFixed(2)} (${j.number})`,
    );
    return { journal: j, gain };
  }
}
