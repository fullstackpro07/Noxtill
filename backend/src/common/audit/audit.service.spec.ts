import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../tenancy/tenant.constants';
import { AuditService } from './audit.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AuditService.list() — Activity Log (UPD-BE-079)', () => {
  let prisma: PrismaService;
  let service: AuditService;
  let businessId: string;
  let cls: FakeClsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AuditService(tenantPrisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: {
        name: 'Audit Log Test Biz',
        slug: `audit-log-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'user-1');

    await service.log({
      entity: 'Order',
      entityId: 'order-1',
      action: 'create',
      after: { total: 10 },
    });
    await service.log({
      entity: 'Order',
      entityId: 'order-1',
      action: 'update',
      before: { total: 10 },
      after: { total: 15 },
    });
    await service.log({
      entity: 'Customer',
      entityId: 'customer-1',
      action: 'create',
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('log() writes a real row scoped to the CLS-bound business and actor', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { businessId, entity: 'Customer' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe('user-1');
  });

  it('list() returns real rows for this business, most recent first', async () => {
    const result = await service.list(businessId);
    expect(result.total).toBe(3);
    expect(result.rows[0].action).toBe('create');
    expect(result.rows[0].entity).toBe('Customer');
  });

  it('list() filters by entity and entityId', async () => {
    const result = await service.list(businessId, {
      entity: 'Order',
      entityId: 'order-1',
    });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.entity === 'Order')).toBe(true);
  });

  it('list() filters by action', async () => {
    const result = await service.list(businessId, { action: 'update' });
    expect(result.total).toBe(1);
    expect(result.rows[0].entityId).toBe('order-1');
  });

  it('list() paginates real results', async () => {
    const page1 = await service.list(businessId, { pageSize: 2, page: 1 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = await service.list(businessId, { pageSize: 2, page: 2 });
    expect(page2.rows).toHaveLength(1);
  });

  it('a missing CLS business id short-circuits log() without throwing (never breaks the real mutation it is attached to)', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, undefined);
    await expect(
      service.log({ entity: 'Order', entityId: 'order-2', action: 'create' }),
    ).resolves.toBeUndefined();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });
});
