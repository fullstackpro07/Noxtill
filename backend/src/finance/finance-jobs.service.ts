import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinActor, FinanceContextService } from './finance-context.service';
import { FinanceSourcesService } from './finance-sources.service';
import { FinanceBankingService } from './finance-banking.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceCloseService } from './finance-close.service';
import { FinanceSettingsService } from './finance-settings.service';
import { FinanceTaxService } from './finance-tax.service';
import { FinanceViewsService } from './finance-views.service';

export interface FinanceTickReport {
  sweep: {
    posted: number;
    reposted: number;
    reversed: number;
    failed: number;
    errors: string[];
  };
  payouts: number;
  autoReversals: number;
  depreciation: string | null;
  expiredGrants: number;
  nightly: boolean;
}

/**
 * Everything Finance does on its own, once a minute per ledger: post new and changed source
 * records, pull payouts into bank feeds, auto-reverse accruals, expire accountant access, soft-close
 * finished months and post last month's depreciation. At 02:00 (business time) it also does a full
 * re-scan of every source and stores the books-health result.
 */
@Injectable()
export class FinanceJobsService {
  private readonly logger = new Logger(FinanceJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly sources: FinanceSourcesService,
    private readonly banking: FinanceBankingService,
    private readonly journals: FinanceJournalsService,
    private readonly assets: FinanceAssetsService,
    private readonly close: FinanceCloseService,
    private readonly settings: FinanceSettingsService,
    private readonly tax: FinanceTaxService,
    private readonly views: FinanceViewsService,
  ) {}

  async ledgers(): Promise<string[]> {
    return (
      await this.prisma.finSettings.findMany({ select: { businessId: true } })
    ).map((r) => r.businessId);
  }

  /** A stand-in actor for computations the system runs (it is never used for permission checks). */
  systemActor(rootId: string): FinActor {
    return {
      userId: 'system',
      name: 'System',
      role: 'Owner',
      title: 'Owner/Controller',
      view: true,
      manage: true,
      approve: true,
      admin: true,
      rootId,
      businessId: rootId,
      scopeBranches: null,
    };
  }

  private async nightlyDue(rootId: string) {
    const biz = await this.ctx.business(rootId);
    const hour =
      Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: biz.timezone || 'UTC',
          hour: 'numeric',
          hour12: false,
        }).format(new Date()),
      ) % 24;
    if (hour < 2) return false;
    const last = await this.prisma.finHealthRun.findFirst({
      where: { businessId: rootId },
      orderBy: { createdAt: 'desc' },
    });
    return !last || Date.now() - last.createdAt.getTime() > 20 * 3600_000;
  }

  async run(
    rootId: string,
    opts: { full?: boolean } = {},
  ): Promise<FinanceTickReport> {
    const step = async <T>(
      name: string,
      fn: () => Promise<T>,
      dflt: T,
    ): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        this.logger.warn(
          `finance ${name} failed for ${rootId}: ${(e as Error).message}`,
        );
        return dflt;
      }
    };
    const nightly = opts.full
      ? false
      : await step('nightly check', () => this.nightlyDue(rootId), false);
    const sweep = await step(
      'sweep',
      () => this.sources.sweep(rootId, !!opts.full || nightly),
      {
        scanned: 0,
        posted: 0,
        reposted: 0,
        reversed: 0,
        failed: 0,
        errors: [] as string[],
        ms: 0,
      },
    );
    const payouts = await step(
      'payouts',
      () => this.banking.syncPayouts(rootId),
      0,
    );
    const autoReversals = await step(
      'auto-reversals',
      () => this.journals.autoReversals(rootId),
      0,
    );
    const expiredGrants = await step(
      'access expiry',
      () => this.settings.expireGrants(rootId),
      0,
    );
    await step(
      'soft close',
      () => this.close.softCloseSweep(rootId),
      undefined,
    );
    const dep = await step(
      'depreciation',
      () => this.assets.autoRun(rootId),
      null,
    );
    if (nightly)
      await step('health', () => this.storeHealth(rootId), undefined);
    return {
      sweep: {
        posted: sweep.posted,
        reposted: sweep.reposted,
        reversed: sweep.reversed,
        failed: sweep.failed,
        errors: sweep.errors,
      },
      payouts,
      autoReversals,
      depreciation: dep ? dep.journal.number : null,
      expiredGrants,
      nightly,
    };
  }

  async storeHealth(rootId: string) {
    const c = await this.views.scope(this.systemActor(rootId), {});
    await this.tax.ensure(rootId);
    const h = await this.views.health(c);
    await this.prisma.finHealthRun.create({
      data: {
        businessId: rootId,
        results: h.rows.map((r) => ({ l: r.l, v: r.v, s: r.s })),
        ok: h.rows.filter((r) => r.s === 'ok').length,
        issues: h.rows.filter((r) => r.s !== 'ok').length,
      },
    });
    const bad = h.rows.filter((r) => r.s === 'fail');
    if (bad.length)
      await this.ctx.notify(
        rootId,
        'admin',
        'Books health: controls need attention',
        bad
          .map((r) => `${r.l}: ${r.v}`)
          .join(' · ')
          .slice(0, 900),
        '/finance',
      );
  }
}
