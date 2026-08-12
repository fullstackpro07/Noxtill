import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { TablesService } from './tables.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ReferralsService } from '../marketing/referrals.service';
import { ActivityService } from '../activity/activity.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
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

describe('TablesService (UPD-BE-010)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let tablesService: TablesService;
  let businessId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    ordersService = new OrdersService(
      tenantPrisma,
      cls as unknown as ClsService,
      {
        send: jest.fn().mockResolvedValue(undefined),
      } as unknown as SendGateService,
      {
        scheduleSend: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReviewRequestsService,
      {
        issueRewardIfEligible: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReferralsService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as ActivityService,
      {
        recordSaleMovement: jest.fn().mockResolvedValue(undefined),
      } as unknown as CashRegisterService,
    );
    tablesService = new TablesService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Tables Test Biz',
        slug: `tables-test-${Date.now()}`,
        taxRate: 0,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Table Widget',
        costPrice: 10,
        sellingPrice: 50,
        stockQty: 20,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.table.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('lists tables with a joined live order total when one exists', async () => {
    const table = await tablesService.create(businessId, { number: 'T1' });
    const draft = await ordersService.createDraft(businessId, {
      tableNo: 'T1',
      items: [{ productId, qty: 2 }],
    });

    const rows = await tablesService.list(businessId);
    const row = rows.find((r) => r.id === table.id)!;
    expect(row.activeOrderId).toBe(draft.id);
    expect(row.runningTotal).toBe(100);
  });

  it('rejects creating a table number that already exists', async () => {
    await expect(
      tablesService.create(businessId, { number: 'T1' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('moves an active order from one table to another, freeing the source', async () => {
    // T1 already has an active order from the previous test.
    const t1 = await tablesFindByNumber(prisma, businessId, 'T1');
    await tablesService.create(businessId, { number: 'T3' });

    const moved = await tablesService.move(businessId, t1.id, {
      toTableNumber: 'T3',
    });
    expect(moved.number).toBe('T3');
    expect(moved.activeOrderId).not.toBeNull();

    const rows = await tablesService.list(businessId);
    const freedT1 = rows.find((r) => r.number === 'T1')!;
    expect(freedT1.activeOrderId).toBeNull();
    expect(freedT1.status).toBe('free');
  });

  it('merges two tables, moving items onto the destination order and freeing the source', async () => {
    const a = await tablesService.create(businessId, { number: 'M-A' });
    await tablesService.create(businessId, { number: 'M-B' });
    await ordersService.createDraft(businessId, {
      tableNo: 'M-A',
      items: [{ productId, qty: 1 }],
    });
    const destDraft = await ordersService.createDraft(businessId, {
      tableNo: 'M-B',
      items: [{ productId, qty: 1 }],
    });

    const merged = await tablesService.merge(businessId, a.id, {
      intoTableNumber: 'M-B',
    });
    expect(merged.number).toBe('M-B');
    expect(merged.runningTotal).toBe(100); // 2 x 50, combined

    const items = await prisma.orderItem.findMany({
      where: { orderId: destDraft.id },
    });
    expect(items).toHaveLength(2);

    const rows = await tablesService.list(businessId);
    const freedA = rows.find((r) => r.id === a.id)!;
    expect(freedA.activeOrderId).toBeNull();
  });
});

async function tablesFindByNumber(
  prisma: PrismaService,
  businessId: string,
  number: string,
) {
  return prisma.table.findUniqueOrThrow({
    where: { businessId_number: { businessId, number } },
  });
}
