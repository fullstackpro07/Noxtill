import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  Prisma,
  Role,
} from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface SalesHistoryFilters {
  from?: Date;
  to?: Date;
  staffUserId?: string;
  paymentMethod?: PaymentMethod;
  orderType?: OrderType;
  minAmount?: number;
  maxAmount?: number;
}

/**
 * Sales History (UPD-BE-084) — the full searchable log of real completed/cancelled sales,
 * distinct from All Orders (which also shows drafts/pending/in-progress) and from Today's
 * Business (which is today-only). Staff see only their own sales, matching this app's standing
 * staff-scoping convention (Dashboard Overview, Today's Business).
 */
@Injectable()
export class SalesHistoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private buildWhere(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: SalesHistoryFilters,
  ): Prisma.OrderWhereInput {
    return {
      businessId,
      isQuotation: false,
      status: { in: [OrderStatus.completed, OrderStatus.cancelled] },
      ...(role === Role.staff && callerBusinessUserId
        ? { staffUserId: callerBusinessUserId }
        : {}),
      ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
      ...(filters.orderType ? { orderType: filters.orderType } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(filters.minAmount != null || filters.maxAmount != null
        ? {
            total: {
              ...(filters.minAmount != null ? { gte: filters.minAmount } : {}),
              ...(filters.maxAmount != null ? { lte: filters.maxAmount } : {}),
            },
          }
        : {}),
    };
  }

  async list(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: SalesHistoryFilters,
  ) {
    const where = this.buildWhere(
      businessId,
      role,
      callerBusinessUserId,
      filters,
    );
    const orders = await this.tenantPrisma.client.order.findMany({
      where,
      include: {
        items: true,
        payments: true,
        staffUser: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const filtered = filters.paymentMethod
      ? orders.filter((o) =>
          o.payments.some((p) => p.method === filters.paymentMethod),
        )
      : orders;

    return filtered.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      createdAt: o.createdAt,
      itemsCount: o.items.reduce((sum, i) => sum + i.qty, 0),
      staffName: o.staffUser?.user.name ?? null,
      method: o.payments[0]?.method ?? null,
      discount: Number(o.discount),
      total: Number(o.total),
      profit: round2(Number(o.total) - Number(o.cogs)),
      status: o.status,
    }));
  }

  async findOne(businessId: string, id: string) {
    const order = await this.tenantPrisma.client.order.findFirst({
      where: { id, businessId },
      include: {
        items: { include: { product: true } },
        payments: true,
        customer: true,
        staffUser: { include: { user: true } },
      },
    });
    return order;
  }

  /** Real daily revenue for the Sales History chart — same filter set as `list()`, grouped by day. */
  async dailyRevenue(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: SalesHistoryFilters,
  ) {
    const where = this.buildWhere(businessId, role, callerBusinessUserId, {
      ...filters,
      // The daily-revenue chart is a completed-sales-only figure — cancelled orders never counted as revenue.
    });
    const orders = await this.tenantPrisma.client.order.findMany({
      where: { ...where, status: OrderStatus.completed },
      select: { createdAt: true, total: true },
    });

    const byDay = new Map<string, number>();
    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      byDay.set(day, round2((byDay.get(day) ?? 0) + Number(order.total)));
    }
    return Array.from(byDay.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
