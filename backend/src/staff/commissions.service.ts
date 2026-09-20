import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppointmentStatus, OrderStatus, StaffAdvanceStatus } from '@prisma/client';

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
/** Cosmetic-only label surfaced to the UI (UPD-BE-STAFF-04) — the real gate is `commissionRule` itself. */
function ruleLabel(rule: CommissionRule): string {
  if (isPercentRule(rule)) return `${rule.value}% of sales`;
  if (isPerServiceRule(rule)) return 'Per service';
  return 'No rule set';
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async report(month: string) {
    const { start, end } = monthBounds(month);

    const staff = await this.tenantPrisma.client.businessUser.findMany({
      where: { role: { in: ['manager', 'staff'] } },
      include: { user: true },
    });

    const payments = await this.tenantPrisma.client.commissionPayment.findMany(
      { where: { month } },
    );
    const paidStaffIds = new Set(payments.map((p) => p.staffUserId));

    return Promise.all(
      staff.map(async (member) => {
        const rule = member.commissionRule as CommissionRule;

        const [salesTotal, outstandingAdvances] = await Promise.all([
          this.tenantPrisma.client.order.aggregate({
            where: {
              staffUserId: member.id,
              status: OrderStatus.completed,
              isQuotation: false,
              createdAt: { gte: start, lt: end },
            },
            _sum: { total: true },
          }),
          this.tenantPrisma.client.staffAdvance.aggregate({
            where: {
              staffUserId: member.id,
              status: StaffAdvanceStatus.outstanding,
            },
            _sum: { amount: true },
          }),
        ]);
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
          ruleLabel: ruleLabel(rule),
          advancesOutstanding: Number(outstandingAdvances._sum.amount ?? 0),
          paid: paidStaffIds.has(member.id),
        };
      }),
    );
  }

  /**
   * Real, standalone "Mark Paid" (UPD-BE-STAFF-04) — deliberately does not touch `StaffAdvance`;
   * see `CommissionPayment`'s own doc comment for why. Idempotent: marking an already-paid month
   * paid again just refreshes `paidAt`/`paidByUserId`.
   */
  async markPaid(
    businessId: string,
    staffUserId: string,
    month: string,
    paidByUserId?: string,
  ) {
    const saved = await this.tenantPrisma.client.commissionPayment.upsert({
      where: {
        businessId_staffUserId_month: { businessId, staffUserId, month },
      },
      create: { businessId, staffUserId, month, paidByUserId },
      update: { paidByUserId, paidAt: new Date() },
    });

    await this.audit.log({
      entity: 'commission_payment',
      entityId: saved.id,
      action: 'commission.mark_paid',
      after: { staffUserId, month },
    });

    return saved;
  }

  /**
   * Real in-app notification (UPD-BE-STAFF-04) — reuses `NotificationsService`, the same
   * mechanism `ShiftsService.notify` already sends real schedule notifications through. The
   * figures in the message are this exact month's real `report()` numbers, not a template.
   */
  async sendStatement(businessId: string, staffUserId: string, month: string) {
    const member = await this.tenantPrisma.client.businessUser.findUnique({
      where: { id: staffUserId },
      include: { user: true },
    });
    if (!member) {
      throw new NotFoundException('Staff member not found');
    }

    const report = await this.report(month);
    const row = report.find((r) => r.businessUserId === staffUserId);
    const commission = row?.commission ?? 0;

    return this.notifications.create(businessId, member.userId, {
      title: `Commission statement — ${month}`,
      body: `Your commission for ${month} is Rs. ${commission.toLocaleString('en-US')}, based on Rs. ${(row?.totalSales ?? 0).toLocaleString('en-US')} in attributed sales.`,
      link: '/staff/commissions',
    });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
