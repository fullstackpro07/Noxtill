// invoice.service.ts pulls in PdfRendererService -> puppeteer, an ESM-only package ts-jest's
// CommonJS transform can't parse (same pattern as reports.service.spec.ts / qr-poster.service.spec.ts).
// This spec only ever passes a hand-mocked InvoiceService, so the real module is never needed.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import type { InvoiceService } from './invoice.service';
import { ReceiptsService } from './receipts.service';
import { OrderStatus, PaymentMethod, Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReceiptsService (UPD-BE-086)', () => {
  let prisma: PrismaService;
  let service: ReceiptsService;
  let businessId: string;
  let staffAStaffId: string;
  let staffAUserId: string;
  let staffBUserId: string;
  let orderId: string;
  let orderNo: number;
  let customerPhone: string;
  const invoiceService = { generate: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ReceiptsService(
      tenantPrisma,
      cls as unknown as ClsService,
      invoiceService as unknown as InvoiceService,
    );

    const business = await prisma.business.create({
      data: { name: 'Receipts Test Biz', slug: `receipts-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const phoneSuffix = String(Date.now()).slice(-4);
    const staffA = await prisma.user.create({
      data: {
        name: 'Staff A',
        phone: `+1415681${phoneSuffix}`,
        passwordHash: 'x',
      },
    });
    const staffB = await prisma.user.create({
      data: {
        name: 'Staff B',
        phone: `+1415682${phoneSuffix}`,
        passwordHash: 'x',
      },
    });
    staffAUserId = staffA.id;
    staffBUserId = staffB.id;
    const staffABu = await prisma.businessUser.create({
      data: { businessId, userId: staffA.id, role: Role.staff },
    });
    await prisma.businessUser.create({
      data: { businessId, userId: staffB.id, role: Role.staff },
    });
    staffAStaffId = staffABu.id;

    customerPhone = `+1415683${phoneSuffix}`;
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Receipt Customer', phone: customerPhone },
    });

    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 301,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 40,
        staffUserId: staffABu.id,
        customerId: customer.id,
        items: { create: [{ name: 'Item', price: 40, cost: 15, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.cash, amount: 40 }] },
      },
    });
    orderId = order.id;
    orderNo = order.orderNo;
    cls.set(CLS_KEY_USER_ID, staffA.id);
  });

  afterEach(() => {
    invoiceService.generate.mockReset();
  });

  afterAll(async () => {
    await prisma.receiptLog.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [staffAUserId, staffBUserId] } },
    });
    await prisma.$disconnect();
  });

  it('lists a real completed sale with no delivery history yet', async () => {
    const rows = await service.list(businessId, Role.owner, null, {});
    const row = rows.find((r) => r.id === orderId)!;
    expect(row.lastSentAt).toBeNull();
    expect(row.lastChannel).toBeNull();
  });

  it('finds a sale by real order number', async () => {
    const rows = await service.list(businessId, Role.owner, null, {
      q: String(orderNo),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orderId);
  });

  it('finds a sale by real customer phone', async () => {
    const rows = await service.list(businessId, Role.owner, null, {
      q: customerPhone,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orderId);
  });

  it('staff scoping matches Sales History — a staff member only sees their own real sales', async () => {
    const rows = await service.list(businessId, Role.staff, staffAStaffId, {});
    expect(rows).toHaveLength(1);
  });

  it('resend() reuses the real invoice generator and records a genuine delivery-channel log entry', async () => {
    invoiceService.generate.mockResolvedValue({
      url: 'https://example.com/fake-receipt.pdf',
    });

    const result = await service.resend(businessId, orderId, 'digital');
    expect(result.url).toBe('https://example.com/fake-receipt.pdf');
    expect(invoiceService.generate).toHaveBeenCalledWith(
      businessId,
      orderId,
      true,
    );

    const log = await prisma.receiptLog.findFirst({
      where: { businessId, orderId },
    });
    expect(log?.channel).toBe('digital');
    expect(log?.sentByUserId).toBe(staffAUserId);

    const rows = await service.list(businessId, Role.owner, null, {});
    const row = rows.find((r) => r.id === orderId)!;
    expect(row.lastChannel).toBe('digital');
    expect(row.lastSentAt).not.toBeNull();
  });

  it('resend(print) passes send=false to the generator (never messages the customer for a print)', async () => {
    invoiceService.generate.mockResolvedValue({
      url: 'https://example.com/fake-receipt.pdf',
    });
    await service.resend(businessId, orderId, 'print');
    expect(invoiceService.generate).toHaveBeenCalledWith(
      businessId,
      orderId,
      false,
    );
  });

  it('rejects resending a receipt for an order outside this business', async () => {
    const other = await prisma.business.create({
      data: {
        name: 'Other Receipts Biz',
        slug: `other-receipts-${Date.now()}`,
      },
    });
    const foreignOrder = await prisma.order.create({
      data: {
        businessId: other.id,
        orderNo: 1,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 10,
      },
    });

    await expect(
      service.resend(businessId, foreignOrder.id, 'digital'),
    ).rejects.toThrow();

    await prisma.order.delete({ where: { id: foreignOrder.id } });
    await prisma.business.delete({ where: { id: other.id } });
  });

  it('stats() computes a real digital-vs-printed percentage from the receipt log', async () => {
    const stats = await service.stats(businessId);
    // One 'digital' and one 'print' resend were logged above.
    expect(stats.digitalCount).toBe(1);
    expect(stats.printedCount).toBe(1);
    expect(stats.digitalPercent).toBe(50);
  });
});
