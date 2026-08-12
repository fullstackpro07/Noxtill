import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ActivityService } from '../activity/activity.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { DebtorRow, buildLedgerRows } from './credit.types';

/** Credit ledger (BE-030): debtors list from v_credit_balances + record-payment. */
@Injectable()
export class CreditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly auditService: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async listDebtors() {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const rows = await this.tenantPrisma.client.$queryRaw<DebtorRow[]>`
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
      optedOutOfReminders: row.opted_out,
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
}
