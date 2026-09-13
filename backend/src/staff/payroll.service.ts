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

/**
 * Payroll Export (UPD-BE-034) — the one real place a "payout" is materialized in this codebase
 * (`CommissionsService.report()` is a stateless read-only projection otherwise). Generating an
 * export nets each staff member's real outstanding `StaffAdvance` rows against their real
 * commission for the month and flips the applied ones to `deducted` — a real state change, not
 * reversible by re-exporting. Advances are deducted oldest-first, whole-record (never partially
 * deducting a single advance) — one that doesn't fully fit in the remaining commission stays
 * outstanding for a future payout.
 *
 * Staff depth fix (UPD-INT-011): an unapproved timesheet for the month is surfaced as a real
 * `warnings` entry (same mechanism already used for a missing commission rule) rather than
 * silently paying out — approval previously had no effect anywhere downstream of the timesheet
 * screen. This is a warning, not a hard block: the export still runs (an owner may need the
 * numbers before chasing down an approval), but the gap is no longer invisible.
 *
 * Staff depth fix (UPD-INT-011): overtime hours are real (`TimesheetsService.report()`) but were
 * never priced into pay anywhere — `hourlyPay` now turns a staff member's real `hourlyRate` (opt-in,
 * null for purely-commission staff — unaffected either way) and real overtime hours into an actual
 * dollar amount, added on top of `netPay`. Advances still net only against commission, unchanged —
 * hourly/overtime pay is a separate, additive component, never touched by advance netting.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly commissions: CommissionsService,
    private readonly timesheets: TimesheetsService,
  ) {}

  async export(
    businessId: string,
    month: string,
  ): Promise<{ url: string; warnings: string[] }> {
    const [commissionRows, timesheetRows, staffRules, business] =
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

    const warnings: string[] = [];
    const rows: Record<string, unknown>[] = [];

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

      rows.push({
        name: c.name,
        role: c.role,
        hoursWorked: timesheet?.hoursWorked ?? 0,
        overtimeHours: timesheet?.overtimeHours ?? 0,
        hourlyRate: hourlyRate ?? 0,
        hourlyPay,
        commission: c.commission,
        advancesDeducted: deducted,
        netPay: round2(commissionNetPay + hourlyPay),
      });
    }

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

    if (toMarkDeducted.length > 0) {
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
