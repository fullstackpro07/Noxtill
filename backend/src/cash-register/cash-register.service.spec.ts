import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { CashRegisterService } from './cash-register.service';
import { VARIANCE_NOTE_THRESHOLD } from './cash-register.constants';
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

describe('CashRegisterService (UPD-BE-006/UPD-BE-007)', () => {
  let prisma: PrismaService;
  let service: CashRegisterService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CashRegisterService(
      tenantPrisma,
      cls as unknown as ClsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Cash Register Test Biz',
        slug: `cash-register-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'test-user-id');
  });

  afterEach(async () => {
    await prisma.cashMovement.deleteMany({ where: { businessId } });
    await prisma.cashShift.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('opens a real shift with an opening-float movement', async () => {
    const shift = await service.openShift(businessId, { openingFloat: 100 });
    expect(shift.status).toBe('open');
    expect(shift.movements).toHaveLength(1);
    expect(shift.movements[0].type).toBe('opening');
    expect(Number(shift.movements[0].amount)).toBe(100);
  });

  it('rejects opening a second shift while one is already open', async () => {
    await service.openShift(businessId, { openingFloat: 100 });
    await expect(
      service.openShift(businessId, { openingFloat: 50 }),
    ).rejects.toThrow();
  });

  it('rejects recording a movement or closing when no shift is open', async () => {
    await expect(
      service.recordMovement(businessId, { type: 'cash_in', amount: 10 }),
    ).rejects.toThrow();
    await expect(service.closeShift(businessId)).rejects.toThrow();
  });

  it('computes expected cash correctly from real movements (opening + in - out)', async () => {
    await service.openShift(businessId, { openingFloat: 100 });
    await service.recordMovement(businessId, { type: 'cash_in', amount: 20 });
    await service.recordMovement(businessId, { type: 'cash_out', amount: 15 });

    const shift = await service.getCurrentShift(businessId);
    const expected = await service.expectedCash(businessId, shift!.id);
    expect(expected).toBe(105); // 100 + 20 - 15
  });

  it('records a real sale movement via recordSaleMovement, and skips silently with no open shift', async () => {
    await service.recordSaleMovement(businessId, 30, 'order-without-shift');
    const noneMovements = await prisma.cashMovement.findMany({
      where: { businessId },
    });
    expect(noneMovements).toHaveLength(0);

    const shift = await service.openShift(businessId, { openingFloat: 0 });
    await service.recordSaleMovement(businessId, 30, 'order-with-shift');
    const movements = await prisma.cashMovement.findMany({
      where: { businessId, shiftId: shift.id, type: 'sale' },
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].amount)).toBe(30);
  });

  it('closeShift() bare-closes without recording any variance', async () => {
    await service.openShift(businessId, { openingFloat: 50 });
    const closed = await service.closeShift(businessId);
    expect(closed.status).toBe('closed');
    expect(closed.variance).toBeNull();
    expect(closed.countedCash).toBeNull();
  });

  describe('reconcile()', () => {
    it('closes cleanly with a small variance and no note required', async () => {
      await service.openShift(businessId, { openingFloat: 100 });
      const result = await service.reconcile(businessId, { countedCash: 105 });
      expect(result.status).toBe('closed');
      expect(Number(result.variance)).toBe(5);
      expect(result.varianceNote).toBeNull();
    });

    it('requires a note once the variance exceeds the threshold', async () => {
      await service.openShift(businessId, { openingFloat: 100 });
      const bigVariance = 100 + VARIANCE_NOTE_THRESHOLD + 5;

      await expect(
        service.reconcile(businessId, { countedCash: bigVariance }),
      ).rejects.toThrow();

      // The shift must still be open — a rejected reconciliation must not partially close it.
      const stillOpen = await service.getCurrentShift(businessId);
      expect(stillOpen).not.toBeNull();

      const result = await service.reconcile(businessId, {
        countedCash: bigVariance,
        note: 'Till was short — cashier miscounted change twice.',
      });
      expect(result.status).toBe('closed');
      expect(result.varianceNote).toContain('miscounted');
    });
  });

  describe('staff-safe views (UPD-FE-006e/007e)', () => {
    it('getCurrentShift() strips variance fields entirely for staff, not just nulls them', async () => {
      await service.openShift(businessId, { openingFloat: 100 });
      const staffView = await service.getCurrentShift(businessId, Role.staff);
      expect(staffView).not.toHaveProperty('variance');
      expect(staffView).not.toHaveProperty('countedCash');
      expect(staffView).not.toHaveProperty('varianceNote');

      const ownerView = await service.getCurrentShift(businessId, Role.owner);
      expect(ownerView).toHaveProperty('variance');
    });

    it('listShifts() strips real variance data for staff but not for owner/manager', async () => {
      await service.openShift(businessId, { openingFloat: 100 });
      await service.reconcile(businessId, {
        countedCash: 130,
        note: 'Real till count for this test.',
      });

      const staffHistory = await service.listShifts(businessId, Role.staff);
      expect(staffHistory.length).toBeGreaterThan(0);
      expect(staffHistory[0]).not.toHaveProperty('variance');
      expect(staffHistory[0]).not.toHaveProperty('varianceNote');

      const ownerHistory = (await service.listShifts(
        businessId,
        Role.owner,
      )) as unknown as {
        variance: unknown;
        varianceNote: string | null;
      }[];
      expect(ownerHistory.length).toBeGreaterThan(0);
      expect(Number(ownerHistory[0].variance)).toBe(30);
      expect(ownerHistory[0].varianceNote).toContain('Real till count');
    });
  });
});
