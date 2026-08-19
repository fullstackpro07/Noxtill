import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { S3Service } from '../common/storage/s3.service';
import { DigitizerVisionService } from './digitizer-vision.service';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerService } from './digitizer.service';
import { AppException } from '../common/filters/app.exception';
import { DigitizerRow } from './digitizer.types';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS transform
// (unrelated to real Node runtime, where dynamic import works fine) — same workaround already
// established by customer-import.service.spec.ts.
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

// Smallest possible valid 1x1 PNG — validateUploadedFile sniffs real bytes, not the claimed mimetype.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function makeFile(overrides: Partial<{ buffer: Buffer }> = {}) {
  return {
    buffer: overrides.buffer ?? PNG_BYTES,
    mimetype: 'image/png',
    originalname: 'scan.png',
    size: (overrides.buffer ?? PNG_BYTES).length,
  };
}

describe('DigitizerService (UPD-BE-060/061/062/063)', () => {
  let prisma: PrismaService;
  let service: DigitizerService;
  let businessId: string;
  const vision = { extract: jest.fn() };
  const s3 = {
    upload: jest.fn(),
    getSignedDownloadUrl: jest.fn(),
    delete: jest.fn(),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const aliases = new DigitizerAliasService(tenantPrisma);
    service = new DigitizerService(
      tenantPrisma,
      prisma,
      s3 as unknown as S3Service,
      vision as unknown as DigitizerVisionService,
      aliases,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Digitizer Test Biz',
        slug: `digitizer-test-${Date.now()}`,
        country: 'US',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  beforeEach(() => {
    s3.upload.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.importBatch.deleteMany({ where: { businessId } });
    await prisma.digitizerAlias.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  describe('upload()', () => {
    it('extracts real rows via vision, uploads a real S3 copy, and stages a real ImportBatch', async () => {
      vision.extract.mockResolvedValue([
        {
          id: 'row-1',
          destination: 'expense',
          data: { description: 'Flour', amount: 12.5 },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
      ]);

      const preview = await service.upload(businessId, 'receipt', makeFile());
      expect(preview.scannerType).toBe('receipt');
      expect(preview.rows).toHaveLength(1);
      expect(preview.counts.expense).toBe(1);
      expect(s3.upload).toHaveBeenCalledTimes(1);

      const stored = await prisma.importBatch.findUnique({
        where: { id: preview.batchId },
      });
      expect(stored?.source).toBe('photo');
      expect(stored?.imageKey).toContain('digitizer/');
    });

    it('is idempotent for the same photo bytes — re-upload returns the same batch without a second vision call', async () => {
      const file = makeFile({
        buffer: Buffer.concat([PNG_BYTES, Buffer.from('idempotent')]),
      });
      vision.extract.mockResolvedValue([]);

      const first = await service.upload(businessId, 'receipt', file);
      const second = await service.upload(businessId, 'receipt', file);

      expect(second.batchId).toBe(first.batchId);
      expect(vision.extract).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateRow() and alias learning', () => {
    it('corrects a real row and learns a real alias from the name change', async () => {
      vision.extract.mockResolvedValue([
        {
          id: 'row-correct',
          destination: 'product',
          data: { name: 'Sprte', sellingPrice: 2 },
          confidence: 0.7,
          corrected: false,
          action: 'commit',
        },
      ]);
      const preview = await service.upload(
        businessId,
        'product',
        makeFile({ buffer: Buffer.concat([PNG_BYTES, Buffer.from('a')]) }),
      );

      const updated = await service.updateRow(businessId, 'row-correct', {
        data: { name: 'Sprite' },
      });
      expect(updated.corrected).toBe(true);
      expect(updated.data.name).toBe('Sprite');
      expect(updated.data.sellingPrice).toBe(2); // untouched fields preserved

      const stored = await prisma.importBatch.findUniqueOrThrow({
        where: { id: preview.batchId },
      });
      const rows = stored.rows as unknown as DigitizerRow[];
      expect(rows[0].data.name).toBe('Sprite');

      const alias = await prisma.digitizerAlias.findUnique({
        where: { businessId_rawText: { businessId, rawText: 'Sprte' } },
      });
      expect(alias?.correctedText).toBe('Sprite');
    });

    it('rejects a row id that does not exist', async () => {
      await expect(
        service.updateRow(businessId, 'no-such-row', { action: 'skip' }),
      ).rejects.toThrow();
    });
  });

  describe('commit()', () => {
    it('routes every destination to its real table and skips rows missing required data', async () => {
      vision.extract.mockResolvedValue([
        {
          id: 'r-customer',
          destination: 'customer',
          data: { name: 'Alex', phone: '+14155551234' },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
        {
          id: 'r-product',
          destination: 'product',
          data: { name: 'Gadget', sellingPrice: 40, costPrice: 10 },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
        {
          id: 'r-expense',
          destination: 'expense',
          data: { description: 'Cleaning supplies', amount: 15 },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
        {
          id: 'r-supplier',
          destination: 'supplier',
          data: { name: 'Acme Supply Co', phone: '+14155559999' },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
        {
          id: 'r-credit',
          destination: 'credit_opening_balance',
          data: { customerName: 'Jamie', phone: '+14155555678', amount: 30 },
          confidence: 0.9,
          corrected: false,
          action: 'commit',
        },
        {
          id: 'r-skipped',
          destination: 'expense',
          data: { description: 'Owner marked N/A', amount: 5 },
          confidence: 0.9,
          corrected: false,
          action: 'skip',
        },
        {
          id: 'r-invalid',
          destination: 'expense',
          data: { description: '', amount: 0 },
          confidence: 0.3,
          corrected: false,
          action: 'commit',
        },
      ]);
      const preview = await service.upload(
        businessId,
        'general',
        makeFile({ buffer: Buffer.concat([PNG_BYTES, Buffer.from('b')]) }),
      );

      const result = await service.commit(businessId, preview.batchId);
      expect(result.created).toEqual({
        customer: 1,
        product: 1,
        expense: 1, // the valid one; r-skipped and r-invalid don't count
        supplier: 1,
        credit_opening_balance: 1,
      });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].rowId).toBe('r-invalid');

      const customer = await prisma.customer.findFirst({
        where: { businessId, phone: '+14155551234' },
      });
      expect(customer?.name).toBe('Alex');

      const product = await prisma.product.findFirst({
        where: { businessId, name: 'Gadget' },
      });
      expect(Number(product?.sellingPrice)).toBe(40);

      const supplier = await prisma.supplier.findFirst({
        where: { businessId, name: 'Acme Supply Co' },
      });
      expect(supplier).not.toBeNull();

      const creditCustomer = await prisma.customer.findFirst({
        where: { businessId, phone: '+14155555678' },
      });
      const creditEntry = await prisma.creditEntry.findFirst({
        where: { businessId, customerId: creditCustomer?.id },
      });
      expect(Number(creditEntry?.amount)).toBe(30);

      const expenses = await prisma.expense.findMany({ where: { businessId } });
      expect(expenses.some((e) => e.description === 'Owner marked N/A')).toBe(
        false,
      );

      const batch = await prisma.importBatch.findUniqueOrThrow({
        where: { id: preview.batchId },
      });
      expect(batch.status).toBe('completed');
    });

    it('rejects committing the same scan twice', async () => {
      vision.extract.mockResolvedValue([]);
      const preview = await service.upload(
        businessId,
        'general',
        makeFile({ buffer: Buffer.concat([PNG_BYTES, Buffer.from('c')]) }),
      );
      await service.commit(businessId, preview.batchId);

      await expect(
        service.commit(businessId, preview.batchId),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('history()', () => {
    it('lists only real photo-sourced batches for this business', async () => {
      const history = await service.history(businessId);
      expect(history.length).toBeGreaterThan(0);
      expect(history.every((b) => b.source === 'photo')).toBe(true);
    });
  });
});
