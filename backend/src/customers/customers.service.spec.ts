import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CustomersService } from './customers.service';
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

describe('CustomersService (BE-040)', () => {
  let prisma: PrismaService;
  let customersService: CustomersService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const auditService = new AuditService(
      tenantPrisma,
      cls as unknown as ClsService,
    );
    customersService = new CustomersService(tenantPrisma, auditService);

    const business = await prisma.business.create({
      data: {
        name: 'Customers Test Biz',
        slug: `customers-test-${Date.now()}`,
        country: 'US',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a customer with the phone normalized to E.164', async () => {
    const customer = await customersService.create(businessId, {
      phone: '(415) 555-0132',
      name: 'Alex',
    });
    expect(customer.phone).toBe('+14155550132');
  });

  it('rejects an unparseable phone number', async () => {
    await expect(
      customersService.create(businessId, {
        phone: 'not-a-phone',
        name: 'Bad',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('finds customers by fuzzy name/phone search', async () => {
    const results = await customersService.findAll({ q: 'Alex' });
    expect(results.some((c) => c.name === 'Alex')).toBe(true);
  });

  it('erases a customer only when the confirm phone matches, wiping PII but keeping the row', async () => {
    const customer = await customersService.create(businessId, {
      phone: '+14155550199',
      name: 'To Erase',
      email: 'erase@example.com',
    });

    await expect(
      customersService.erase(customer.id, '+10000000000'),
    ).rejects.toBeInstanceOf(AppException);

    const erased = await customersService.erase(customer.id, '+14155550199');
    expect(erased.name).toBe('Erased Customer');
    expect(erased.email).toBeNull();
    expect(erased.phone).not.toBe('+14155550199');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: customer.id, action: 'customer.erase' },
    });
    expect(audits).toHaveLength(1);
  });
});
