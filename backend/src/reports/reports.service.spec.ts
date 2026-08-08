import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LocaleService } from '../common/localization/locale.service';
import { ProfitService } from '../profit/profit.service';
import { CommissionsService } from '../staff/commissions.service';
import type { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import type { S3Service } from '../common/storage/s3.service';
import type { SendGateService } from '../messaging/send-gate.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role } from '../../generated/prisma';

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only and breaks ts-jest's
// per-file CommonJS transform — same issue already worked around in qr-poster.service.spec.ts.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { ReportsService } from './reports.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReportsService (INT-012)', () => {
  let prisma: PrismaService;
  let service: ReportsService;
  let businessId: string;
  let ownerUserId: string;
  let ownerBusinessUserId: string;
  let staffUserId: string;
  let staffBusinessUserId: string;
  const month = '2025-06';

  const pdfRenderer = { renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };
  const s3 = { uploadAndSign: jest.fn().mockResolvedValue('https://signed.example/report') };
  const sendGate = { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    service = new ReportsService(
      tenantPrisma,
      new LocaleService(),
      s3 as unknown as S3Service,
      pdfRenderer as unknown as PdfRendererService,
      new ProfitService(tenantPrisma, cls as unknown as ClsService),
      new CommissionsService(tenantPrisma),
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: { name: 'Reports Test Biz', slug: `reports-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const ownerUser = await prisma.user.create({
      data: { name: 'Report Owner', email: `report-owner-${Date.now()}@example.com`, phone: `+1555${Date.now()}`, passwordHash: 'x' },
    });
    ownerUserId = ownerUser.id;
    const ownerLink = await prisma.businessUser.create({
      data: { businessId, userId: ownerUserId, role: Role.owner },
    });
    ownerBusinessUserId = ownerLink.id;

    const staffUser = await prisma.user.create({
      data: { name: 'Report Staff', email: `report-staff-${Date.now()}@example.com`, phone: `+1556${Date.now()}`, passwordHash: 'x' },
    });
    staffUserId = staffUser.id;
    const staffLink = await prisma.businessUser.create({
      data: { businessId, userId: staffUserId, role: Role.staff, commissionRule: { type: 'percent', value: 10 } },
    });
    staffBusinessUserId = staffLink.id;

    const customer = await prisma.customer.create({
      data: { businessId, name: 'Report Customer', phone: `+1557${Date.now()}` },
    });

    const monthDate = new Date('2025-06-15T00:00:00Z');
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 9001,
        status: 'completed',
        orderType: 'counter',
        customerId: customer.id,
        staffUserId: ownerBusinessUserId,
        total: 100,
        subtotal: 100,
        createdAt: monthDate,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 9002,
        status: 'completed',
        orderType: 'counter',
        customerId: customer.id,
        staffUserId: staffBusinessUserId,
        total: 50,
        subtotal: 50,
        createdAt: monthDate,
      },
    });
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    s3.uploadAndSign.mockClear();
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, staffUserId] } } });
    await prisma.$disconnect();
  });

  const ownerAuth: AuthenticatedUser = { sub: '', businessId: '', role: Role.owner };
  const staffAuth: AuthenticatedUser = { sub: '', businessId: '', role: Role.staff };

  function asOwner(): AuthenticatedUser {
    return { ...ownerAuth, sub: ownerUserId, businessId };
  }
  function asStaff(): AuthenticatedUser {
    return { ...staffAuth, sub: staffUserId, businessId };
  }

  it('generates a monthly summary PDF and uploads it via S3', async () => {
    const result = await service.generate('monthly', month, asOwner());
    expect(result).toEqual({ url: 'https://signed.example/report' });
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      `reports/${businessId}/monthly-${month}.pdf`,
      expect.any(Buffer),
      'application/pdf',
    );
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(expect.stringContaining('150'));
  });

  it('generates the pnl report from real ProfitService data', async () => {
    await service.generate('pnl', month, asOwner());
    const html = pdfRenderer.renderPdf.mock.calls[0][0] as string;
    expect(html).toContain('Profit');
  });

  it('sales report includes every order for an owner', async () => {
    await service.generate('sales', month, asOwner());
    const html = pdfRenderer.renderPdf.mock.calls[0][0] as string;
    expect(html).toContain('#9001');
    expect(html).toContain('#9002');
  });

  it('sales report is auto-filtered to own orders for a staff caller', async () => {
    await service.generate('sales', month, asStaff());
    const html = pdfRenderer.renderPdf.mock.calls[0][0] as string;
    expect(html).not.toContain('#9001');
    expect(html).toContain('#9002');
  });

  it('staff report is generated for an owner via real CommissionsService', async () => {
    await service.generate('staff', month, asOwner());
    const html = pdfRenderer.renderPdf.mock.calls[0][0] as string;
    expect(html).toContain('Report Staff');
  });

  it('rejects a staff-role caller requesting the staff report', async () => {
    await expect(service.generate('staff', month, asStaff())).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('generates the reviews summary report', async () => {
    const result = await service.generate('reviews', month, asOwner());
    expect(result).toEqual({ url: 'https://signed.example/report' });
  });

  it('send() generates the PDF then pushes it to the caller via the real send-gate template', async () => {
    await service.send('monthly', month, asOwner());
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'report_ready',
        variables: expect.objectContaining({ url: 'https://signed.example/report' }),
      }),
    );
  });
});
