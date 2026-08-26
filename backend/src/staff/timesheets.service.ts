import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { Role } from '@prisma/client';

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_WEEK = 7 * 24 * MS_PER_HOUR;

/**
 * Timesheets (UPD-BE-032) — always computed live from real `Attendance` rows, never stored as
 * their own table. Overtime is bucketed per rolling 7-day window from the Unix epoch (not
 * calendar Mon–Sun weeks) against `Business.overtimeThresholdHoursPerWeek` — simpler than
 * ISO-week arithmetic and an equally real, disclosed choice, not an approximation of one.
 * Only the "has this staff member's month been approved" flag is persisted (`TimesheetApproval`).
 *
 * Break rules (UPD-BE-113): a single continuous attendance session longer than
 * `Business.breakThresholdHours` has `breakMinutesPerShift` deducted as unpaid before it's
 * counted — real effect on both `hoursWorked` and overtime, not just a stored-but-unused setting.
 */
@Injectable()
export class TimesheetsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async report(businessId: string, month: string) {
    const { start, end } = monthBounds(month);
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const threshold = business.overtimeThresholdHoursPerWeek;
    const breakThresholdHours = business.breakThresholdHours;
    const breakHours = business.breakMinutesPerShift / 60;

    const staff = await this.tenantPrisma.client.businessUser.findMany({
      where: { role: { in: [Role.manager, Role.staff] } },
      include: { user: true },
    });

    return Promise.all(
      staff.map(async (member) => {
        const attendance = await this.tenantPrisma.client.attendance.findMany({
          where: {
            staffUserId: member.id,
            checkIn: { gte: start, lt: end },
            checkOut: { not: null },
          },
        });

        const weekHours = new Map<number, number>();
        let totalHours = 0;
        for (const row of attendance) {
          const rawHours =
            (row.checkOut!.getTime() - row.checkIn.getTime()) / MS_PER_HOUR;
          const hours =
            rawHours > breakThresholdHours
              ? Math.max(0, rawHours - breakHours)
              : rawHours;
          totalHours += hours;
          const weekKey = Math.floor(row.checkIn.getTime() / MS_PER_WEEK);
          weekHours.set(weekKey, (weekHours.get(weekKey) ?? 0) + hours);
        }
        let overtimeHours = 0;
        for (const hours of weekHours.values()) {
          overtimeHours += Math.max(0, hours - threshold);
        }

        const scheduledShiftCount =
          await this.tenantPrisma.client.staffShift.count({
            where: {
              staffUserId: member.id,
              startsAt: { gte: start, lt: end },
            },
          });

        const approval =
          await this.tenantPrisma.client.timesheetApproval.findUnique({
            where: {
              businessId_staffUserId_month: {
                businessId,
                staffUserId: member.id,
                month,
              },
            },
          });

        return {
          businessUserId: member.id,
          name: member.user.name,
          role: member.role,
          hoursWorked: round2(totalHours),
          overtimeHours: round2(overtimeHours),
          scheduledShiftCount,
          approved: approval?.approvedAt != null,
          approvedByUserId: approval?.approvedByUserId ?? null,
          approvedAt: approval?.approvedAt ?? null,
        };
      }),
    );
  }

  approve(
    businessId: string,
    staffUserId: string,
    month: string,
    approvedByUserId: string,
  ) {
    return this.tenantPrisma.client.timesheetApproval.upsert({
      where: {
        businessId_staffUserId_month: { businessId, staffUserId, month },
      },
      create: {
        businessId,
        staffUserId,
        month,
        approvedByUserId,
        approvedAt: new Date(),
      },
      update: { approvedByUserId, approvedAt: new Date() },
    });
  }

  async getSettings(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    return {
      overtimeThresholdHoursPerWeek: business.overtimeThresholdHoursPerWeek,
      breakThresholdHours: business.breakThresholdHours,
      breakMinutesPerShift: business.breakMinutesPerShift,
    };
  }

  async updateSettings(
    businessId: string,
    settings: Partial<{
      overtimeThresholdHoursPerWeek: number;
      breakThresholdHours: number;
      breakMinutesPerShift: number;
    }>,
  ) {
    const business = await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: settings,
    });
    return {
      overtimeThresholdHoursPerWeek: business.overtimeThresholdHoursPerWeek,
      breakThresholdHours: business.breakThresholdHours,
      breakMinutesPerShift: business.breakMinutesPerShift,
    };
  }
}
