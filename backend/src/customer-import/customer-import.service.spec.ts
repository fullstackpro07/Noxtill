import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CustomerImportService } from './customer-import.service';
import { CustomerImportParser } from './customer-import.parser';
import { ClaudeClient } from '../ai/claude.client';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (unrelated to real Node runtime, where dynamic import works fine). Mocking
// the whole util here keeps this spec focused on import-pipeline orchestration.
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
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

describe('CustomerImportService (BE-042/043/044)', () => {
  let prisma: PrismaService;
  let importService: CustomerImportService;
  let businessId: string;
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const auditService = new AuditService(
      tenantPrisma,
      cls as unknown as ClsService,
    );
    const parser = new CustomerImportParser({
      complete: jest.fn(),
    } as unknown as ClaudeClient);
    importService = new CustomerImportService(
      tenantPrisma,
      prisma,
      parser,
      auditService,
      queue as never,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Import Test Biz',
        slug: `import-test-${Date.now()}`,
        country: 'US',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.create({
      data: { businessId, phone: '+14155550100', name: 'Existing Customer' },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.importBatch.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  function csvFile(content: string) {
    return {
      buffer: Buffer.from(content),
      mimetype: 'text/csv',
      originalname: 'customers.csv',
      size: Buffer.byteLength(content),
    };
  }

  it('stages a CSV import: creates new rows, matches existing by phone, skips invalid rows', async () => {
    const csv = [
      'name,phone,balance',
      'New Customer,(415) 555-0111,100',
      'Existing Customer,(415) 555-0100,',
      'Bad Row,not-a-phone,',
      ',,',
    ].join('\n');

    const preview = await importService.stageImport(businessId, csvFile(csv));

    expect(preview.counts.create).toBe(1);
    expect(preview.counts.update).toBe(1);
    expect(preview.counts.skip).toBe(2);
    expect(preview.counts.totalCredit).toBe(100);
    expect(preview.invalid).toHaveLength(2);
  });

  it('is idempotent: re-uploading the exact same file returns the same batch, not a new one', async () => {
    const csv = 'name,phone,balance\nDup Test,+14155550122,0';
    const first = await importService.stageImport(businessId, csvFile(csv));
    const second = await importService.stageImport(businessId, csvFile(csv));

    expect(second.batchId).toBe(first.batchId);
    const batchCount = await prisma.importBatch.count({
      where: { businessId },
    });
    // both stage calls above (2 CSVs total across both tests) should only ever produce 2 batches, not 3
    expect(batchCount).toBeLessThanOrEqual(2);
  });

  it('confirm enqueues the execute job and marks the batch processing', async () => {
    const csv = 'name,phone,balance\nConfirm Test,+14155550133,0';
    const preview = await importService.stageImport(businessId, csvFile(csv));

    const result = await importService.confirm(businessId, preview.batchId);
    expect(result.status).toBe('processing');
    expect(queue.add).toHaveBeenCalledWith(
      'execute',
      { businessId, batchId: preview.batchId },
      expect.any(Object),
    );
  });

  it('executeBatch creates customers, fills blanks on existing ones, and posts opening-balance credit entries', async () => {
    const csv = ['name,phone,balance', 'Fresh Import,+14155550144,250'].join(
      '\n',
    );
    const preview = await importService.stageImport(businessId, csvFile(csv));

    await importService.executeBatch(businessId, preview.batchId);

    const created = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId, phone: '+14155550144' } },
    });
    expect(created).toBeDefined();

    const creditEntry = await prisma.creditEntry.findFirst({
      where: { customerId: created!.id, kind: 'credit' },
    });
    expect(Number(creditEntry?.amount)).toBe(250);

    const batch = await prisma.importBatch.findUniqueOrThrow({
      where: { id: preview.batchId },
    });
    expect(batch.status).toBe('completed');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: preview.batchId },
    });
    expect(audits).toHaveLength(1);
  });
});
