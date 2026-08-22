// file-type (used by validateUploadedFile) is ESM-only and breaks ts-jest's CommonJS transform —
// same pattern already established in customer-import.service.spec.ts.
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import {
  ProductsImportService,
  type UploadedFile,
} from './products-import.service';
import type { S3Service } from '../common/storage/s3.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

function csvFile(content: string): UploadedFile {
  const buffer = Buffer.from(content, 'utf-8');
  return {
    buffer,
    size: buffer.length,
    mimetype: 'text/csv',
    originalname: 'import.csv',
  };
}

describe('ProductsImportService (BE-024 + UPD-FE-070 column mapping)', () => {
  let prisma: PrismaService;
  let service: ProductsImportService;
  let businessId: string;
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/errors.csv'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ProductsImportService(
      tenantPrisma,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Products Import Test Biz',
        slug: `products-import-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  describe('legacy import() (canonical column names)', () => {
    it('creates real products from a canonical CSV and reports a real error for a bad row', async () => {
      const file = csvFile(
        'name,kind,category,sku,costPrice,sellingPrice,stockQty\n' +
          'Legacy Widget,product,Retail,LEG-1,5,10,20\n' +
          ',product,Retail,LEG-2,5,10,20\n',
      );
      const result = await service.import(businessId, file);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errorsFileUrl).toBe('https://signed.example/errors.csv');

      const created = await prisma.product.findFirst({
        where: { businessId, sku: 'LEG-1' },
      });
      expect(created?.name).toBe('Legacy Widget');
    });
  });

  describe('parse() — real column-mapping preview', () => {
    it('auto-suggests a real mapping from common header names and returns a real per-row confidence', async () => {
      const file = csvFile(
        'Product Name,Type,Category,SKU,Cost,Price,Qty\n' +
          'Mapped Widget,product,Retail,MAP-1,4,9,15\n',
      );
      const preview = await service.parse(file);
      expect(preview.suggestedMapping['Product Name']).toBe('name');
      expect(preview.suggestedMapping['Type']).toBe('kind');
      expect(preview.suggestedMapping['Cost']).toBe('costPrice');
      expect(preview.suggestedMapping['Price']).toBe('sellingPrice');
      expect(preview.suggestedMapping['Qty']).toBe('stockQty');

      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0].valid).toBe(true);
      expect(preview.rows[0].confidence).toBe(1);
      expect(preview.rows[0].mapped.name).toBe('Mapped Widget');
    });

    it('flags a real invalid row (bad price) with confidence 0 and a real reason, without writing anything', async () => {
      const file = csvFile(
        'name,costPrice,sellingPrice\nBroken Row,5,not-a-number\n',
      );
      const preview = await service.parse(file);
      expect(preview.rows[0].valid).toBe(false);
      expect(preview.rows[0].confidence).toBe(0);
      expect(preview.rows[0].error).toContain('sellingPrice');

      const stillNothing = await prisma.product.findFirst({
        where: { businessId, name: 'Broken Row' },
      });
      expect(stillNothing).toBeNull();
    });

    it('lowers confidence (but keeps the row valid) when an unmapped column silently defaulted', async () => {
      const file = csvFile('name,sellingPrice\nNo Category Item,12\n');
      const preview = await service.parse(file);
      expect(preview.rows[0].valid).toBe(true);
      expect(preview.rows[0].confidence).toBeLessThan(1);
    });
  });

  describe('commit() — real mapping + corrections + skip applied server-side', () => {
    it('creates real products using a real custom mapping (arbitrary file headers)', async () => {
      const file = csvFile('Item,Sell For\nCustom Mapped Item,18\n');
      const result = await service.commit(
        businessId,
        file,
        { Item: 'name', 'Sell For': 'sellingPrice' },
        [],
        [],
      );
      expect(result.created).toBe(1);
      const created = await prisma.product.findFirst({
        where: { businessId, name: 'Custom Mapped Item' },
      });
      expect(created).not.toBeNull();
      expect(Number(created!.sellingPrice)).toBe(18);
    });

    it('applies a real hand-correction to a row before writing it', async () => {
      const file = csvFile('name,sellingPrice\nTypo Nam,10\n');
      const result = await service.commit(
        businessId,
        file,
        { name: 'name', sellingPrice: 'sellingPrice' },
        [],
        [
          {
            rowNumber: 2,
            data: { name: 'Corrected Name', sellingPrice: '10' },
          },
        ],
      );
      expect(result.created).toBe(1);
      const created = await prisma.product.findFirst({
        where: { businessId, name: 'Corrected Name' },
      });
      expect(created).not.toBeNull();
      const wrongOne = await prisma.product.findFirst({
        where: { businessId, name: 'Typo Nam' },
      });
      expect(wrongOne).toBeNull();
    });

    it('never writes a real product for a row the caller explicitly skipped', async () => {
      const file = csvFile('name,sellingPrice\nKeep Me,5\nSkip Me,5\n');
      const result = await service.commit(
        businessId,
        file,
        { name: 'name', sellingPrice: 'sellingPrice' },
        [3], // "Skip Me" is row 3 (row 2 is "Keep Me")
        [],
      );
      expect(result.created).toBe(1);
      const kept = await prisma.product.findFirst({
        where: { businessId, name: 'Keep Me' },
      });
      const skipped = await prisma.product.findFirst({
        where: { businessId, name: 'Skip Me' },
      });
      expect(kept).not.toBeNull();
      expect(skipped).toBeNull();
    });
  });
});
