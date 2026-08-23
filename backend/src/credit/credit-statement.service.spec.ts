import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LocaleService } from '../common/localization/locale.service';
import type { S3Service } from '../common/storage/s3.service';
import type { SendGateService } from '../messaging/send-gate.service';
import type { PdfRendererService } from '../common/pdf/pdf-renderer.service';

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only — same guard used
// throughout this codebase's PDF-touching specs (qr-poster.service.spec.ts, reports.service.spec.ts).
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { CreditStatementService } from './credit-statement.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CreditStatementService (BE-032)', () => {
  let prisma: PrismaService;
  let service: CreditStatementService;
  let businessId: string;
  let customerId: string;
  const pdfRenderer = {
    renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  };
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/statement'),
  };
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CreditStatementService(
      tenantPrisma,
      new LocaleService(),
      s3 as unknown as S3Service,
      pdfRenderer as unknown as PdfRendererService,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Statement Test Biz',
        slug: `statement-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}`,
        name: 'Statement Customer',
      },
    });
    customerId = customer.id;
    await prisma.creditEntry.create({
      data: { businessId, customerId, kind: 'credit', amount: 80 },
    });
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    s3.uploadAndSign.mockClear();
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('generates a real PDF and uploads it, returning the signed URL', async () => {
    const result = await service.generate(businessId, customerId);
    expect(result).toEqual({ url: 'https://signed.example/statement' });
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('Statement Customer'),
    );
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`statements/${businessId}/${customerId}-`),
      expect.any(Buffer),
      'application/pdf',
    );
  }, 15_000);

  it('send() generates the PDF then sends the real link to the customer', async () => {
    await service.send(businessId, customerId);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'credit_statement_ready',
        variables: {
          customerName: 'Statement Customer',
          url: 'https://signed.example/statement',
        },
      }),
    );
  }, 15_000);

  it('bulkGenerate() generates one PDF per customer, isolating a single failure', async () => {
    const results = await service.bulkGenerate(businessId, [
      customerId,
      'not-a-real-customer',
    ]);
    expect(results).toEqual([
      { customerId, url: 'https://signed.example/statement' },
      { customerId: 'not-a-real-customer', url: null },
    ]);
  }, 15_000);
});
