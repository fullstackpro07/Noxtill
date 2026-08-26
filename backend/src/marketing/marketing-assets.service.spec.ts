import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (unrelated to real Node runtime, where dynamic import works fine — same
// pre-existing issue already worked around in customer-import.service.spec.ts).
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only — same pre-existing issue
// already worked around in qr-poster.service.spec.ts. Mocking the module keeps this spec focused
// on MarketingAssetsService's own logic without ever loading the real Puppeteer-touching file.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { MarketingAssetsService } from './marketing-assets.service';
import type { S3Service } from '../common/storage/s3.service';
import type { ProfitService } from '../profit/profit.service';
import type {
  PdfPageSize,
  PngViewport,
} from '../common/pdf/pdf-renderer.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MarketingAssetsService (UPD-BE-105)', () => {
  let prisma: PrismaService;
  let service: MarketingAssetsService;
  let businessId: string;
  let ownerPhone: string;
  let cls: FakeClsService;

  const pdfRenderer = {
    renderPdf: jest
      .fn<Promise<Buffer>, [html: string, pageSize?: PdfPageSize]>()
      .mockResolvedValue(Buffer.from('pdf-bytes')),
    renderPng: jest
      .fn<Promise<Buffer>, [html: string, viewport: PngViewport]>()
      .mockResolvedValue(Buffer.from('png-bytes')),
  };
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/kit.png'),
    getSignedDownloadUrl: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(`https://signed.example/${key}`),
      ),
  };
  const profit = {
    byProduct: jest.fn().mockResolvedValue({
      windowDays: 30,
      products: [
        { productId: 'p1', name: 'Haircut', units: 40, revenue: 800 },
        { productId: 'p2', name: 'Beard trim', units: 30, revenue: 300 },
      ],
    }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new MarketingAssetsService(
      tenantPrisma,
      pdfRenderer,
      s3 as unknown as S3Service,
      profit as unknown as ProfitService,
      cls as unknown as ClsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Marketing Kit Test Biz',
        slug: `marketing-kit-test-${Date.now()}`,
        reviewSettings: {
          brandColor: '#FF6600',
          logoKey: 'review-branding/x/logo.png',
        },
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    ownerPhone = `+1415555${String(Date.now()).slice(-4)}`;
    const owner = await prisma.user.create({
      data: {
        email: `owner-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'Owner',
        phone: ownerPhone,
      },
    });
    await prisma.businessUser.create({
      data: { businessId, userId: owner.id, role: 'owner' },
    });
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    pdfRenderer.renderPng.mockClear();
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('uploads a real background image to S3 and returns its signed URL', async () => {
    const result = await service.uploadBackground({
      buffer: Buffer.from('fake-jpg-bytes'),
      size: 14,
      mimetype: 'image/jpeg',
    });

    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`marketing-kit/${businessId}/background-`),
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(result.backgroundUrl).toBe('https://signed.example/kit.png');
  });

  it('renders a real PDF poster including the real logo, brand color, phone, and top products', async () => {
    await service.generate({
      format: 'a5_poster',
      template: 'classic',
      contentBlocks: [
        'logo',
        'business_name',
        'tagline',
        'phone',
        'top_products',
        'qr_code',
      ],
      tagline: 'Fresh cuts every day',
      fileType: 'pdf',
    });

    expect(pdfRenderer.renderPdf).toHaveBeenCalledTimes(1);
    const html = pdfRenderer.renderPdf.mock.calls[0][0];
    expect(html).toContain('Marketing Kit Test Biz');
    expect(html).toContain('#FF6600');
    expect(html).toContain('Fresh cuts every day');
    expect(html).toContain(ownerPhone);
    expect(html).toContain('Haircut');
    expect(html).toContain('Beard trim');
    expect(html).toContain('https://signed.example/review-branding/x/logo.png');
    expect(pdfRenderer.renderPdf.mock.calls[0][1]).toEqual({
      width: '148mm',
      height: '210mm',
    });
  });

  it('omits a content block when there is no real data behind it, rather than faking it', async () => {
    profit.byProduct.mockResolvedValueOnce({ windowDays: 30, products: [] });
    await service.generate({
      format: 'a5_poster',
      template: 'classic',
      contentBlocks: ['top_products'],
      fileType: 'pdf',
    });

    const html = pdfRenderer.renderPdf.mock.calls[0][0];
    expect(html).not.toContain('Popular right now');
  });

  it('forces PNG at the correct pixel viewport for the pixel-native ig_story format, ignoring a requested pdf fileType', async () => {
    await service.generate({
      format: 'ig_story',
      template: 'bold',
      contentBlocks: ['business_name'],
      fileType: 'pdf',
    });

    expect(pdfRenderer.renderPdf).not.toHaveBeenCalled();
    expect(pdfRenderer.renderPng).toHaveBeenCalledWith(expect.any(String), {
      width: 1080,
      height: 1920,
    });
  });

  it('renders the uploaded background image when a backgroundKey is provided', async () => {
    await service.generate({
      format: 'a5_poster',
      template: 'minimal',
      contentBlocks: ['business_name'],
      fileType: 'pdf',
      backgroundKey: 'marketing-kit/biz/background-1.jpg',
    });

    const html = pdfRenderer.renderPdf.mock.calls[0][0];
    expect(html).toContain('background-image');
    expect(html).toContain(
      'https://signed.example/marketing-kit/biz/background-1.jpg',
    );
  });

  it('rasterizes to PNG at the correct mm-derived pixel size when fileType is png', async () => {
    await service.generate({
      format: 'table_tent',
      template: 'classic',
      contentBlocks: ['business_name'],
      fileType: 'png',
    });

    // 100mm at 150 DPI: 100 / 25.4 * 150 ≈ 590.55 -> rounds to 591.
    // 150mm at 150 DPI: 150 / 25.4 * 150 ≈ 885.83 -> rounds to 886.
    expect(pdfRenderer.renderPng).toHaveBeenCalledWith(expect.any(String), {
      width: 591,
      height: 886,
    });
  });
});
