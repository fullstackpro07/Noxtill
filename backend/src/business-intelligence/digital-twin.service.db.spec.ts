import { ClsService } from 'nestjs-cls';
import { BiTwinAssumptionKey, BiTwinEntityType } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { DigitalTwinService } from './digital-twin.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown): void {
    this.store[key] = value;
  }
}

describe('DigitalTwinService (MySQL)', () => {
  let prisma: PrismaService;
  let service: DigitalTwinService;
  let businessId: string;
  let childId: string;
  let inactiveChildId: string;
  let otherBusinessId: string;
  let userId: string;
  let staffId: string;
  let productId: string;
  let supplierId: string;
  let expenseId: string;
  let childExpenseId: string;
  let cls: FakeClsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const [business, other] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'BI Twin QA root',
          slug: `bi-twin-root-${Date.now()}`,
          currency: 'USD',
        },
      }),
      prisma.business.create({
        data: { name: 'BI Twin QA other', slug: `bi-twin-other-${Date.now()}` },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = other.id;
    const [child, inactiveChild] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'BI Twin QA branch',
          slug: `bi-twin-child-${Date.now()}`,
          parentId: businessId,
          currency: 'EUR',
        },
      }),
      prisma.business.create({
        data: {
          name: 'BI Twin QA inactive branch',
          slug: `bi-twin-inactive-${Date.now()}`,
          parentId: businessId,
          active: false,
        },
      }),
    ]);
    childId = child.id;
    inactiveChildId = inactiveChild.id;
    const user = await prisma.user.create({
      data: {
        name: 'BI Twin QA Staff',
        email: `bi-twin-${Date.now()}@example.test`,
        passwordHash: 'integration-test-only',
      },
    });
    userId = user.id;
    const membership = await prisma.businessUser.create({
      data: { businessId, userId: user.id, role: 'staff' },
    });
    staffId = membership.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'BI Twin QA stock item',
        kind: 'product',
        stockQty: 4,
        lowStockThreshold: 5,
      },
    });
    productId = product.id;
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'BI Twin QA supplier' },
    });
    supplierId = supplier.id;
    const expense = await prisma.expense.create({
      data: {
        businessId,
        description: 'BI Twin QA recorded cost',
        category: 'testing',
        amount: 42.5,
        incurredOn: new Date(),
      },
    });
    expenseId = expense.id;
    const childExpense = await prisma.expense.create({
      data: {
        businessId: childId,
        description: 'BI Twin QA branch cost',
        category: 'testing',
        amount: 10,
        incurredOn: new Date(),
      },
    });
    childExpenseId = childExpense.id;
    await prisma.staffShift.create({
      data: {
        businessId,
        staffUserId: staffId,
        startsAt: new Date(Date.now() + 30 * 60_000),
        endsAt: new Date(Date.now() + 90 * 60_000),
        status: 'scheduled',
      },
    });
    await prisma.workflow.create({
      data: {
        businessId,
        name: 'BI Twin QA workflow',
        triggerKey: 'sale',
        actions: [],
        active: true,
      },
    });
    await prisma.integration.create({
      data: {
        businessId,
        provider: 'email',
        status: 'connected',
        tokens: 'must-not-be-returned',
      },
    });

    cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    service = new DigitalTwinService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      prisma,
    );
  });

  afterAll(async () => {
    const ids = [businessId, childId, inactiveChildId, otherBusinessId].filter(
      Boolean,
    );
    await prisma.biTwinAssumptionVersion.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({
      where: { businessId: { in: ids }, entity: 'bi_twin_assumption_version' },
    });
    await prisma.staffShift.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.integration.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.workflow.deleteMany({
      where: { businessId: { in: ids }, name: 'BI Twin QA workflow' },
    });
    await prisma.expense.deleteMany({
      where: { id: { in: [expenseId, childExpenseId] } },
    });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.businessUser.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('reads live branch-group records with branch-local currencies and disclosed gaps', async () => {
    const result = await service.context(businessId);
    expect(result.branches.map((branch) => branch.id)).toEqual([
      businessId,
      childId,
    ]);
    const root = result.branches.find((branch) => branch.id === businessId)!;
    const child = result.branches.find((branch) => branch.id === childId)!;
    expect(root.staff.activeCount).toBe(1);
    expect(root.staff.scheduledPeopleNext7Days).toBe(1);
    expect(root.staff.scheduledHoursNext7Days).toBeGreaterThan(0.9);
    expect(root.products).toMatchObject({
      activeCount: 1,
      productCount: 1,
      totalRecordedStockUnits: 4,
    });
    expect(root.suppliers.count).toBe(1);
    expect(root.costs).toMatchObject({
      recordedExpenseCountLast30Days: 1,
      recordedExpenseTotalLast30Days: 42.5,
      currency: 'USD',
    });
    expect(child.costs).toMatchObject({
      recordedExpenseCountLast30Days: 1,
      recordedExpenseTotalLast30Days: 10,
      currency: 'EUR',
    });
    expect(root.processes.activeWorkflowCount).toBe(1);
    expect(root.integrations).toEqual([
      {
        provider: 'email',
        status: 'connected',
        connectedAt: null,
        lastSyncAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-be-returned');
    expect(result.assetCoverage).toContain('Not tracked');
    expect(result.serviceCapacity).toContain('Partial');
    expect(inactiveChildId).not.toBe(childId);
  });

  it('stores immutable assumption versions and audits them without mutating canonical source rows', async () => {
    const input = {
      entityType: BiTwinEntityType.staff,
      entityId: staffId,
      assumptionKey: BiTwinAssumptionKey.staff_weekly_hours,
      value: 37.5,
      rationale: 'Owner estimate to compare with scheduled shifts.',
    };
    const first = await service.createAssumption(businessId, userId, {
      ...input,
    });
    const second = await service.createAssumption(businessId, userId, {
      ...input,
      seriesId: first.seriesId,
      value: 40,
      rationale: 'Updated owner estimate for the next comparison.',
    });
    expect(first.version).toBe(1);
    expect(second).toMatchObject({
      seriesId: first.seriesId,
      version: 2,
      value: 40,
    });
    expect(await service.listAssumptions(businessId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: second.id, version: 2 }),
        expect.objectContaining({ id: first.id, version: 1 }),
      ]),
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'bi_twin_assumption_version',
          entityId: { in: [first.id, second.id] },
        },
      }),
    ).toBe(2);
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stockQty: true },
      }),
    ).toEqual({ stockQty: 4 });
    expect(await prisma.expense.count({ where: { id: expenseId } })).toBe(1);

    await expect(
      service.createAssumption(businessId, userId, {
        entityType: BiTwinEntityType.staff,
        entityId: staffId,
        assumptionKey: BiTwinAssumptionKey.product_reorder_buffer_units,
        value: 3,
        rationale: 'Mismatched entity and assumption types must be rejected.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'BI_TWIN_INVALID_ASSUMPTION' },
    });

    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    const otherTenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const otherService = new DigitalTwinService(otherTenant, prisma);
    expect(await otherService.listAssumptions(otherBusinessId)).toEqual([]);
    await expect(
      otherService.createAssumption(otherBusinessId, userId, input),
    ).rejects.toMatchObject({
      response: { code: 'BI_TWIN_ENTITY_NOT_FOUND' },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });
});
