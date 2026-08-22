import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { OrderStatus, PaymentMethod, Role } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';

export interface InvoiceFilters {
  from?: Date;
  to?: Date;
  status?: InvoiceStatus;
  staffUserId?: string;
}

export interface InvoiceRow {
  id: string;
  orderNo: number;
  createdAt: Date;
  customerId: string | null;
  customerName: string | null;
  staffName: string | null;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
}

/**
 * Invoices, formalized (UPD-BE-085). Not a new source of truth — every figure is derived from the
 * real `Order`/`Payment` rows the sale itself already wrote (paid = amount collected via `Payment`
 * rows covers the total). "Overdue" is only ever true when a real linked credit `Installment` has
 * a real, passed due date and is still pending — an unpaid order with no installment plan stays
 * "unpaid" rather than guessing at an arbitrary day threshold with no data behind it.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly sendGate: SendGateService,
  ) {}

  private async overdueOrderIds(
    businessId: string,
    orderIds: string[],
  ): Promise<Set<string>> {
    if (orderIds.length === 0) return new Set();
    const entries = await this.tenantPrisma.client.creditEntry.findMany({
      where: {
        businessId,
        orderId: { in: orderIds },
        installment: { status: 'pending', dueDate: { lt: new Date() } },
      },
      select: { orderId: true },
    });
    return new Set(entries.map((e) => e.orderId as string));
  }

  private async rowsFor(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: InvoiceFilters,
  ): Promise<InvoiceRow[]> {
    const orders = await this.tenantPrisma.client.order.findMany({
      where: {
        businessId,
        isQuotation: false,
        status: OrderStatus.completed,
        ...(role === Role.staff && callerBusinessUserId
          ? { staffUserId: callerBusinessUserId }
          : {}),
        ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        payments: true,
        customer: true,
        staffUser: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const overdueIds = await this.overdueOrderIds(
      businessId,
      orders.map((o) => o.id),
    );

    return orders.map((o) => {
      const amountPaid = round2(
        o.payments.reduce((sum, p) => sum + Number(p.amount), 0),
      );
      const total = Number(o.total);
      const status: InvoiceStatus =
        amountPaid >= total
          ? 'paid'
          : overdueIds.has(o.id)
            ? 'overdue'
            : 'unpaid';
      return {
        id: o.id,
        orderNo: o.orderNo,
        createdAt: o.createdAt,
        customerId: o.customerId,
        customerName: o.customer?.name ?? null,
        staffName: o.staffUser?.user.name ?? null,
        total,
        amountPaid,
        amountDue: round2(Math.max(0, total - amountPaid)),
        status,
      };
    });
  }

  async list(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: InvoiceFilters,
  ): Promise<InvoiceRow[]> {
    const rows = await this.rowsFor(
      businessId,
      role,
      callerBusinessUserId,
      filters,
    );
    return filters.status
      ? rows.filter((r) => r.status === filters.status)
      : rows;
  }

  /** Cards + the paid-vs-unpaid trend chart (UPD-FE-066) — same derivation as `list()`, aggregated. */
  async summary(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: Pick<InvoiceFilters, 'from' | 'to' | 'staffUserId'>,
  ) {
    const rows = await this.rowsFor(businessId, role, callerBusinessUserId, {
      ...filters,
    });

    const counts: Record<InvoiceStatus, number> = {
      paid: 0,
      unpaid: 0,
      overdue: 0,
    };
    const totals: Record<InvoiceStatus, number> = {
      paid: 0,
      unpaid: 0,
      overdue: 0,
    };
    const byDay = new Map<
      string,
      { paidAmount: number; unpaidAmount: number }
    >();

    for (const row of rows) {
      counts[row.status] += 1;
      totals[row.status] = round2(totals[row.status] + row.amountDue);

      const day = row.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { paidAmount: 0, unpaidAmount: 0 };
      bucket.paidAmount = round2(bucket.paidAmount + row.amountPaid);
      bucket.unpaidAmount = round2(bucket.unpaidAmount + row.amountDue);
      byDay.set(day, bucket);
    }

    const trend = Array.from(byDay.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { counts, totals, trend };
  }

  /** UPD-FE-066's record-payment popup — a real `Payment` row against this specific order/invoice, the same figure `amountPaid` is derived from. */
  async recordPayment(
    businessId: string,
    orderId: string,
    dto: { method: PaymentMethod; amount: number; note?: string },
  ) {
    const order = await this.tenantPrisma.client.order.findFirst({
      where: { id: orderId, businessId },
    });
    if (!order) {
      throw new NotFoundException('Invoice (order) not found');
    }
    if (dto.amount <= 0) {
      throw new AppException(
        'INVALID_PAYMENT_AMOUNT',
        'Payment amount must be greater than zero',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.payment.create({
      data: {
        orderId,
        method: dto.method,
        amount: dto.amount,
      },
    });
  }

  /** UPD-FE-066's bulk-send-reminders — every unpaid/overdue invoice with a real, opted-in customer. */
  async remindAll(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
  ): Promise<{ sent: number; skipped: number }> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const rows = await this.rowsFor(businessId, role, callerBusinessUserId, {});
    const due = rows.filter(
      (r) => (r.status === 'unpaid' || r.status === 'overdue') && r.customerId,
    );

    let sent = 0;
    let skipped = 0;
    for (const row of due) {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { id: row.customerId! },
      });
      if (!customer || customer.optedOut) {
        skipped += 1;
        continue;
      }
      await this.sendGate
        .send({
          businessId,
          customerId: customer.id,
          templateKey: 'invoice_reminder',
          variables: {
            customerName: customer.name,
            orderNo: String(row.orderNo),
            amountDue: this.locale.formatCurrency(row.amountDue, business),
          },
        })
        .catch(() => undefined);
      sent += 1;
    }

    return { sent, skipped };
  }
}
