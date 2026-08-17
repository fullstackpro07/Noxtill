import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VouchersService, VoucherTxClient } from './vouchers.service';
import { SendGateService } from '../messaging/send-gate.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VouchersService (UPD-BE-030)', () => {
  let prisma: PrismaService;
  let service: VouchersService;
  let businessId: string;
  let customerId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VouchersService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: { name: 'Vouchers Test Biz', slug: `vouchers-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Voucher Customer' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.voucher.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('issues a real voucher with an auto-generated code and full initial balance', async () => {
    const voucher = await service.issue(businessId, { value: 100 });
    expect(voucher.code).toBeTruthy();
    expect(Number(voucher.balance)).toBe(100);
    expect(voucher.status).toBe('active');
  });

  it('sends a real notification when issued to a known customer, rejects an unknown one', async () => {
    await service.issue(businessId, { value: 50, customerId });
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ customerId, templateKey: 'voucher_issued' }),
    );

    sendGate.send.mockClear();
    await expect(
      service.issue(businessId, {
        value: 50,
        customerId: 'not-a-real-customer-id',
      }),
    ).rejects.toThrow();
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('rejects a duplicate voucher code for the same business', async () => {
    const code = `GIFT-${Date.now()}`;
    await service.issue(businessId, { code, value: 20 });
    await expect(
      service.issue(businessId, { code, value: 20 }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('partially redeems across two sales and flips to redeemed only once the balance hits zero', async () => {
    const voucher = await service.issue(businessId, { value: 30 });

    const first = await service.validateAndApply(
      businessId,
      voucher.code,
      20,
      100,
      prisma,
    );
    expect(first.amountApplied).toBe(20);
    let refreshed = await prisma.voucher.findUniqueOrThrow({
      where: { id: voucher.id },
    });
    expect(Number(refreshed.balance)).toBe(10);
    expect(refreshed.status).toBe('active');

    const second = await service.validateAndApply(
      businessId,
      voucher.code,
      10,
      100,
      prisma,
    );
    expect(second.amountApplied).toBe(10);
    refreshed = await prisma.voucher.findUniqueOrThrow({
      where: { id: voucher.id },
    });
    expect(Number(refreshed.balance)).toBe(0);
    expect(refreshed.status).toBe('redeemed');
  });

  it('never applies more than the real remaining balance or the real order total', async () => {
    const voucher = await service.issue(businessId, { value: 15 });

    const result = await service.validateAndApply(
      businessId,
      voucher.code,
      1000, // requested far more than balance
      8, // but the order total is even lower
      prisma,
    );
    expect(result.amountApplied).toBe(8); // capped at order total, not balance
  });

  it('rejects an unknown code, a cancelled voucher, and an expired voucher', async () => {
    await expect(
      service.validateAndApply(
        businessId,
        'NOT-REAL',
        10,
        100,
        prisma as unknown as VoucherTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);

    const cancelled = await service.issue(businessId, { value: 10 });
    await service.cancel(cancelled.id);
    await expect(
      service.validateAndApply(
        businessId,
        cancelled.code,
        5,
        100,
        prisma as unknown as VoucherTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);

    const expired = await service.issue(businessId, {
      value: 10,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await expect(
      service.validateAndApply(
        businessId,
        expired.code,
        5,
        100,
        prisma as unknown as VoucherTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
