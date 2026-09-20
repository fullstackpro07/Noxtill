import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { CommissionsService } from './commissions.service';
import { TimesheetsService } from './timesheets.service';
import { PAYROLL_COLUMNS, PAYROLL_SHEET_TITLE } from './payroll.constants';
import { Role, StaffAdvanceStatus } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasRecognizedCommissionRule(rule: unknown): boolean {
  if (!rule || typeof rule !== 'object') return false;
  const type = (rule as Record<string, unknown>).type;
  return type === 'percent' || type === 'per_service';
}

export interface PayrollRow {
  businessUserId: string;
  name: string;
  role: string;
  hoursWorked: number;
  overtimeHours: number;
  hourlyRate: number;
  hourlyPay: number;
  commission: number;
  advancesDeducted: number;
  otherAdjustments: number;
  netPay: number;
}

/**
 * Payroll Export (UPD-BE-034) — the one real place a "payout" is materialized in this codebase
 * (`CommissionsService.report()` is a stateless read-only projection otherwise). Generating an
 * export nets each staff member's real outstanding `StaffAdvance` rows against their real
 * commission for the month and flips the applied ones to `deducted` — a real state change, not
 * reversible by re-exporting. Advances are deducted oldest-first, whole-record (never partially
 * deducting a single advance) — one that doesn't fully fit in the remaining commission stays
 * outstanding for a future payout.
 *
 * Staff module v2 (UPD-BE-STAFF-06): `computeRows` is now shared between `preview()` (read-only,
 * for the screen's own KPI tiles/table before anyone commits to anything) and `export()` (which
 * additionally nets advances and generates/uploads the file) — same numbers either way, since
 * `commit=false` skips only the `staffAdvance.updateMany` write, not the math.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly commissions: CommissionsService,
    private readonly timesheets: TimesheetsService,
  ) {}

  /** Read-only preview — computes the exact same numbers as `export()` without netting advances
   * or generating a file. Safe to call on every page load. */
  async preview(
    businessId: string,
    month: string,
  ): Promise<{ rows: PayrollRow[]; warnings: string[] }> {
    return this.computeRows(businessId, month, false);
  }

  async export(
    businessId: string,
    month: string,
  ): Promise<{ url: string; warnings: string[] }> {
    const { rows, warnings } = await this.computeRows(businessId, month, true);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(PAYROLL_SHEET_TITLE);
    sheet.columns = PAYROLL_COLUMNS;
    sheet.addRows(rows);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const key = `payroll/${businessId}/payroll-${month}-${Date.now()}.xlsx`;
    const url = await this.s3.uploadAndSign(
      key,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    return { url, warnings };
  }

  private async computeRows(
    businessId: string,
    month: string,
    commit: boolean,
  ): Promise<{ rows: PayrollRow[]; warnings: string[] }> {
    const [commissionRows, timesheetRows, staffRules, business, lineItems] =
      await Promise.all([
        this.commissions.report(month),
        this.timesheets.report(businessId, month),
        this.tenantPrisma.client.businessUser.findMany({
          where: { role: { in: [Role.manager, Role.staff] } },
          select: { id: true, commissionRule: true, hourlyRate: true },
        }),
        this.tenantPrisma.client.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { overtimeRateMultiplier: true },
        }),
        this.tenantPrisma.client.payrollLineItem.findMany({
          where: { month },
        }),
      ]);
    const overtimeRateMultiplier = Number(business.overtimeRateMultiplier);
    const timesheetByStaffId = new Map(
      timesheetRows.map((t) => [t.businessUserId, t]),
    );
    const ruleByStaffId = new Map(
      staffRules.map((s) => [s.id, s.commissionRule]),
    );
    const hourlyRateByStaffId = new Map(
      staffRules.map((s) => [s.id, s.hourlyRate ? Number(s.hourlyRate) : null]),
    );
    const lineItemTotalByStaffId = new Map<string, number>();
    for (const item of lineItems) {
      const signed =
        item.type === 'deduct' ? -Number(item.amount) : Number(item.amount);
      lineItemTotalByStaffId.set(
        item.staffUserId,
        round2((lineItemTotalByStaffId.get(item.staffUserId) ?? 0) + signed),
      );
    }

    const warnings: string[] = [];
    const rows: PayrollRow[] = [];

    for (const c of commissionRows) {
      if (!hasRecognizedCommissionRule(ruleByStaffId.get(c.businessUserId))) {
        warnings.push(
          `${c.name} has no commission rule configured — commission calculated as $0`,
        );
      }

      const { deducted, netPay: commissionNetPay } = await this.netAdvances(
        c.businessUserId,
        c.commission,
        month,
        commit,
      );
      const timesheet = timesheetByStaffId.get(c.businessUserId);
      if (timesheet && !timesheet.approved) {
        warnings.push(
          `${c.name}'s timesheet for ${month} has not been approved yet`,
        );
      }

      const hourlyRate = hourlyRateByStaffId.get(c.businessUserId) ?? null;
      const hourlyPay = this.computeHourlyPay(
        timesheet?.hoursWorked ?? 0,
        timesheet?.overtimeHours ?? 0,
        hourlyRate,
        overtimeRateMultiplier,
      );
      const otherAdjustments = lineItemTotalByStaffId.get(c.businessUserId) ?? 0;

      rows.push({
        businessUserId: c.businessUserId,
        name: c.name,
        role: c.role,
        hoursWorked: timesheet?.hoursWorked ?? 0,
        overtimeHours: timesheet?.overtimeHours ?? 0,
        hourlyRate: hourlyRate ?? 0,
        hourlyPay,
        commission: c.commission,
        advancesDeducted: deducted,
        otherAdjustments,
        netPay: round2(commissionNetPay + hourlyPay + otherAdjustments),
      });
    }

    return { rows, warnings };
  }

  /**
   * Staff depth fix (UPD-INT-011): turns real hours-worked/overtime-hours into a real dollar
   * amount for a staff member who has an `hourlyRate` configured — `null` (purely-commission
   * staff, the default) always yields 0, leaving their `netPay` exactly as it was before this
   * field existed.
   */
  private computeHourlyPay(
    hoursWorked: number,
    overtimeHours: number,
    hourlyRate: number | null,
    overtimeRateMultiplier: number,
  ): number {
    if (!hourlyRate) return 0;
    const regularHours = Math.max(0, hoursWorked - overtimeHours);
    const regularPay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * overtimeRateMultiplier;
    return round2(regularPay + overtimePay);
  }

  private async netAdvances(
    staffUserId: string,
    commission: number,
    month: string,
    commit: boolean,
  ): Promise<{ deducted: number; netPay: number }> {
    const outstanding = await this.tenantPrisma.client.staffAdvance.findMany({
      where: { staffUserId, status: StaffAdvanceStatus.outstanding },
      orderBy: { createdAt: 'asc' },
    });

    let remaining = commission;
    let deducted = 0;
    const toMarkDeducted: string[] = [];
    for (const advance of outstanding) {
      const amount = Number(advance.amount);
      if (amount <= remaining) {
        remaining -= amount;
        deducted += amount;
        toMarkDeducted.push(advance.id);
      }
    }

    if (commit && toMarkDeducted.length > 0) {
      await this.tenantPrisma.client.staffAdvance.updateMany({
        where: { id: { in: toMarkDeducted } },
        data: { status: StaffAdvanceStatus.deducted, deductedInMonth: month },
      });
    }

    return {
      deducted: round2(deducted),
      netPay: round2(commission - deducted),
    };
  }
}
