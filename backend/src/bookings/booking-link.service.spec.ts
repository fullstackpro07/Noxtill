import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { S3Service } from '../common/storage/s3.service';
import type { ConfigService } from '@nestjs/config';

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only — same guard as
// qr-poster.service.spec.ts / receipts.service.spec.ts.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { BookingLinkService } from './booking-link.service';
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

describe('BookingLinkService (UPD-BE-090)', () => {
  let prisma: PrismaService;
  let service: BookingLinkService;
  let businessId: string;
  let serviceProductId: string;
  const pdfRenderer = {
    renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    renderPng: jest.fn().mockResolvedValue(Buffer.from('png-bytes')),
  };
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/booking-qr'),
  };
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new BookingLinkService(
      tenantPrisma,
      pdfRenderer,
      s3 as unknown as S3Service,
      config as unknown as ConfigService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Booking Link Test Biz',
        slug: `booking-link-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const svc = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Haircut', durationMin: 30 },
    });
    serviceProductId = svc.id;
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    pdfRenderer.renderPng.mockClear();
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.appointment.deleteMany({ where: { businessId } });
      await prisma.bookingLinkVisit.deleteMany({ where: { businessId } });
      await prisma.bookingLinkSettings.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({ where: { businessId } });
      await deleteCrossTestBusinessRows(prisma, businessId);
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma?.$disconnect();
  });

  it('defaults to no welcome text / no colour before any row exists', async () => {
    const settings = await service.getSettings(businessId);
    expect(settings).toMatchObject({
      welcomeText: null,
      visibleServiceIds: [],
      brandColor: null,
    });
  });

  it('persists page customisation', async () => {
    const updated = await service.updateSettings(businessId, {
      welcomeText: 'Welcome to our salon!',
      visibleServiceIds: [serviceProductId],
      brandColor: '#0C4B3B',
    });
    expect(updated.welcomeText).toBe('Welcome to our salon!');
    expect(updated.visibleServiceIds).toEqual([serviceProductId]);
    expect(updated.brandColor).toBe('#0C4B3B');
  });

  it('stats() starts at zero visits/bookings/conversion for a fresh business', async () => {
    const stats = await service.stats(businessId);
    expect(stats.totalVisits).toBe(0);
    expect(stats.totalBookings).toBe(0);
    expect(stats.conversion).toBe(0);
  });

  it('stats() aggregates real visits and link/qr-sourced bookings into a conversion rate', async () => {
    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Stats Customer' },
    });
    await prisma.bookingLinkVisit.createMany({
      data: [
        { businessId, source: 'link' },
        { businessId, source: 'link' },
        { businessId, source: 'qr' },
        { businessId, source: 'qr' },
      ],
    });
    await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId: customer.id,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 60 * 1000),
        source: 'link',
      },
    });

    const stats = await service.stats(businessId);
    expect(stats.totalVisits).toBe(4);
    expect(stats.totalBookings).toBe(1);
    expect(stats.conversion).toBe(25);
  });

  it("renders a PDF QR poster targeting this business's own public booking page", async () => {
    const result = await service.generateQr(businessId, {
      format: 'a4',
      fileType: 'pdf',
    });

    expect(result).toEqual({ url: 'https://signed.example/booking-qr' });
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('Booking Link Test Biz'),
      { width: '210mm', height: '297mm' },
    );
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`booking-qr-posters/${businessId}/`),
      expect.any(Buffer),
      'application/pdf',
    );
  }, 15_000);
});
