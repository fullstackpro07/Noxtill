import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { WriteOffCreditDto } from './dto/write-off-credit.dto';
import { DebtorRow, buildLedgerRows } from './credit.types';
import {
  CREDIT_ERROR_CODES,
  OVERDUE_BUCKETS,
  WRITE_OFF_CONFIRM_PHRASE,
} from './credit.constants';
import { generateReviewToken } from '../reviews/review-token.util';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Credit ledger (BE-030): debtors list from v_credit_balances + record-payment. */
@Injectable()
export class CreditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly auditService: AuditService,
    private readonly activity: ActivityService,
  ) {}

  /** Outstanding view (UPD-BE-093) — `sort=overdue` is a thin sort param on this same real query, no new model. Two literal tagged-template queries (never string-built SQL) since ORDER BY can't be parameterized. */
  async listDebtors(sort: 'balance' | 'overdue' = 'balance') {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const rows =
      sort === 'overdue'
        ? await this.tenantPrisma.client.$queryRaw<DebtorRow[]>`
            SELECT v.customer_id, c.name, c.phone, v.balance, v.last_entry_at, v.days_outstanding, c.opted_out
            FROM v_credit_balances v
            JOIN customers c ON c.id = v.customer_id
            WHERE v.business_id = ${businessId} AND v.balance > 0
            ORDER BY v.days_outstanding DESC
          `
        : await this.tenantPrisma.client.$queryRaw<DebtorRow[]>`
            SELECT v.customer_id, c.name, c.phone, v.balance, v.last_entry_at, v.days_outstanding, c.opted_out
            FROM v_credit_balances v
            JOIN customers c ON c.id = v.customer_id
            WHERE v.business_id = ${businessId} AND v.balance > 0
            ORDER BY v.balance DESC
          `;

    return rows.map((row) => ({
      customerId: row.customer_id,
      name: row.name,
      phone: row.phone,
      balance: Number(row.balance),
      lastEntryAt: row.last_entry_at,
      daysOutstanding: row.days_outstanding,
      optedOutOfReminders: Boolean(row.opted_out),
    }));
  }

  /** Same rows the PDF statement (BE-032) renders, as JSON — powers the credit screen's inline statement preview. */
  async getLedger(customerId: string) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const entries = await this.tenantPrisma.client.creditEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
    });

    const rows = buildLedgerRows(entries);

    return {
      customerId,
      name: customer.name,
      phone: customer.phone,
      balance: rows.length ? rows[rows.length - 1].runningBalance : 0,
      entries: rows,
    };
  }

  /** Due Today screen's "collected-today" card (UPD-FE-076) — real payments received today, from any source (direct record-payment or a paid instalment, both write `CreditEntry.kind = 'payment'`). */
  async collectedToday(): Promise<number> {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await this.tenantPrisma.client.creditEntry.aggregate({
      where: { businessId, kind: 'payment', createdAt: { gte: todayStart } },
      _sum: { amount: true },
    });
    return round2(Number(result._sum.amount ?? 0));
  }

  async getBalance(customerId: string): Promise<number> {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const rows = await this.tenantPrisma.client.$queryRaw<
      { balance: string }[]
    >`
      SELECT balance FROM v_credit_balances WHERE business_id = ${businessId} AND customer_id = ${customerId}
    `;
    return rows[0] ? Number(rows[0].balance) : 0;
  }

  async recordPayment(dto: RecordPaymentDto) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const before = await this.getBalance(dto.customerId);

    const businessId = customer.businessId;
    const entry = await this.tenantPrisma.client.creditEntry.create({
      data: {
        businessId,
        customerId: dto.customerId,
        kind: 'payment',
        amount: dto.amount,
        method: dto.method,
        note: dto.note,
      },
    });

    const after = await this.getBalance(dto.customerId);

    await this.auditService.log({
      entity: 'CreditEntry',
      entityId: entry.id,
      action: 'credit.payment',
      before: { balance: before },
      after: { balance: after, entry },
    });

    await this.activity.record(businessId, {
      type: 'payment',
      description: `Credit payment from ${customer.name} — ${dto.amount}`,
      amount: dto.amount,
      entityType: 'CreditEntry',
      entityId: entry.id,
    });

    return { entry, balanceBefore: before, balanceAfter: after };
  }

  /**
   * Instalment plans (UPD-BE-021). Deliberately writes NO `CreditEntry` here — a plan only
   * schedules how an existing balance gets paid down; each line becomes a real ledger entry only
   * once `InstallmentsService.pay()` actually marks it paid. `totalAmount` must equal the sum of
   * the line amounts, which catches data-entry mistakes without needing to also cross-check the
   * live balance (a plan may legitimately be created ahead of the debt it covers).
   */
  async createInstallmentPlan(
    customerId: string,
    dto: CreateInstallmentPlanDto,
  ) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const sum = round2(dto.installments.reduce((s, i) => s + i.amount, 0));
    if (sum !== round2(dto.totalAmount)) {
      throw new AppException(
        CREDIT_ERROR_CODES.PLAN_AMOUNT_MISMATCH,
        `Instalment amounts sum to ${sum}, which doesn't match totalAmount ${dto.totalAmount}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.installmentPlan.create({
      data: {
        businessId: customer.businessId,
        customerId,
        totalAmount: dto.totalAmount,
        note: dto.note,
        installments: {
          create: dto.installments.map((line, i) => ({
            businessId: customer.businessId,
            seq: i + 1,
            amount: line.amount,
            dueDate: new Date(line.dueDate),
          })),
        },
      },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
  }

  listInstallmentPlans(customerId: string) {
    return this.tenantPrisma.client.installmentPlan.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
  }

  /**
   * Write-off (UPD-BE-023) — owner-only (enforced at the controller), irreversible, capped at the
   * customer's current real balance, and gated behind a typed confirmation phrase. Reuses the
   * exact same before/after-balance + audit-log + activity-record shape as `recordPayment`, just
   * with `kind: 'write_off'` so it's never confused with a real payment received.
   */
  async writeOff(customerId: string, dto: WriteOffCreditDto) {
    if (dto.confirm !== WRITE_OFF_CONFIRM_PHRASE) {
      throw new AppException(
        CREDIT_ERROR_CODES.WRITE_OFF_CONFIRMATION_MISMATCH,
        `Type "${WRITE_OFF_CONFIRM_PHRASE}" exactly to confirm this irreversible action`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const before = await this.getBalance(customerId);
    if (dto.amount > before) {
      throw new AppException(
        CREDIT_ERROR_CODES.WRITE_OFF_EXCEEDS_BALANCE,
        `Cannot write off ${dto.amount} — outstanding balance is only ${before}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const businessId = customer.businessId;
    const entry = await this.tenantPrisma.client.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'write_off',
        amount: dto.amount,
        note: dto.reason,
      },
    });

    const after = await this.getBalance(customerId);

    await this.auditService.log({
      entity: 'CreditEntry',
      entityId: entry.id,
      action: 'credit.write_off',
      before: { balance: before },
      after: { balance: after, entry, reason: dto.reason },
    });

    await this.activity.record(businessId, {
      type: 'payment',
      description: `Wrote off ${dto.amount} for ${customer.name}: ${dto.reason}`,
      amount: dto.amount,
      entityType: 'CreditEntry',
      entityId: entry.id,
    });

    return { entry, balanceBefore: before, balanceAfter: after };
  }

  /** Transparent ledger links (UPD-BE-022) — reuses one active link per customer rather than minting a new one on every call. */
  async createShareLink(customerId: string) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const existing = await this.tenantPrisma.client.creditShareLink.findFirst({
      where: { customerId, revoked: false },
    });
    if (existing) {
      return existing;
    }

    return this.tenantPrisma.client.creditShareLink.create({
      data: {
        businessId: customer.businessId,
        customerId,
        token: generateReviewToken(),
      },
    });
  }

  listShareLinks(customerId: string) {
    return this.tenantPrisma.client.creditShareLink.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeShareLink(id: string) {
    const link = await this.tenantPrisma.client.creditShareLink.findUnique({
      where: { id },
    });
    if (!link) {
      throw new NotFoundException('Share link not found');
    }
    return this.tenantPrisma.client.creditShareLink.update({
      where: { id },
      data: { revoked: true },
    });
  }

  /**
   * Overdue ageing (UPD-BE-094) — buckets every real debtor by `days_outstanding`. "At-risk"
   * (a real, computed signal, not a fabricated score) is 90+ days overdue AND no active
   * `InstallmentPlan` — i.e. overdue with no repayment plan in place.
   */
  async overdueAgeing() {
    const debtors = await this.listDebtors('overdue');
    const buckets = OVERDUE_BUCKETS.map((bucket) => ({
      key: bucket.key,
      count: 0,
      total: 0,
    }));

    for (const debtor of debtors) {
      const bucket = OVERDUE_BUCKETS.find(
        (b) =>
          debtor.daysOutstanding >= b.min && debtor.daysOutstanding <= b.max,
      );
      const target = buckets.find((b) => b.key === bucket?.key);
      if (target) {
        target.count += 1;
        target.total = round2(target.total + debtor.balance);
      }
    }

    const ninetyPlusDebtors = debtors.filter((d) => d.daysOutstanding >= 90);
    const atRiskDebtors = await Promise.all(
      ninetyPlusDebtors.map(async (d) => {
        const activePlan =
          await this.tenantPrisma.client.installmentPlan.findFirst({
            where: { customerId: d.customerId, status: 'active' },
          });
        return activePlan ? null : d;
      }),
    );
    const atRisk = atRiskDebtors.filter(
      (d): d is (typeof debtors)[number] => d !== null,
    );

    return {
      buckets,
      atRisk: {
        count: atRisk.length,
        total: round2(atRisk.reduce((sum, d) => sum + d.balance, 0)),
        debtors: atRisk,
      },
    };
  }

  /**
   * Recovery Reports (UPD-BE-096) — real `CreditEntry` aggregates over the trailing `months`, plus
   * `netExposure`, a current snapshot (not period-scoped) of every real outstanding balance.
   */
  async recoveryReport(months = 6) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.tenantPrisma.client.$queryRaw<
      { month: string; kind: string; total: string }[]
    >`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, kind, SUM(amount) AS total
      FROM credit_entries
      WHERE business_id = ${businessId} AND created_at >= ${since}
      GROUP BY month, kind
      ORDER BY month
    `;

    const months_ = new Map<
      string,
      { extended: number; recovered: number; writtenOff: number }
    >();
    for (const row of rows) {
      const entry = months_.get(row.month) ?? {
        extended: 0,
        recovered: 0,
        writtenOff: 0,
      };
      const amount = round2(Number(row.total));
      if (row.kind === 'credit') entry.extended = amount;
      else if (row.kind === 'payment') entry.recovered = amount;
      else if (row.kind === 'write_off') entry.writtenOff = amount;
      months_.set(row.month, entry);
    }

    const trend = Array.from(months_.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month,
        ...values,
        recoveryRate:
          values.extended > 0
            ? round2((values.recovered / values.extended) * 100)
            : 0,
      }));

    const extended = round2(trend.reduce((sum, r) => sum + r.extended, 0));
    const recovered = round2(trend.reduce((sum, r) => sum + r.recovered, 0));
    const writtenOff = round2(trend.reduce((sum, r) => sum + r.writtenOff, 0));

    const [{ total: netExposureRaw } = { total: null }] = await this
      .tenantPrisma.client.$queryRaw<{ total: string | null }[]>`
        SELECT SUM(balance) AS total FROM v_credit_balances
        WHERE business_id = ${businessId} AND balance > 0
      `;

    return {
      months,
      extended,
      recovered,
      recoveryRate: extended > 0 ? round2((recovered / extended) * 100) : 0,
      writtenOff,
      netExposure: netExposureRaw ? round2(Number(netExposureRaw)) : 0,
      trend,
    };
  }
}
