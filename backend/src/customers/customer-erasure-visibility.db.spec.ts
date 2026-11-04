import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { CustomerMergeSettingsService } from './customer-merge-settings.service';
import { CustomerDuplicatesService } from './customer-duplicates.service';
import { CustomersExportService } from './customers-export.service';

jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('Customer erasure visibility (real MySQL)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let tenantPrisma: TenantPrismaService;
  let duplicates: CustomerDuplicatesService;
  let exports: CustomersExportService;
  const uploaded: Buffer[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const business = await prisma.business.create({
      data: {
        name: 'Customer Erasure Visibility Test',
        slug: `customer-erasure-visibility-${Date.now()}`,
        country: 'US',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    duplicates = new CustomerDuplicatesService(
      tenantPrisma,
      new CustomerMergeSettingsService(tenantPrisma),
    );
    const s3 = {
      uploadAndSign: jest.fn((_key: string, body: Buffer) => {
        uploaded.push(body);
        return Promise.resolve('https://example.invalid/customer-export.csv');
      }),
    } as unknown as S3Service;
    exports = new CustomersExportService(tenantPrisma, s3, {
      renderPdf: jest.fn(),
    } as unknown as PdfRendererService);
  });

  afterAll(async () => {
    await prisma.customerExportLog.deleteMany({ where: { businessId } });
    await prisma.customerDuplicateDismissal.deleteMany({
      where: { businessId },
    });
    await prisma.customerMergeSettings.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('keeps erased placeholders out of bulk exports and duplicate suggestions', async () => {
    const live = await prisma.customer.create({
      data: {
        businessId,
        phone: '+14155550881',
        name: 'Live Customer',
        email: 'duplicate@example.com',
        address: '1 Main Street',
      },
    });
    const candidate = await prisma.customer.create({
      data: {
        businessId,
        phone: '+14155550882',
        name: 'Different Customer Name',
        email: 'duplicate@example.com',
        address: '2 Main Street',
      },
    });
    const erased = await prisma.customer.create({
      data: {
        businessId,
        phone: `erased-${crypto.randomUUID()}`,
        name: 'Erased Customer',
        email: 'duplicate@example.com',
      },
    });

    const result = await exports.generate(
      businessId,
      'customer-erasure-visibility-test',
      { format: 'csv', fields: ['name', 'phone', 'email'] },
      false,
    );
    expect(result.rowCount).toBe(
      await prisma.customer.count({
        where: {
          businessId,
          NOT: { phone: { startsWith: 'erased-' } },
        },
      }),
    );
    expect(uploaded.at(-1)?.toString()).toContain(live.name);
    expect(uploaded.at(-1)?.toString()).not.toContain(erased.name);
    expect(uploaded.at(-1)?.toString()).not.toContain(erased.phone);

    const pairs = await duplicates.list(businessId);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].matchEvidence).toEqual([
      {
        field: 'email',
        method: 'trimmed_case_insensitive',
        label: 'Email matches after trimming spaces and ignoring case',
      },
    ]);
    expect(pairs[0].conflictingFields).toEqual(
      expect.arrayContaining(['name', 'phone', 'address']),
    );
    expect(pairs[0].a.email).toBe('duplicate@example.com');
    expect(pairs[0].b.email).toBe('duplicate@example.com');
    expect(
      pairs.some(
        (pair) => pair.a.id === candidate.id || pair.b.id === candidate.id,
      ),
    ).toBe(true);
    expect(
      pairs.some((pair) => pair.a.id === erased.id || pair.b.id === erased.id),
    ).toBe(false);
  });
});
