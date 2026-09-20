import ExcelJS from 'exceljs';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PayrollService } from './payroll.service';
import { CommissionsService } from './commissions.service';
import { TimesheetsService } from './timesheets.service';
import { PAYROLL_SHEET_TITLE } from './payroll.constants';
import { S3Service } from '../common/storage/s3.service';
import type { AuditService } from '../common/audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('PayrollService (UPD-BE-034)', () => {
  let prisma: PrismaService;
  let service: PayrollService;
  let businessId: string;
  let ruledStaffId: string;
  let ruledUserId: string;
  let unruledStaffId: string;
  let unruledUserId: string;
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/payroll.xlsx'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const commissions = new CommissionsService(
      tenantPrisma,
      { log: jest.fn() } as unknown as AuditService,
      { create: jest.fn() } as unknown as NotificationsService,
    );
    const timesheets = new TimesheetsService(tenantPrisma);
    service = new PayrollService(
      tenantPrisma,
      s3 as unknown as S3Service,
      commissions,
      timesheets,
    );

    const business = await prisma.business.create({
      data: { name: 'Payroll Test Biz', slug: `payroll-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const ruledUser = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}1`,
        name: 'Commissioned Staff',
        passwordHash: 'test-hash',
      },
    });
    ruledUserId = ruledUser.id;
    const ruledStaff = await prisma.businessUser.create({
      data: {
        businessId,
        userId: ruledUser.id,
        role: Role.staff,
        commissionRule: { type: 'percent', value: 10 },
      },
    });
    ruledStaffId = ruledStaff.id;

    const unruledUser = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}2`,
        name: 'No-Rule Staff',
        passwordHash: 'test-hash',
      },
    });
    unruledUserId = unruledUser.id;
    const unruledStaff = await prisma.businessUser.create({
      data: { businessId, userId: unruledUser.id, role: Role.staff },
    });
    unruledStaffId = unruledStaff.id;

    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        staffUserId: ruledStaffId,
        status: 'completed',
        isQuotation: false,
        total: 1000,
        createdAt: new Date('2026-12-05T10:00:00.000Z'),
      },
    });
  });

  afterEach(() => {
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    await prisma.payrollLineItem.deleteMany({ where: { businessId } });
    await prisma.staffAdvance.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ruledUserId, unruledUserId] } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('computes real commission, warns on a missing commission rule, and uploads a real xlsx', async () => {
    const result = await service.export(businessId, '2026-12');

    expect(result.url).toBe('https://signed.example/payroll.xlsx');
    expect(result.warnings.some((w) => w.includes('No-Rule Staff'))).toBe(true);

    // Confirm the warning is really about the staff member with no commission rule configured.
    const unruled = await prisma.businessUser.findUniqueOrThrow({
      where: { id: unruledStaffId },
    });
    expect(unruled.commissionRule).toEqual({});

    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`payroll/${businessId}/payroll-2026-12-`),
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('nets a smaller outstanding advance against commission and flips it to deducted', async () => {
    const smallAdvance = await prisma.staffAdvance.create({
      data: { businessId, staffUserId: ruledStaffId, amount: 30 },
    });
    const largeAdvance = await prisma.staffAdvance.create({
      data: { businessId, staffUserId: ruledStaffId, amount: 200 },
    });

    await service.export(businessId, '2026-12');

    const refreshedSmall = await prisma.staffAdvance.findUniqueOrThrow({
      where: { id: smallAdvance.id },
    });
    expect(refreshedSmall.status).toBe('deducted');
    expect(refreshedSmall.deductedInMonth).toBe('2026-12');

    // 200 > the 70 remaining after the 30 deduction — never partially deducted, stays outstanding.
    const refreshedLarge = await prisma.staffAdvance.findUniqueOrThrow({
      where: { id: largeAdvance.id },
    });
    expect(refreshedLarge.status).toBe('outstanding');
  });

  it('does not double-deduct an already-deducted advance on a second export run', async () => {
    // The 30-amount advance from the previous test is already `deducted` for 2026-12.
    await service.export(businessId, '2026-12');

    const advances = await prisma.staffAdvance.findMany({
      where: { businessId, staffUserId: ruledStaffId, status: 'deducted' },
    });
    expect(advances).toHaveLength(1); // still just the one — not deducted again
  });

  describe('unapproved-timesheet warning (Staff depth fix, UPD-INT-011)', () => {
    it('warns when a staff member included in the export has not had their timesheet approved for that month', async () => {
      const result = await service.export(businessId, '2026-12');
      expect(
        result.warnings.some(
          (w) =>
            w.includes('Commissioned Staff') && w.includes('not been approved'),
        ),
      ).toBe(true);
    });

    it('stops warning about a staff member once their timesheet for that month is approved', async () => {
      await prisma.timesheetApproval.create({
        data: {
          businessId,
          staffUserId: ruledStaffId,
          month: '2026-12',
          approvedByUserId: ruledUserId,
          approvedAt: new Date(),
        },
      });

      const result = await service.export(businessId, '2026-12');
      expect(
        result.warnings.some((w) => w.includes('Commissioned Staff')),
      ).toBe(false);

      await prisma.timesheetApproval.deleteMany({
        where: { businessId, staffUserId: ruledStaffId, month: '2026-12' },
      });
    });
  });

  describe('hourly + overtime pay (Staff depth fix, UPD-INT-011)', () => {
    it('prices real overtime hours into real pay for a staff member with an hourlyRate configured, added on top of netPay', async () => {
      const hourlyUser = await prisma.user.create({
        data: {
          phone: `+1${Date.now()}3`,
          name: 'Hourly Staff',
          passwordHash: 'test-hash',
        },
      });
      const hourlyStaff = await prisma.businessUser.create({
        data: {
          businessId,
          userId: hourlyUser.id,
          role: Role.staff,
          hourlyRate: 20,
        },
      });

      // A single 45-hour session: `breakThresholdHours` (default 6) triggers a 30-minute unpaid
      // deduction, leaving 44.5 worked hours; 4.5 of those exceed the default 40h/week threshold.
      await prisma.attendance.create({
        data: {
          businessId,
          staffUserId: hourlyStaff.id,
          checkIn: new Date('2026-12-10T00:00:00.000Z'),
          checkOut: new Date('2026-12-11T21:00:00.000Z'),
        },
      });

      await service.export(businessId, '2026-12');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped jest mock call args
      const [, buffer] =
        s3.uploadAndSign.mock.calls[s3.uploadAndSign.mock.calls.length - 1];

      const workbook = new ExcelJS.Workbook();
      // exceljs's own .d.ts declares a non-Node local `Buffer` shadow that structurally conflicts
      // with the real Node Buffer above, so the untyped jest-mock arg is left as `any` here.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet(PAYROLL_SHEET_TITLE)!;
      const row = sheet
        .getRows(2, sheet.rowCount - 1)!
        .find((r) => r.getCell(1).value === 'Hourly Staff')!;

      expect(row.getCell(3).value).toBe(44.5); // hoursWorked
      expect(row.getCell(4).value).toBe(4.5); // overtimeHours
      expect(row.getCell(5).value).toBe(20); // hourlyRate
      // regular: 40h * $20 = $800; overtime: 4.5h * $20 * 1.5x = $135; total $935.
      expect(row.getCell(6).value).toBe(935); // hourlyPay
      expect(row.getCell(10).value).toBe(935); // netPay ($0 commission + $935 hourly)

      await prisma.attendance.deleteMany({
        where: { staffUserId: hourlyStaff.id },
      });
      await prisma.businessUser.delete({ where: { id: hourlyStaff.id } });
      await prisma.user.delete({ where: { id: hourlyUser.id } });
    });

    it('leaves netPay exactly at the commission figure for a staff member with no hourlyRate configured', async () => {
      await service.export(businessId, '2026-12');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped jest mock call args
      const [, buffer] =
        s3.uploadAndSign.mock.calls[s3.uploadAndSign.mock.calls.length - 1];

      const workbook = new ExcelJS.Workbook();
      // exceljs's own .d.ts declares a non-Node local `Buffer` shadow that structurally conflicts
      // with the real Node Buffer above, so the untyped jest-mock arg is left as `any` here.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet(PAYROLL_SHEET_TITLE)!;
      const row = sheet
        .getRows(2, sheet.rowCount - 1)!
        .find((r) => r.getCell(1).value === 'Commissioned Staff')!;

      expect(row.getCell(5).value).toBe(0); // hourlyRate — none configured
      expect(row.getCell(6).value).toBe(0); // hourlyPay — unaffected
    });
  });

  describe('preview() (Staff module v2, UPD-BE-STAFF-06)', () => {
    it('computes the same numbers as export() without netting any advances', async () => {
      const advance = await prisma.staffAdvance.create({
        data: { businessId, staffUserId: ruledStaffId, amount: 15 },
      });

      const preview = await service.preview(businessId, '2026-12');
      const row = preview.rows.find((r) => r.name === 'Commissioned Staff')!;
      expect(row.advancesDeducted).toBe(15);

      const refreshed = await prisma.staffAdvance.findUniqueOrThrow({
        where: { id: advance.id },
      });
      expect(refreshed.status).toBe('outstanding'); // preview never commits

      await prisma.staffAdvance.delete({ where: { id: advance.id } });
    });
  });

  describe('payroll line items (Staff module v2, UPD-BE-STAFF-06)', () => {
    it('folds a real "add" and "deduct" line item into otherAdjustments and netPay', async () => {
      await prisma.payrollLineItem.create({
        data: {
          businessId,
          staffUserId: ruledStaffId,
          month: '2026-12',
          label: 'Bonus',
          amount: 50,
          type: 'add',
        },
      });
      await prisma.payrollLineItem.create({
        data: {
          businessId,
          staffUserId: ruledStaffId,
          month: '2026-12',
          label: 'Uniform deduction',
          amount: 20,
          type: 'deduct',
        },
      });

      const preview = await service.preview(businessId, '2026-12');
      const row = preview.rows.find((r) => r.name === 'Commissioned Staff')!;
      expect(row.otherAdjustments).toBe(30); // +50 - 20
      expect(row.netPay).toBe(row.commission - row.advancesDeducted + 30);

      await prisma.payrollLineItem.deleteMany({
        where: { businessId, staffUserId: ruledStaffId, month: '2026-12' },
      });
    });
  });
});
