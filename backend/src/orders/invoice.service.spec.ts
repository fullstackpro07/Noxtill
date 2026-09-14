// invoice.service.ts pulls in PdfRendererService -> puppeteer, an ESM-only package ts-jest's
// CommonJS transform can't parse — same guard used by reports.service.spec.ts / receipts.service.spec.ts.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { TerminologyService } from '../settings/terminology.service';
import { InvoiceService } from './invoice.service';
import { OrderStatus } from '@prisma/client';
import type { S3Service } from '../common/storage/s3.service';
import type { SendGateService } from '../messaging/send-gate.service';
import type { PdfRendererService as PdfRendererServiceType } from '../common/pdf/pdf-renderer.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('InvoiceService (UPD-INT-016 depth fix — real terminology propagation)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let orderId: string;
  let pdfRenderer: {
    renderPdf: jest.Mock<Promise<Buffer>, [html: string]>;
  };
  let service: InvoiceService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: { name: 'Invoice Terms Biz', slug: `invoice-terms-${Date.now()}` },
    });
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Priya' },
    });

    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 501,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 40,
        subtotal: 40,
        customerId: customer.id,
        items: { create: [{ name: 'Widget', price: 40, cost: 15, qty: 1 }] },
      },
    });
    orderId = order.id;

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as never);
    const terminology = new TerminologyService(prisma);
    const s3 = {
      uploadAndSign: jest
        .fn()
        .mockResolvedValue('https://signed.example/invoice.pdf'),
    };
    const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
    pdfRenderer = {
      renderPdf: jest
        .fn<Promise<Buffer>, [html: string]>()
        .mockResolvedValue(Buffer.from('pdf')),
    };

    service = new InvoiceService(
      tenantPrisma,
      new LocaleService(),
      s3 as unknown as S3Service,
      sendGate as unknown as SendGateService,
      pdfRenderer as unknown as PdfRendererServiceType,
      terminology,
    );
  });

  afterEach(async () => {
    pdfRenderer.renderPdf.mockClear();
    await prisma.labelOverride.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.order.delete({ where: { id: orderId } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('renders the real default "Customer" label in front of the customer\'s name — previously rendered no label at all', async () => {
    await service.generate(businessId, orderId);

    const html = pdfRenderer.renderPdf.mock.calls[0][0];
    expect(html).toContain('Customer: Priya');
  });

  it('a real relabel of "Customer" in Settings changes the invoice PDF, not just the settings screen', async () => {
    await prisma.labelOverride.create({
      data: { businessId, area: 'general', key: 'customer', value: 'Client' },
    });

    await service.generate(businessId, orderId);

    const html = pdfRenderer.renderPdf.mock.calls[0][0];
    expect(html).toContain('Client: Priya');
    expect(html).not.toContain('Customer: Priya');
  });
});
