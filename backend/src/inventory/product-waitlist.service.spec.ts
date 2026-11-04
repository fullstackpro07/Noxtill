import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProductWaitlistService } from './product-waitlist.service';
import { AppException } from '../common/filters/app.exception';
import type {
  SendGateParams,
  SendGateService,
} from '../messaging/send-gate.service';
import { SendGateService as RealSendGateService } from '../messaging/send-gate.service';
import { TemplateRegistryService } from '../messaging/templates/template-registry.service';
import type { Message } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ProductWaitlistService (UPD-BE-111)', () => {
  let prisma: PrismaService;
  let service: ProductWaitlistService;
  let previewService: ProductWaitlistService;
  let businessId: string;
  let productId: string;
  let customerAId: string;
  let customerBId: string;
  let sendGate: { send: jest.Mock<Promise<Message>, [SendGateParams]> };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    sendGate = {
      send: jest
        .fn<Promise<Message>, [SendGateParams]>()
        .mockResolvedValue({} as Message),
    };
    service = new ProductWaitlistService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );
    previewService = new ProductWaitlistService(
      tenantPrisma,
      new RealSendGateService(tenantPrisma, new TemplateRegistryService(), {
        add: jest.fn(),
      } as never),
    );

    const business = await prisma.business.create({
      data: { name: 'Waitlist Test Biz', slug: `waitlist-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Popular Widget',
        costPrice: 1,
        sellingPrice: 5,
        stockQty: 0,
        lowStockThreshold: 5,
      },
    });
    productId = product.id;

    const customerA = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}0`,
        name: 'Waiting Customer A',
      },
    });
    customerAId = customerA.id;
    const customerB = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}1`,
        name: 'Waiting Customer B',
      },
    });
    customerBId = customerB.id;
  });

  afterAll(async () => {
    await prisma.productWaitlistEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('adds a real customer to a product waitlist', async () => {
    const entry = await service.add(businessId, productId, customerAId);
    expect(entry.productId).toBe(productId);
    expect(entry.customer.name).toBe('Waiting Customer A');
    expect(entry.notifiedAt).toBeNull();
  });

  it('counts and lists only un-notified real waiting entries', async () => {
    await service.add(businessId, productId, customerBId);
    expect(await service.count(productId)).toBe(2);

    const list = await service.list(productId);
    expect(list.map((e) => e.customerId).sort()).toEqual(
      [customerAId, customerBId].sort(),
    );
  });

  it('refuses to notify while the product is still genuinely out of stock', async () => {
    await expect(service.notify(businessId, productId)).rejects.toBeInstanceOf(
      AppException,
    );
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('previews current send-gate eligibility without creating messages or notifying customers', async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 15 },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { msgQuota: 1, msgUsed: 0 },
    });
    const waitingBefore = await prisma.productWaitlistEntry.findMany({
      where: { businessId, productId, notifiedAt: null },
    });
    const messagesBefore = await prisma.message.count({
      where: { businessId },
    });

    const preview = await previewService.previewNotification(
      businessId,
      'waitlist-preview-test-actor',
      productId,
    );

    expect(preview).toMatchObject({
      productId,
      productName: 'Popular Widget',
      availableStock: 15,
      waitingCount: 2,
      eligibleCount: 1,
      blockedCount: 1,
      providerDeliveryChecked: false,
    });
    expect(
      preview.recipients.filter((recipient) => recipient.status === 'eligible'),
    ).toHaveLength(1);
    const eligible = preview.recipients.find(
      (recipient) => recipient.status === 'eligible',
    );
    expect(eligible?.channel).toBe('whatsapp');
    expect(eligible?.message).toContain('Popular Widget');
    expect(eligible?.reason).toBeNull();
    expect(
      preview.recipients.find(
        (recipient) => recipient.reasonCode === 'QUOTA_EXCEEDED',
      ),
    ).toBeDefined();

    expect(await prisma.message.count({ where: { businessId } })).toBe(
      messagesBefore,
    );
    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .msgUsed,
    ).toBe(0);
    expect(
      await prisma.productWaitlistEntry.findMany({
        where: { businessId, productId, notifiedAt: null },
      }),
    ).toHaveLength(waitingBefore.length);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          action: 'inventory.waitlist_notification_previewed',
          entityId: productId,
        },
      }),
    ).toBe(1);

    await prisma.business.update({
      where: { id: businessId },
      data: { msgQuota: 600 },
    });
  });

  it('notifies every real waiting customer once restocked, then marks each notified so count drops to zero', async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 15 },
    });

    const result = await service.notify(businessId, productId);
    expect(result.notifiedCount).toBe(2);
    expect(sendGate.send).toHaveBeenCalledTimes(2);
    const callForA = sendGate.send.mock.calls.find(
      (c) => c[0].customerId === customerAId,
    );
    expect(callForA).toBeDefined();
    expect(callForA![0].templateKey).toBe('back_in_stock');
    expect(callForA![0].variables.productName).toBe('Popular Widget');

    expect(await service.count(productId)).toBe(0);
  });

  it('removes a real waitlist entry', async () => {
    const entry = await service.add(businessId, productId, customerAId);
    await service.remove(entry.id);
    const found = await prisma.productWaitlistEntry.findUnique({
      where: { id: entry.id },
    });
    expect(found).toBeNull();
  });
});
