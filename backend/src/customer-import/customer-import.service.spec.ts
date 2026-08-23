import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CustomerImportService } from './customer-import.service';
import { CustomerImportParser } from './customer-import.parser';
import { ClaudeClient } from '../ai/claude.client';
import type { DigitizerVisionService } from '../digitizer/digitizer-vision.service';

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
  const vision = { extract: jest.fn() };

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
      vision as unknown as DigitizerVisionService,
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

  afterEach(() => {
    vision.extract.mockReset();
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

  it('created customers default to consentMarketing: false, never the schema default of true (UPD-BE-099)', async () => {
    const csv = ['name,phone,balance', 'Consent Test,+14155550155,0'].join(
      '\n',
    );
    const preview = await importService.stageImport(businessId, csvFile(csv));
    await importService.executeBatch(businessId, preview.batchId);

    const created = await prisma.customer.findUniqueOrThrow({
      where: { businessId_phone: { businessId, phone: '+14155550155' } },
    });
    expect(created.consentMarketing).toBe(false);
  });

  describe('column-mapping (UPD-BE-099)', () => {
    it('auto-suggests a mapping for non-standard headers and stages rows correctly', async () => {
      const csv = [
        'Full Name,Mobile Number,Owed',
        'Mapped Customer,+14155550166,75',
      ].join('\n');
      const preview = await importService.stageImport(businessId, csvFile(csv));

      expect(preview.hasColumnMapping).toBe(true);
      expect(preview.counts.create).toBe(1);
      expect(preview.counts.totalCredit).toBe(75);
    });

    it('getColumns() returns the real file headers and a suggested mapping', async () => {
      const csv = ['Full Name,Mobile Number', 'X,+14155550177'].join('\n');
      const preview = await importService.stageImport(businessId, csvFile(csv));

      const columns = await importService.getColumns(preview.batchId);
      expect(columns.headers).toEqual(['Full Name', 'Mobile Number']);
      expect(columns.mapping['Full Name']).toBe('name');
      expect(columns.mapping['Mobile Number']).toBe('phone');
    });

    it('remap() re-stages a batch under a corrected mapping', async () => {
      // Headers that don't auto-map at all — every row starts out skipped.
      const csv = ['Col A,Col B', 'Remap Customer,+14155550188'].join('\n');
      const preview = await importService.stageImport(businessId, csvFile(csv));
      expect(preview.counts.skip).toBe(1);

      const remapped = await importService.remap(businessId, preview.batchId, {
        'Col A': 'name',
        'Col B': 'phone',
      });
      expect(remapped.counts.create).toBe(1);
      expect(remapped.counts.skip).toBe(0);
    });

    it('rejects remapping a batch that has already been confirmed', async () => {
      const csv = ['Col A,Col B', 'Locked,+14155550199'].join('\n');
      const preview = await importService.stageImport(businessId, csvFile(csv));
      await importService.confirm(businessId, preview.batchId);

      await expect(
        importService.remap(businessId, preview.batchId, {
          'Col A': 'name',
          'Col B': 'phone',
        }),
      ).rejects.toThrow();
    });

    it('getColumns() rejects a batch with nothing to map (unstructured txt)', async () => {
      const preview = await importService.stageImport(businessId, {
        buffer: Buffer.from('no columns here'),
        mimetype: 'text/plain',
        originalname: 'notes.txt',
        size: 16,
      });
      await expect(importService.getColumns(preview.batchId)).rejects.toThrow();
    });
  });

  describe('photo path (UPD-BE-099)', () => {
    it('routes a real image upload through the digitizer vision pipeline into the same staging flow', async () => {
      vision.extract.mockResolvedValue([
        {
          id: 'row-1',
          destination: 'customer',
          data: { name: 'Photo Customer', phone: '+14155550200', balance: 60 },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
        {
          id: 'row-2',
          destination: 'product',
          data: { name: 'Not a customer row' },
          confidence: 0.8,
          corrected: false,
          action: 'commit',
        },
      ]);

      const preview = await importService.stageImport(businessId, {
        buffer: Buffer.from('fake-image-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'ledger.jpg',
        size: 16,
      });

      expect(vision.extract).toHaveBeenCalledWith(
        businessId,
        'customer_list',
        expect.any(Buffer),
        'image/jpeg',
      );
      // Only the real 'customer' row is carried through — the unrelated 'product' row is dropped.
      expect(preview.counts.create).toBe(1);
      expect(preview.counts.totalCredit).toBe(60);
      expect(preview.hasColumnMapping).toBe(false);
    });
  });
});
