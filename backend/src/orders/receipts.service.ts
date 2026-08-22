import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { ClsService } from 'nestjs-cls';
import { InvoiceService } from './invoice.service';
import { OrderStatus, ReceiptChannel, Role } from '@prisma/client';

export interface ReceiptFilters {
  q?: string;
  staffUserId?: string;
}

/**
 * Receipts, dedicated resend (UPD-BE-086). Reuses `InvoiceService.generate()` for the actual PDF
 * render/send (no second renderer) — this only adds a searchable list over past sales and a real
 * digital-vs-printed delivery log, which the pre-existing per-order invoice endpoint never tracked.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async list(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: ReceiptFilters,
  ) {
    const q = filters.q?.trim();
    const orderNoMatch = q && /^\d+$/.test(q) ? Number(q) : undefined;

    const orders = await this.tenantPrisma.client.order.findMany({
      where: {
        businessId,
        isQuotation: false,
        status: OrderStatus.completed,
        ...(role === Role.staff && callerBusinessUserId
          ? { staffUserId: callerBusinessUserId }
          : {}),
        ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
        ...(orderNoMatch !== undefined
          ? { orderNo: orderNoMatch }
          : q
            ? { customer: { phone: { contains: q } } }
            : {}),
      },
      include: {
        customer: true,
        receiptLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      createdAt: o.createdAt,
      total: Number(o.total),
      customerName: o.customer?.name ?? null,
      customerPhone: o.customer?.phone ?? null,
      lastSentAt: o.receiptLogs[0]?.createdAt ?? null,
      lastChannel: o.receiptLogs[0]?.channel ?? null,
    }));
  }

  /** Digital-vs-printed % card (UPD-FE-067) — real counts from the receipt log, last 30 days. */
  async stats(businessId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await this.tenantPrisma.client.receiptLog.findMany({
      where: { businessId, createdAt: { gte: since } },
      select: { channel: true },
    });
    const digitalCount = logs.filter((l) => l.channel === 'digital').length;
    const printedCount = logs.filter((l) => l.channel === 'print').length;
    const total = digitalCount + printedCount;
    return {
      digitalCount,
      printedCount,
      digitalPercent: total > 0 ? Math.round((digitalCount / total) * 100) : 0,
    };
  }

  async resend(
    businessId: string,
    orderId: string,
    channel: ReceiptChannel,
  ): Promise<{ url: string }> {
    const order = await this.tenantPrisma.client.order.findFirst({
      where: { id: orderId, businessId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const result = await this.invoiceService.generate(
      businessId,
      orderId,
      channel === 'digital',
    );

    const sentByUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    await this.tenantPrisma.client.receiptLog.create({
      data: { businessId, orderId, channel, sentByUserId },
    });

    return result;
  }
}
