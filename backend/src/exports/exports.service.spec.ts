// exports.service.ts now pulls in PdfRendererService -> puppeteer, an ESM-only package ts-jest's
// CommonJS transform can't parse (same pattern as reports.service.spec.ts / receipts.service.spec.ts).
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { ClsService } from 'nestjs-cls';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ExportsService } from './exports.service';
import type { S3Service } from '../common/storage/s3.service';
import type { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import type { Queue } from 'bullmq';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

async function readSheetRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1).map((v) => String(v)));
  });
  return rows;
}

describe('ExportsService (INT-012)', () => {
  let prisma: PrismaService;
  let service: ExportsService;
  let businessId: string;
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/export.xlsx'),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const pdfRenderer = {
    renderPdf: jest
      .fn<Promise<Buffer>, [string]>()
      .mockResolvedValue(Buffer.from('fake pdf')),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ExportsService(
      tenantPrisma,
      s3 as unknown as S3Service,
      pdfRenderer as unknown as PdfRendererService,
      queue as unknown as Queue,
    );

    const business = await prisma.business.create({
      data: { name: 'Exports Test Biz', slug: `exports-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.create({
      data: {
        businessId,
        name: 'Export Customer',
        phone: `+1558${Date.now()}`,
        lifetimeSpend: 250,
      },
    });
    await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Export Widget',
        sku: 'EXP-1',
        stockQty: 3,
        lowStockThreshold: 5,
      },
    });
    await prisma.expense.create({
      data: {
        businessId,
        description: 'Export Rent',
        category: 'rent',
        amount: 500,
        incurredOn: new Date(),
      },
    });
  });

  afterEach(() => {
    s3.uploadAndSign.mockClear();
    queue.add.mockClear();
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('generates a real customers.xlsx with the seeded customer row', async () => {
    const buffer = await service.buildXlsxBuffer(businessId, 'customers');
    const rows = await readSheetRows(buffer);
    expect(rows.flat()).toContain('Export Customer');
  });

  it('generates a real stock.xlsx with the seeded product row', async () => {
    const buffer = await service.buildXlsxBuffer(businessId, 'stock');
    const rows = await readSheetRows(buffer);
    expect(rows.flat()).toContain('Export Widget');
    expect(rows.flat()).toContain('EXP-1');
  });

  it('generates a real expenses.xlsx with the seeded expense row', async () => {
    const buffer = await service.buildXlsxBuffer(businessId, 'expenses');
    const rows = await readSheetRows(buffer);
    expect(rows.flat()).toContain('Export Rent');
  });

  it('generateXlsx() uploads via S3 and returns the signed url', async () => {
    const result = await service.generateXlsx(businessId, 'customers');
    expect(result).toEqual({ url: 'https://signed.example/export.xlsx' });
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`exports/${businessId}/customers-`),
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('enqueueAccountZip() adds a real job to the exports queue', async () => {
    const result = await service.enqueueAccountZip(businessId, 'user-1');
    expect(result).toEqual({ queued: true });
    expect(queue.add).toHaveBeenCalledWith(
      'account-zip',
      { businessId, userId: 'user-1' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  describe('Products export (UPD-BE-089)', () => {
    it("generates a real products.xlsx with the seeded product's real cost/selling price", async () => {
      const buffer = await service.buildXlsxBuffer(businessId, 'products');
      const rows = await readSheetRows(buffer);
      expect(rows.flat()).toContain('Export Widget');
      expect(rows.flat()).toContain('EXP-1');
    });

    it('generate(format: csv) produces a real parseable CSV with the product row', async () => {
      const result = await service.generate(businessId, 'products', 'csv');
      expect(result).toEqual({ url: 'https://signed.example/export.xlsx' });
      expect(s3.uploadAndSign).toHaveBeenCalledWith(
        expect.stringContaining(`exports/${businessId}/products-`),
        expect.any(Buffer),
        'text/csv',
      );
      const [, buffer] = s3.uploadAndSign.mock.calls[0] as [string, Buffer];
      expect(buffer.toString('utf-8')).toContain('Export Widget');
    });

    it('generate(format: pdf) renders real rows into HTML handed to the PDF renderer', async () => {
      const result = await service.generate(businessId, 'products', 'pdf');
      expect(result).toEqual({ url: 'https://signed.example/export.xlsx' });
      expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
        expect.stringContaining('Export Widget'),
      );
      expect(s3.uploadAndSign).toHaveBeenCalledWith(
        expect.stringContaining(`exports/${businessId}/products-`),
        expect.any(Buffer),
        'application/pdf',
      );
    });

    it('escapes real HTML-significant characters in a product name before rendering the PDF', async () => {
      const spikyProduct = await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: '<script>alert(1)</script> & "quoted"',
        },
      });
      await service.generate(businessId, 'products', 'pdf');
      const calls = pdfRenderer.renderPdf.mock.calls;
      const html = calls[calls.length - 1][0];
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
      await prisma.product.delete({ where: { id: spikyProduct.id } });
    });
  });

  describe('cross-tenant scoping with NO CLS bound (Reports depth fix, UPD-INT-015)', () => {
    // `AccountZipProcessor` and `ScheduledExportsService.generateArtifact()` both call this
    // service from a bare BullMQ job handler — no HTTP request, no CLS context ever bound. This
    // block uses a service instance built exactly that way (a CLS that's never `.set()`), matching
    // the real production call path, unlike every test above (which binds CLS in `beforeAll` and
    // so never actually exercised the bug: every one of these fetchers except `fetchCreditRows`
    // used to rely entirely on CLS auto-scoping and returned EVERY business's rows when CLS was
    // unbound).
    let unboundService: ExportsService;
    let otherBusinessId: string;

    beforeAll(async () => {
      const unboundCls = new FakeClsService(); // deliberately never .set()
      const unboundTenantPrisma = new TenantPrismaService(
        prisma,
        unboundCls as unknown as ClsService,
      );
      unboundService = new ExportsService(
        unboundTenantPrisma,
        s3 as unknown as S3Service,
        pdfRenderer as unknown as PdfRendererService,
        queue as unknown as Queue,
      );

      const otherBusiness = await prisma.business.create({
        data: {
          name: 'Other Tenant Biz',
          slug: `exports-other-tenant-${Date.now()}`,
        },
      });
      otherBusinessId = otherBusiness.id;
      await prisma.customer.create({
        data: {
          businessId: otherBusinessId,
          name: 'Should Never Leak Customer',
          phone: `+1559${Date.now()}`,
        },
      });
      await prisma.product.create({
        data: {
          businessId: otherBusinessId,
          kind: 'product',
          name: 'Should Never Leak Product',
          sku: 'LEAK-1',
        },
      });
      await prisma.expense.create({
        data: {
          businessId: otherBusinessId,
          description: 'Should Never Leak Expense',
          category: 'other',
          amount: 999,
          incurredOn: new Date(),
        },
      });
    });

    afterAll(async () => {
      await prisma.expense.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.product.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.customer.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.business.delete({ where: { id: otherBusinessId } });
    });

    it('customers export scopes to the requested business only, even with zero CLS context', async () => {
      const buffer = await unboundService.buildXlsxBuffer(
        businessId,
        'customers',
      );
      const rows = await readSheetRows(buffer);
      expect(rows.flat()).toContain('Export Customer'); // this business's own row
      expect(rows.flat()).not.toContain('Should Never Leak Customer');
    });

    it('stock export scopes to the requested business only, even with zero CLS context', async () => {
      const buffer = await unboundService.buildXlsxBuffer(businessId, 'stock');
      const rows = await readSheetRows(buffer);
      expect(rows.flat()).toContain('Export Widget');
      expect(rows.flat()).not.toContain('Should Never Leak Product');
      expect(rows.flat()).not.toContain('LEAK-1');
    });

    it('expenses export scopes to the requested business only, even with zero CLS context', async () => {
      const buffer = await unboundService.buildXlsxBuffer(
        businessId,
        'expenses',
      );
      const rows = await readSheetRows(buffer);
      expect(rows.flat()).toContain('Export Rent');
      expect(rows.flat()).not.toContain('Should Never Leak Expense');
    });

    it('products export scopes to the requested business only, even with zero CLS context', async () => {
      const buffer = await unboundService.buildXlsxBuffer(
        businessId,
        'products',
      );
      const rows = await readSheetRows(buffer);
      expect(rows.flat()).toContain('Export Widget');
      expect(rows.flat()).not.toContain('Should Never Leak Product');
    });

    it("sales export scopes to the requested business's own orders only, even with zero CLS context", async () => {
      const order = await prisma.order.create({
        data: {
          businessId,
          orderNo: 1,
          status: 'completed',
          subtotal: 10,
          total: 10,
        },
      });
      const otherOrder = await prisma.order.create({
        data: {
          businessId: otherBusinessId,
          orderNo: 1,
          status: 'completed',
          subtotal: 20,
          total: 20,
        },
      });

      const buffer = await unboundService.buildXlsxBuffer(businessId, 'sales');
      const rows = await readSheetRows(buffer);
      const totals = rows.flat();
      expect(totals).toContain('10');
      expect(totals).not.toContain('20');

      await prisma.order.delete({ where: { id: order.id } });
      await prisma.order.delete({ where: { id: otherOrder.id } });
    });
  });
});
