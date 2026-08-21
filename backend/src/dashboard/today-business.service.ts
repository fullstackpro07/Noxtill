import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  Prisma,
  Role,
} from '@prisma/client';

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface TodayBusinessFilters {
  staffUserId?: string;
  paymentMethod?: PaymentMethod;
  orderType?: OrderType;
}

/**
 * Today's Business (UPD-BE-082) — a live, deeper-than-Overview operational picture of the
 * current day. Staff see only their own transactions (matching Dashboard Overview's existing
 * staff-scoping convention); Owner/Manager see everything.
 */
@Injectable()
export class TodayBusinessService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getDetail(
    businessId: string,
    role: Role,
    callerBusinessUserId: string | null,
    filters: TodayBusinessFilters,
  ) {
    const since = startOfToday();
    const staffScope =
      role === Role.staff && callerBusinessUserId
        ? { staffUserId: callerBusinessUserId }
        : {};

    const where: Prisma.OrderWhereInput = {
      businessId,
      isQuotation: false,
      createdAt: { gte: since },
      ...staffScope,
      ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
      ...(filters.orderType ? { orderType: filters.orderType } : {}),
    };

    const orders = await this.tenantPrisma.client.order.findMany({
      where,
      include: {
        items: true,
        payments: true,
        staffUser: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const filtered = filters.paymentMethod
      ? orders.filter((o) =>
          o.payments.some((p) => p.method === filters.paymentMethod),
        )
      : orders;

    const completed = filtered.filter(
      (o) => o.status === OrderStatus.completed,
    );
    const revenue = round2(
      completed.reduce((sum, o) => sum + Number(o.total), 0),
    );
    const salesCount = completed.length;
    const avgTicket = salesCount > 0 ? round2(revenue / salesCount) : 0;
    const uniqueCustomers = new Set(
      completed.map((o) => o.customerId).filter((id): id is string => !!id),
    );
    const openOrders = filtered.filter(
      (o) =>
        o.status !== OrderStatus.completed &&
        o.status !== OrderStatus.cancelled,
    ).length;

    const staffOnDuty = await this.tenantPrisma.client.attendance.count({
      where: { businessId, checkIn: { gte: since }, checkOut: null },
    });

    const hourlyRevenue = this.bucketByHour(completed);
    const paymentMethodSplit = this.splitByPaymentMethod(completed);

    return {
      cards: {
        salesCount,
        revenue,
        avgTicket,
        customersServed: uniqueCustomers.size,
        staffOnDuty,
        openOrders,
      },
      hourlyRevenue,
      paymentMethodSplit,
      transactions: filtered.map((o) => ({
        id: o.id,
        time: o.createdAt,
        items: o.items.map((i) => `${i.qty}x ${i.name}`).join(', '),
        staffName: o.staffUser?.user.name ?? null,
        method: o.payments[0]?.method ?? null,
        amount: Number(o.total),
        status: o.status,
      })),
    };
  }

  private bucketByHour(
    orders: { createdAt: Date; total: Prisma.Decimal }[],
  ): { hour: number; revenue: number }[] {
    const byHour = new Map<number, number>();
    for (const order of orders) {
      const hour = order.createdAt.getUTCHours();
      byHour.set(hour, (byHour.get(hour) ?? 0) + Number(order.total));
    }
    let running = 0;
    return Array.from({ length: 24 }, (_, hour) => {
      running += byHour.get(hour) ?? 0;
      return { hour, revenue: round2(running) };
    });
  }

  private splitByPaymentMethod(
    orders: { payments: { method: PaymentMethod; amount: Prisma.Decimal }[] }[],
  ): { method: PaymentMethod; amount: number; count: number }[] {
    const byMethod = new Map<
      PaymentMethod,
      { amount: number; count: number }
    >();
    for (const order of orders) {
      for (const payment of order.payments) {
        const entry = byMethod.get(payment.method) ?? { amount: 0, count: 0 };
        entry.amount += Number(payment.amount);
        entry.count += 1;
        byMethod.set(payment.method, entry);
      }
    }
    return Array.from(byMethod.entries()).map(([method, v]) => ({
      method,
      amount: round2(v.amount),
      count: v.count,
    }));
  }
}
