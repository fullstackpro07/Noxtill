import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PayrollService } from './payroll.service';
import { CommissionsService } from './commissions.service';
import { TimesheetsService } from './timesheets.service';
import { S3Service } from '../common/storage/s3.service';
import { Role } from '../../generated/prisma';

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
    const commissions = new CommissionsService(tenantPrisma);
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
    await prisma.staffAdvance.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ruledUserId, unruledUserId] } },
    });
    await prisma.business.delete({ where: { id: businessId } });
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
});
