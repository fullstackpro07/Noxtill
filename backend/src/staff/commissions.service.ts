import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppointmentStatus, OrderStatus } from '../../generated/prisma';

interface PercentRule {
  type: 'percent';
  value: number;
}

interface PerServiceRule {
  type: 'per_service';
  amounts: Record<string, number>;
}

type CommissionRule = PercentRule | PerServiceRule | Record<string, never>;

function isPercentRule(rule: unknown): rule is PercentRule {
  return (
    !!rule &&
    typeof rule === 'object' &&
    (rule as PercentRule).type === 'percent'
  );
}

function isPerServiceRule(rule: unknown): rule is PerServiceRule {
  return (
    !!rule &&
    typeof rule === 'object' &&
    (rule as PerServiceRule).type === 'per_service'
  );
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

/**
 * Per-staff commission report (BE-058): sales × rule for the requested
 * month. Supports two rule shapes on `BusinessUser.commissionRule` — a flat
 * `percent` of their attributed sales total, or a `per_service` flat amount
 * per completed appointment of that service. A staff member with no rule
 * (or an unrecognized shape) simply reports zero commission.
 */
@Injectable()
export class CommissionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async report(month: string) {
    const { start, end } = monthBounds(month);

    const staff = await this.tenantPrisma.client.businessUser.findMany({
      where: { role: { in: ['manager', 'staff'] } },
      include: { user: true },
    });

    return Promise.all(
      staff.map(async (member) => {
        const rule = member.commissionRule as CommissionRule;

        const salesTotal = await this.tenantPrisma.client.order.aggregate({
          where: {
            staffUserId: member.id,
            status: OrderStatus.completed,
            isQuotation: false,
            createdAt: { gte: start, lt: end },
          },
          _sum: { total: true },
        });
        const totalSales = Number(salesTotal._sum.total ?? 0);

        let commission = 0;
        if (isPercentRule(rule)) {
          commission = round2(totalSales * (rule.value / 100));
        } else if (isPerServiceRule(rule)) {
          const appointments =
            await this.tenantPrisma.client.appointment.findMany({
              where: {
                staffUserId: member.id,
                status: AppointmentStatus.completed,
                startsAt: { gte: start, lt: end },
              },
              select: { serviceId: true },
            });
          commission = round2(
            appointments.reduce(
              (sum, appt) => sum + (rule.amounts[appt.serviceId] ?? 0),
              0,
            ),
          );
        }

        return {
          businessUserId: member.id,
          name: member.user.name,
          role: member.role,
          totalSales,
          commission,
        };
      }),
    );
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
