import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PurchaseOrdersService } from './purchase-orders.service';
import { AppException } from '../common/filters/app.exception';
import { LocaleService } from '../common/localization/locale.service';
import type {
  ActivityService,
  RecordActivityEventInput,
} from '../activity/activity.service';
import type {
  SendGateParams,
  SendGateService,
} from '../messaging/send-gate.service';
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

describe('PurchaseOrdersService (UPD-BE-112)', () => {
  let prisma: PrismaService;
  let service: PurchaseOrdersService;
  let businessId: string;
  let userId: string;
  let supplierId: string;
  let supplierNoPhoneId: string;
  let productId: string;
  let sendGate: { send: jest.Mock<Promise<Message>, [SendGateParams]> };
  let activity: {
    record: jest.Mock<Promise<void>, [string, RecordActivityEventInput]>;
  };

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
    activity = {
      record: jest
        .fn<Promise<void>, [string, RecordActivityEventInput]>()
        .mockResolvedValue(undefined),
    };
    service = new PurchaseOrdersService(
      tenantPrisma,
      activity as unknown as ActivityService,
      sendGate as unknown as SendGateService,
      new LocaleService(),
    );

    const business = await prisma.business.create({
      data: {
        name: 'PO Test Biz',
        slug: `po-test-${Date.now()}`,
        currency: 'USD',
        locale: 'en-US',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'PO Owner',
        email: `po-owner-${Date.now()}@test.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;

    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Acme Supplies', phone: '+15551234567' },
    });
    supplierId = supplier.id;

    const supplierNoPhone = await prisma.supplier.create({
      data: { businessId, name: 'No Phone Supplier' },
    });
    supplierNoPhoneId = supplierNoPhone.id;

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Widget',
        costPrice: 1,
        sellingPrice: 5,
        stockQty: 10,
        lowStockThreshold: 5,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { businessId } },
    });
    await prisma.purchaseOrder.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real draft PO and never touches stock', async () => {
    const po = await service.create(businessId, userId, {
      supplierId,
      items: [{ productId, qty: 20, unitCost: 1.2 }],
    });
    expect(po.status).toBe('draft');
    expect(po.items).toHaveLength(1);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(10); // unchanged — draft never writes stock
  });

  it('rejects sending a PO whose supplier has no phone on file', async () => {
    const po = await service.create(businessId, userId, {
      supplierId: supplierNoPhoneId,
      items: [{ productId, qty: 5, unitCost: 1 }],
    });
    await expect(service.send(businessId, po.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('runs the real full lifecycle: draft -> sent (real WhatsApp preview) -> confirmed -> received, writing real stock', async () => {
    const po = await service.create(businessId, userId, {
      supplierId,
      note: 'Urgent restock',
      items: [{ productId, qty: 20, unitCost: 1.2 }],
    });

    const sent = await service.send(businessId, po.id);
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    const sendCall = sendGate.send.mock.calls[0][0];
    expect(sendCall.templateKey).toBe('purchase_order');
    expect(sendCall.to).toEqual({ phone: '+15551234567' });
    expect(sendCall.variables.items).toContain('20x Widget');

    const confirmed = await service.confirm(po.id);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedAt).not.toBeNull();

    const itemId = confirmed.items[0].id;
    const received = await service.receive(businessId, po.id, {
      items: [{ itemId, qtyReceived: 20 }],
    });
    expect(received.status).toBe('received');
    expect(received.receivedAt).not.toBeNull();
    expect(received.items[0].qtyReceived).toBe(20);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(30); // 10 + 20, a real write
    expect(Number(product.costPrice)).toBe(1.2);

    const movements = await prisma.stockMovement.findMany({
      where: { businessId, productId, kind: 'purchase' },
    });
    expect(
      movements.some((m) => m.qty === 20 && m.supplierId === supplierId),
    ).toBe(true);
  });

  it('supports a real partial receive, leaving the PO partially_received until the remainder arrives', async () => {
    const po = await service.create(businessId, userId, {
      supplierId,
      items: [{ productId, qty: 10, unitCost: 2 }],
    });
    await service.send(businessId, po.id);
    await service.confirm(po.id);

    const itemId = po.items[0].id;
    const partial = await service.receive(businessId, po.id, {
      items: [{ itemId, qtyReceived: 4 }],
    });
    expect(partial.status).toBe('partially_received');
    expect(partial.items[0].qtyReceived).toBe(4);

    const rest = await service.receive(businessId, po.id, {
      items: [{ itemId, qtyReceived: 6 }],
    });
    expect(rest.status).toBe('received');
    expect(rest.items[0].qtyReceived).toBe(10);
  });

  it('rejects receiving more than what remains outstanding', async () => {
    const po = await service.create(businessId, userId, {
      supplierId,
      items: [{ productId, qty: 5, unitCost: 1 }],
    });
    await service.send(businessId, po.id);
    await service.confirm(po.id);

    await expect(
      service.receive(businessId, po.id, {
        items: [{ itemId: po.items[0].id, qtyReceived: 99 }],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects receiving a PO that has not been confirmed yet', async () => {
    const po = await service.create(businessId, userId, {
      supplierId,
      items: [{ productId, qty: 5, unitCost: 1 }],
    });
    await expect(
      service.receive(businessId, po.id, {
        items: [{ itemId: po.items[0].id, qtyReceived: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('cancels a draft PO but refuses to cancel one already received', async () => {
    const draft = await service.create(businessId, userId, {
      supplierId,
      items: [{ productId, qty: 3, unitCost: 1 }],
    });
    const cancelled = await service.cancel(draft.id);
    expect(cancelled.status).toBe('cancelled');

    const receivedPo = await service.create(businessId, userId, {
      supplierId,
      items: [{ productId, qty: 2, unitCost: 1 }],
    });
    await service.send(businessId, receivedPo.id);
    await service.confirm(receivedPo.id);
    const fullyReceived = await service.receive(businessId, receivedPo.id, {
      items: [{ itemId: receivedPo.items[0].id, qtyReceived: 2 }],
    });
    expect(fullyReceived.status).toBe('received');

    await expect(service.cancel(receivedPo.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });
});
