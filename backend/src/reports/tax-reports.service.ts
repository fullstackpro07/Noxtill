import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { NotificationsService } from '../notifications/notifications.service';
import { ReportBuildersService } from './report-builders.service';
import { currentMonth, monthLabel, previousMonth, round2 } from './reports.types';

const TREND_MONTHS = 8;
const TABLE_MONTHS = 6;

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RecordFilingInput {
  period: string;
  filedOn: string;
  reference?: string;
  notes?: string;
}

/**
 * The real data behind Reports > Tax Reports. Every figure is prepared from recorded orders and
 * approved returns; the module never files anything, never assumes a rate for a transaction that
 * has none, and says plainly that tax paid on purchases is not tracked (no supplier invoice or
 * expense in this system records it).
 */
@Injectable()
export class TaxReportsService {
  private readonly logger = new Logger(TaxReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builders: ReportBuildersService,
    private readonly s3: S3Service,
    private readonly notifications: NotificationsService,
  ) {}

  /** The next filing date and which period it is for, skipping periods already recorded as filed. */
  private nextFiling(
    filingDay: number,
    filed: Set<string>,
    today: Date,
  ): { period: string; date: Date; daysUntil: number } {
    let month = currentMonth();
    for (let i = 0; i < 24; i++) {
      const period = previousMonth(month);
      if (!filed.has(period)) {
        const [y, m] = month.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, filingDay));
        const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        return { period, date, daysUntil: Math.round((date.getTime() - startOfToday) / 86_400_000) };
      }
      month = addMonths(month, 1);
    }
    const [y, m] = month.split('-').map(Number);
    return { period: previousMonth(month), date: new Date(Date.UTC(y, m - 1, filingDay)), daysUntil: 0 };
  }

  async summary(businessId: string, period?: string) {
    const resolved = period ?? currentMonth();
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });

    const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => addMonths(resolved, i - (TREND_MONTHS - 1)));
    const tableMonths = Array.from({ length: TABLE_MONTHS }, (_, i) => addMonths(resolved, -i));
    const allMonths = [...new Set([...trendMonths, ...tableMonths])];

    const [figuresList, filings] = await Promise.all([
      Promise.all(allMonths.map((m) => this.builders.taxFigures(businessId, m))),
      this.prisma.taxFiling.findMany({ where: { businessId } }),
    ]);
    const figures = new Map(allMonths.map((m, i) => [m, figuresList[i]]));
    const filedSet = new Set(filings.map((f) => f.period));
    const filingByPeriod = new Map(filings.map((f) => [f.period, f]));
    const cur = figures.get(resolved)!;
    const now = new Date();
    const next = this.nextFiling(business.taxFilingDay, filedSet, now);

    const reminder = await this.prisma.taxReminder.findFirst({
      where: { businessId, period: next.period, sentAt: null },
    });

    const rows = tableMonths.flatMap((m) => {
      const f = figures.get(m)!;
      const filed = filingByPeriod.get(m);
      const isCurrent = m === currentMonth();
      const base = filed
        ? { status: 'Recorded as filed', statusTone: 'green' as const }
        : isCurrent
          ? { status: 'Current', statusTone: 'blue' as const }
          : { status: 'Not recorded as filed', statusTone: 'neutral' as const };
      const rated = f.rates.map((r) => ({
        period: m, periodLabel: monthLabel(m).split(' ').slice(-2).join(' '),
        rateLabel: `${r.ratePercent}%`,
        ratePercent: r.ratePercent, taxable: r.taxable, collected: r.collected, orders: r.orders, ...base,
      }));
      const unrated = f.unrated.orders > 0
        ? [{
            period: m, periodLabel: monthLabel(m).split(' ').slice(-2).join(' '),
            rateLabel: 'No rate recorded', ratePercent: null as number | null,
            taxable: f.unrated.taxable, collected: null as number | null, orders: f.unrated.orders,
            status: 'Needs review', statusTone: 'red' as const,
          }]
        : [];
      return [...rated, ...unrated];
    });

    const issues: { key: string; title: string; meta: string; count: number; tone: 'red' | 'amber' }[] = [];
    if (cur.unrated.orders > 0) {
      issues.push({
        key: 'no-rate',
        title: `${cur.unrated.orders} transaction${cur.unrated.orders === 1 ? '' : 's'} with no tax rate`,
        meta: 'Listed separately, not assumed zero-rated',
        count: cur.unrated.orders, tone: 'red',
      });
    }
    if (cur.refunds.count > 0) {
      issues.push({
        key: 'refunds',
        title: `${cur.refunds.count} approved return${cur.refunds.count === 1 ? '' : 's'} not netted`,
        meta: 'How much of each refund was tax is not recorded',
        count: cur.refunds.count, tone: 'amber',
      });
    }
    issues.push({
      key: 'purchases',
      title: `${business.taxLabel} on purchases is not tracked`,
      meta: 'No supplier invoice or expense records tax paid',
      count: 1, tone: 'amber',
    });

    return {
      period: resolved,
      periodLabel: monthLabel(resolved),
      taxLabel: business.taxLabel,
      taxRate: Number(business.taxRate),
      country: business.country,
      currency: business.currency,
      kpis: {
        taxableSales: cur.taxableSales,
        taxCollected: cur.taxCollected,
        taxOnPurchasesTracked: false,
        refundsApproved: cur.refunds,
        netTax: cur.taxCollected,
        transactions: cur.orders,
        unratedTransactions: cur.unrated.orders,
      },
      trend: trendMonths.map((m) => ({
        period: m,
        label: new Date(`${m}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
        taxCollected: figures.get(m)!.taxCollected,
        partial: m === currentMonth(),
      })),
      filing: {
        day: business.taxFilingDay,
        nextDate: isoDate(next.date),
        forPeriod: next.period,
        forPeriodLabel: monthLabel(next.period),
        daysUntil: next.daysUntil,
        reminderOn: reminder ? isoDate(reminder.remindOn) : null,
        filedPeriods: filings.map((f) => ({ period: f.period, filedOn: isoDate(f.filedOn), reference: f.reference, netTaxAtFiling: Number(f.netTaxAtFiling) })),
      },
      issues,
      rows,
    };
  }

  async setFilingDay(businessId: string, day: number) {
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      throw new AppException('TAX_FILING_DAY_INVALID', 'The filing day must be a whole number from 1 to 28.', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.business.update({ where: { id: businessId }, data: { taxFilingDay: day } });
    return { day };
  }

  async recordFiling(businessId: string, userId: string, input: RecordFilingInput) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) {
      throw new AppException('TAX_PERIOD_INVALID', 'period must be YYYY-MM.', HttpStatus.BAD_REQUEST);
    }
    const filedOn = new Date(input.filedOn);
    if (Number.isNaN(filedOn.getTime())) {
      throw new AppException('TAX_DATE_INVALID', 'filedOn must be a valid date.', HttpStatus.BAD_REQUEST);
    }
    const existing = await this.prisma.taxFiling.findUnique({ where: { businessId_period: { businessId, period: input.period } } });
    if (existing) {
      throw new AppException('TAX_ALREADY_FILED', `${monthLabel(input.period)} is already recorded as filed.`, HttpStatus.CONFLICT);
    }
    const figures = await this.builders.taxFigures(businessId, input.period);
    const filing = await this.prisma.taxFiling.create({
      data: {
        businessId, period: input.period, filedOn,
        reference: input.reference?.trim() || null, notes: input.notes?.trim() || null,
        netTaxAtFiling: figures.taxCollected, filedByUserId: userId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        businessId, actorUserId: userId, action: 'tax.recorded_as_filed', entity: 'tax_filing', entityId: filing.id,
        after: { period: input.period, filedOn: isoDate(filedOn), reference: filing.reference, netTaxAtFiling: figures.taxCollected },
      },
    });
    return { id: filing.id, period: filing.period };
  }

  /** A real reminder: the daily job notifies on `remindOn` (three days before the date, never in the past). */
  async remind(businessId: string, userId: string, period: string) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const filed = new Set((await this.prisma.taxFiling.findMany({ where: { businessId } })).map((f) => f.period));
    const next = this.nextFiling(business.taxFilingDay, filed, new Date());
    if (next.period !== period) {
      throw new AppException('TAX_REMINDER_PERIOD', 'Reminders are set for the next filing only.', HttpStatus.BAD_REQUEST);
    }
    const today = new Date();
    const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const remindOn = new Date(Math.max(next.date.getTime() - 3 * 86_400_000, startOfToday.getTime()));
    await this.prisma.taxReminder.deleteMany({ where: { businessId, userId, period, sentAt: null } });
    await this.prisma.taxReminder.create({ data: { businessId, userId, period, remindOn } });
    return { remindOn: isoDate(remindOn), filingDate: isoDate(next.date) };
  }

  /** Called by the daily job: turns every reminder that has come due into an in-app notification, once. */
  async processDueReminders(now: Date = new Date()): Promise<number> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const due = await this.prisma.taxReminder.findMany({ where: { sentAt: null, remindOn: { lte: today } } });
    let sent = 0;
    for (const r of due) {
      try {
        const business = await this.prisma.business.findUnique({ where: { id: r.businessId } });
        await this.notifications.create(
          r.businessId, r.userId,
          {
            title: `${business?.taxLabel ?? 'Tax'} filing coming up`,
            body: `You asked to be reminded about your ${monthLabel(r.period)} return. Noxtill does not file for you.`,
            link: '/reports/tax',
          },
          'tax_filing_reminder',
        );
        await this.prisma.taxReminder.update({ where: { id: r.id }, data: { sentAt: now } });
        sent += 1;
      } catch (error) {
        this.logger.warn(`Tax reminder ${r.id} failed: ${(error as Error).message}`);
      }
    }
    return sent;
  }

  async excel(businessId: string, period?: string): Promise<{ url: string }> {
    const summary = await this.summary(businessId, period);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tax by rate and period');
    ws.columns = [
      { header: 'Period', key: 'period', width: 14 },
      { header: 'Rate', key: 'rate', width: 18 },
      { header: 'Taxable amount', key: 'taxable', width: 16 },
      { header: `${summary.taxLabel} collected`, key: 'collected', width: 16 },
      { header: 'Transactions', key: 'orders', width: 13 },
      { header: 'Status', key: 'status', width: 22 },
    ];
    for (const r of summary.rows) {
      ws.addRow({ period: r.periodLabel, rate: r.rateLabel, taxable: round2(r.taxable), collected: r.collected === null ? null : round2(r.collected), orders: r.orders, status: r.status });
    }
    ws.getRow(1).font = { bold: true };
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const key = `reports/${businessId}/tax-${summary.period}-${Date.now()}.xlsx`;
    const url = await this.s3.uploadAndSign(key, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return { url };
  }
}
