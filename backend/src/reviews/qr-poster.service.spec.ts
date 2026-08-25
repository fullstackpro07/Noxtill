import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { S3Service } from '../common/storage/s3.service';

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only; its `export * from
// 'puppeteer-core'` isn't supported under ts-jest's CommonJS transform (unrelated to the real
// Node runtime, where it works fine — same class of issue already noted in
// customer-import.service.spec.ts for `file-type`). Mocking the module keeps this spec focused on
// QrPosterService's own logic without ever loading the real Puppeteer-touching file.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { QrPosterService } from './qr-poster.service';
import { deleteCrossTestBusinessRows } from '../common/testing/cleanup-test-business';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('QrPosterService', () => {
  let prisma: PrismaService;
  let service: QrPosterService;
  let businessId: string;
  const pdfRenderer = {
    renderPdf: jest
      .fn<Promise<Buffer>, [string]>()
      .mockResolvedValue(Buffer.from('pdf-bytes')),
    renderPng: jest.fn().mockResolvedValue(Buffer.from('png-bytes')),
  };
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/qr-poster'),
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/logo.png'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new QrPosterService(
      tenantPrisma,
      pdfRenderer,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'QR Poster Test Biz',
        slug: `qr-poster-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    pdfRenderer.renderPng.mockClear();
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    if (businessId) {
      await deleteCrossTestBusinessRows(prisma, businessId);
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma?.$disconnect();
  });

  // Real QR encoding (`toDataURL`) is CPU-bound and can occasionally cross the default 5s budget
  // when the full suite runs dozens of Jest workers in parallel — bumped, not mocked, since it's
  // the one bit of real work this spec is meant to exercise.
  it('renders a PDF poster at the requested page size and uploads it via S3', async () => {
    const result = await service.generate(businessId, {
      format: 'a4',
      fileType: 'pdf',
      targetUrl: 'https://example.com/rq/test',
    });

    expect(result).toEqual({ url: 'https://signed.example/qr-poster' });
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('QR Poster Test Biz'),
      { width: '210mm', height: '297mm' },
    );
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`qr-posters/${businessId}/`),
      expect.any(Buffer),
      'application/pdf',
    );
  }, 15_000);

  it('renders a PNG poster at the correctly converted pixel size for the sticker format', async () => {
    await service.generate(businessId, {
      format: 'sticker',
      fileType: 'png',
      targetUrl: 'https://example.com/rq/test',
    });

    // 80mm at 150 DPI: 80 / 25.4 * 150 ≈ 472.44 -> rounds to 472.
    expect(pdfRenderer.renderPng).toHaveBeenCalledWith(expect.any(String), {
      width: 472,
      height: 472,
    });
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'image/png',
    );
  }, 15_000);

  it('escapes the business name so it can never break out of the rendered HTML', async () => {
    const evilBusiness = await prisma.business.create({
      data: {
        name: '<script>alert(1)</script>',
        slug: `qr-poster-evil-${Date.now()}`,
      },
    });

    await service.generate(evilBusiness.id, {
      format: 'a5',
      fileType: 'pdf',
      targetUrl: 'https://example.com/rq/evil',
    });

    const htmlArg =
      pdfRenderer.renderPdf.mock.calls[
        pdfRenderer.renderPdf.mock.calls.length - 1
      ][0];
    expect(htmlArg).not.toContain('<script>alert(1)</script>');
    expect(htmlArg).toContain('&lt;script&gt;');

    await deleteCrossTestBusinessRows(prisma, evilBusiness.id);
    await prisma.business.delete({ where: { id: evilBusiness.id } });
  }, 15_000);

  it('renders the real brandColor and a signed logo image when Review Settings has them set (UPD-FE-086)', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        reviewSettings: {
          brandColor: '#FF6600',
          logoKey: 'review-branding/test/logo.png',
        },
      },
    });

    await service.generate(businessId, {
      format: 'a5',
      fileType: 'pdf',
      targetUrl: 'https://example.com/rq/test',
    });

    const htmlArg =
      pdfRenderer.renderPdf.mock.calls[
        pdfRenderer.renderPdf.mock.calls.length - 1
      ][0];
    expect(htmlArg).toContain('#FF6600');
    expect(htmlArg).toContain('https://signed.example/logo.png');
    expect(s3.getSignedDownloadUrl).toHaveBeenCalledWith(
      'review-branding/test/logo.png',
    );

    await prisma.business.update({
      where: { id: businessId },
      data: { reviewSettings: {} },
    });
  }, 15_000);

  it('falls back to the default heading color and no logo when nothing is set', async () => {
    await service.generate(businessId, {
      format: 'a5',
      fileType: 'pdf',
      targetUrl: 'https://example.com/rq/test',
    });

    const htmlArg =
      pdfRenderer.renderPdf.mock.calls[
        pdfRenderer.renderPdf.mock.calls.length - 1
      ][0];
    expect(htmlArg).toContain('#0C4B3B');
    expect(htmlArg).not.toContain('class="logo"');
  }, 15_000);
});
