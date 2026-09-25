/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers (`expect.objectContaining`) are typed `any`. */
import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
} from '../common/tenancy/tenant.constants';
import { S3Service } from '../common/storage/s3.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { DigitizerVisionService } from './digitizer-vision.service';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerLookupService } from './digitizer-lookup.service';
import { DigitizerAssessmentService } from './digitizer-assessment.service';
import { DigitizerPipelineService } from './digitizer-pipeline.service';
import { DigitizerViewService } from './digitizer-view.service';
import { DigitizerImportService } from './digitizer-import.service';
import { DigitizerInsightsService } from './digitizer-insights.service';
import { DigitizerSettingsService } from './digitizer-settings.service';
import { DigitizerService } from './digitizer.service';
import { AppException } from '../common/filters/app.exception';
import {
  DigitizerDestination,
  DigitizerRow,
  ExtractionResult,
  ScannerType,
} from './digitizer.types';

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

// Smallest possible valid 1x1 PNG — every upload appends a counter so each file hashes differently.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
let fileCounter = 0;
function makeFile(name = 'scan.png') {
  fileCounter += 1;
  const buffer = Buffer.concat([
    PNG_BYTES,
    Buffer.from(`-${fileCounter}-${Date.now()}`),
  ]);
  return {
    buffer,
    mimetype: 'image/png',
    originalname: name,
    size: buffer.length,
  };
}

function row(
  destination: DigitizerDestination,
  data: DigitizerRow['data'],
  over: Partial<DigitizerRow> = {},
): DigitizerRow {
  return {
    id: randomUUID(),
    destination,
    data,
    original: { ...data },
    confidence: 0.95,
    corrected: false,
    reviewed: false,
    action: 'commit',
    ...over,
  };
}

function extraction(
  rows: DigitizerRow[],
  analysis: Partial<ExtractionResult['analysis']> = {},
): ExtractionResult {
  return {
    rows,
    analysis: {
      documentKind: 'customer_list',
      typeConfidence: 0.95,
      title: null,
      handwriting: 'handwritten',
      language: 'English',
      quality: {
        legible: true,
        blur: 'none',
        glare: 'none',
        shadow: 'none',
        skew: 'none',
        cutOff: false,
        notes: null,
      },
      invoiceNumber: null,
      supplier: null,
      documentDate: null,
      currency: null,
      lineItems: [],
      totals: null,
      ledger: null,
      extractionModel: 'test-model',
      ...analysis,
    },
  };
}

describe('Digitizer document workspace', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let businessId: string;
  let userId: string;
  let service: DigitizerService;
  let pipeline: DigitizerPipelineService;
  let view: DigitizerViewService;
  let importer: DigitizerImportService;
  let insights: DigitizerInsightsService;
  let settings: DigitizerSettingsService;
  let scheduleSpy: jest.SpyInstance;

  const vision = { extractDocument: jest.fn(), extract: jest.fn() };
  const s3 = {
    upload: jest.fn(),
    getSignedDownloadUrl: jest.fn(),
    delete: jest.fn(),
    readObject: jest.fn(),
    storageMode: jest.fn().mockReturnValue('local'),
  };
  const aiInfra = { createMessage: jest.fn() };
  const createdUserIds: string[] = [];

  /** Uploads a file, runs the pipeline to completion with a canned extraction, and returns the detail. */
  async function stage(
    scanner: ScannerType,
    result: ExtractionResult,
    name = 'scan.png',
  ) {
    vision.extractDocument.mockResolvedValueOnce(result);
    const file = makeFile(name);
    const up = await service.upload(businessId, userId, scanner, file);
    await pipeline.run(up.id, file.buffer);
    return view.detail(businessId, up.id);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const aliases = new DigitizerAliasService(tenantPrisma);
    const lookup = new DigitizerLookupService(prisma);
    const assessment = new DigitizerAssessmentService(prisma, lookup);
    pipeline = new DigitizerPipelineService(
      prisma,
      s3 as unknown as S3Service,
      vision as unknown as DigitizerVisionService,
      assessment,
    );
    scheduleSpy = jest
      .spyOn(pipeline, 'schedule')
      .mockImplementation(() => undefined);
    view = new DigitizerViewService(prisma, assessment, pipeline);
    importer = new DigitizerImportService(prisma, assessment, view);
    service = new DigitizerService(
      prisma,
      s3 as unknown as S3Service,
      aliases,
      pipeline,
      assessment,
      view,
    );
    insights = new DigitizerInsightsService(
      prisma,
      view,
      aiInfra as unknown as AiInfraService,
    );
    const policies = new PoliciesService(
      prisma,
      cls as unknown as ClsService,
      {} as CapabilitiesService,
    );
    settings = new DigitizerSettingsService(
      policies,
      s3 as unknown as S3Service,
      aliases,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Digitizer Test Biz',
        slug: `digitizer-test-${Date.now()}`,
        country: 'PK',
        currency: 'PKR',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_ROLE, 'owner');

    const user = await prisma.user.create({
      data: {
        name: 'Olivia Smith',
        email: `olivia-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
    createdUserIds.push(user.id);
  });

  beforeEach(() => {
    s3.upload.mockResolvedValue(undefined);
    s3.delete.mockResolvedValue(undefined);
    s3.getSignedDownloadUrl.mockResolvedValue(
      'https://files.example/original.png',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    vision.extractDocument.mockReset();
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.importBatch.deleteMany({ where: { businessId } });
    await prisma.digitizerAlias.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  // ───────────────────────── upload & pipeline ─────────────────────────

  describe('upload and pipeline', () => {
    it('accepts a file instantly as a queued document — extraction is not awaited', async () => {
      const file = makeFile('register.png');
      const up = await service.upload(
        businessId,
        userId,
        'customer_list',
        file,
        'group-A',
      );

      expect(up.status).toBe('queued');
      expect(up.reused).toBe(false);
      expect(up.rows).toEqual([]);
      expect(up.uploadedBy?.name).toBe('Olivia Smith');
      expect(up.originalName).toBe('register.png');
      expect(up.groupId).toBe('group-A');
      expect(
        up.quality.rows.find((r) => r.key === 'resolution')?.detail,
      ).toContain('1 × 1 px');
      expect(s3.upload).toHaveBeenCalledWith(
        expect.stringContaining(`digitizer/${businessId}/`),
        file.buffer,
        'image/png',
      );
      expect(scheduleSpy).toHaveBeenCalledWith(up.id, file.buffer);
      expect(vision.extractDocument).not.toHaveBeenCalled();
    });

    it('runs every stage for real and stores what the model reported', async () => {
      const doc = await stage(
        'customer_list',
        extraction(
          [row('customer', { name: 'Ahmed Khan', phone: '0300-1234567' })],
          {
            title: 'Customer register · pages 1–3',
            language: 'Urdu and English',
          },
        ),
      );

      expect(doc.status).toBe('ready');
      expect(doc.name).toBe('Customer register · pages 1–3');
      expect(doc.language).toBe('Urdu and English');
      expect(doc.handwriting).toBe('handwritten');
      expect(doc.kindLabel).toBe('Customer list');
      expect(doc.counts.rows).toBe(1);
      expect(doc.events.map((e) => e.action)).toEqual([
        'uploaded',
        'extracted',
      ]);
      expect(vision.extractDocument).toHaveBeenCalledWith(
        businessId,
        'customer_list',
        expect.any(Buffer),
        'image/png',
        1,
      );
    });

    it('fails a photo the model calls illegible, keeps the original, and says why', async () => {
      const doc = await stage(
        'general',
        extraction(
          [row('customer', { name: 'Guess', phone: '0300-0000000' })],
          {
            quality: {
              legible: false,
              blur: 'severe',
              glare: 'none',
              shadow: 'none',
              skew: 'none',
              cutOff: false,
              notes: 'out of focus',
            },
          },
        ),
      );
      expect(doc.status).toBe('failed');
      expect(doc.failureReason).toContain('not legible');
      expect(doc.failureReason).toContain('out of focus');
      expect(doc.rows).toEqual([]); // the guesses were discarded, not staged
      expect(doc.originalRetained).toBe(true);
    });

    it('keeps the rows when the owner has turned the unreadable check off', async () => {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: { 'digitizer.rejectUnreadable': false } },
      });
      const doc = await stage(
        'general',
        extraction(
          [row('customer', { name: 'Maybe', phone: '0300-1231231' })],
          {
            quality: {
              legible: false,
              blur: 'mild',
              glare: 'none',
              shadow: 'none',
              skew: 'none',
              cutOff: false,
              notes: null,
            },
          },
        ),
      );
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: {} },
      });
      expect(doc.status).not.toBe('failed');
      expect(doc.counts.rows).toBe(1);
    });

    it('fails with a clear reason when nothing importable was read, and explains booking registers honestly', async () => {
      const empty = await stage('general', extraction([]));
      expect(empty.status).toBe('failed');
      expect(empty.failureReason).toContain('No records could be read');

      const booking = await stage(
        'general',
        extraction([], { documentKind: 'booking_register' }),
      );
      expect(booking.failureReason).toContain('booking register');
      expect(booking.failureReason).toContain('cannot import');
    });

    it('records a model outage as a failed document instead of crashing, and names the stage', async () => {
      vision.extractDocument.mockRejectedValueOnce(
        new AppException(
          'DIGITIZER_EXTRACTION_UNAVAILABLE',
          'Photo scanning is not available right now — please try again shortly.',
          503,
        ),
      );
      const file = makeFile();
      const up = await service.upload(businessId, userId, 'receipt', file);
      await pipeline.run(up.id, file.buffer);
      const doc = await view.detail(businessId, up.id);
      expect(doc.status).toBe('failed');
      expect(doc.failureReason).toContain('not available right now');
      expect(doc.events.at(-1)?.detail).toContain('Stopped at extraction');
    });

    it('shows an already-scanned file again instead of paying for a second read', async () => {
      const file = makeFile();
      vision.extractDocument.mockResolvedValueOnce(
        extraction([row('customer', { name: 'Sara', phone: '0300-1234567' })]),
      );
      const first = await service.upload(
        businessId,
        userId,
        'customer_list',
        file,
      );
      await pipeline.run(first.id, file.buffer);

      const again = await service.upload(
        businessId,
        userId,
        'customer_list',
        file,
      );
      expect(again.id).toBe(first.id);
      expect(again.reused).toBe(true);
      expect(scheduleSpy).toHaveBeenCalledTimes(1);
    });

    it('retries a failed scan when the same file is uploaded again, keeping the failed read as version 1', async () => {
      vision.extractDocument.mockRejectedValueOnce(new Error('boom'));
      const file = makeFile();
      const first = await service.upload(
        businessId,
        userId,
        'customer_list',
        file,
      );
      await pipeline.run(first.id, file.buffer);
      expect((await view.detail(businessId, first.id)).status).toBe('failed');

      const retry = await service.upload(
        businessId,
        userId,
        'customer_list',
        file,
      );
      expect(retry.id).toBe(first.id);
      expect(retry.reused).toBe(false);
      expect(retry.version).toBe(2);
      expect(retry.status).toBe('queued');
      expect(retry.versions).toHaveLength(1);
    });

    it('fails a document stuck in processing after a restart instead of leaving it queued forever', async () => {
      const file = makeFile();
      const up = await service.upload(businessId, userId, 'receipt', file);
      // updatedAt is managed by Prisma and stored in UTC — age it with raw SQL.
      await prisma.$executeRaw`UPDATE import_batches SET updated_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ${up.id}`;
      const doc = await view.detail(businessId, up.id);
      expect(doc.status).toBe('failed');
      expect(doc.failureReason).toContain('interrupted');
    });
  });

  // ───────────────────────── validation & duplicates ─────────────────────────

  describe('duplicates against real records', () => {
    it('flags a phone match as a strong duplicate and holds the row until the owner decides', async () => {
      const existing = await prisma.customer.create({
        data: {
          businessId,
          name: 'Ahmed Khan',
          phone: '+923001234567',
          consentMarketing: true,
        },
      });
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Ahmed Khan', phone: '0300-1234567' }),
        ]),
      );

      const r = doc.rows[0];
      expect(r.duplicate?.level).toBe('high');
      expect(r.duplicate?.existing.id).toBe(existing.id);
      expect(r.duplicate?.phoneMatch).toBe(true);
      expect(r.state).toBe('blocked');
      expect(r.blockedBy).toBe('duplicate');
      expect(doc.status).toBe('needs_review');
      expect(doc.counts.duplicates).toBe(1);

      const decided = await service.updateRow(
        businessId,
        userId,
        r.id,
        { duplicateDecision: 'use_existing' },
        doc.id,
      );
      expect(decided.rows[0].state).toBe('ready');
      expect(decided.rows[0].plan).toBe('skip');
    });

    it('refuses "create new" for a phone match — phone numbers are unique', async () => {
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Fatima Ali',
          phone: '+923004445556',
          consentMarketing: true,
        },
      });
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Fatima Ali', phone: '0300-4445556' }),
        ]),
      );
      await expect(
        service.updateRow(
          businessId,
          userId,
          doc.rows[0].id,
          { duplicateDecision: 'create_new' },
          doc.id,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DIGITIZER_DUPLICATE_DECISION_INVALID',
        }),
      });
    });

    it('treats a name-only match with a different phone as a weak flag, never a block on its own', async () => {
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Muhammad Hassan',
          phone: '+923009990001',
          consentMarketing: true,
        },
      });
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Muhammad Hassan', phone: '0300-7778889' }),
        ]),
      );
      const r = doc.rows[0];
      expect(r.duplicate?.level).toBe('low');
      expect(r.duplicate?.nameMatch).toBe(true);
      expect(r.duplicate?.phoneMatch).toBe(false);
      expect(r.state).toBe('needs_review');
      const accepted = await service.updateRow(
        businessId,
        userId,
        r.id,
        { reviewed: true },
        doc.id,
      );
      expect(accepted.rows[0].state).toBe('ready');
      expect(accepted.rows[0].plan).toBe('create');
    });

    it('honours the owner’s matching settings', async () => {
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Nadia Iqbal',
          phone: '+923034445556',
          consentMarketing: true,
        },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: {
          policies: {
            'digitizer.matchOnPhone': false,
            'digitizer.flagNameOnlyMatch': false,
          },
        },
      });
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Nadia Iqbal', phone: '0303-4445556' }),
        ]),
      );
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: {} },
      });
      expect(doc.rows[0].duplicate).toBeNull();
    });

    it('flags two rows in the same scan with the same phone', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Twin One', phone: '0300-5551111' }),
          row('customer', { name: 'Twin Two', phone: '0300-5551111' }),
        ]),
      );
      expect(doc.rows[0].duplicate).toBeNull();
      expect(doc.rows[1].duplicate?.level).toBe('high');
      expect(doc.rows[1].duplicate?.basis).toContain(
        'earlier in this document',
      );
    });

    it('matches inventory rows to catalog products by SKU and holds unmatched ones', async () => {
      await prisma.product.create({
        data: {
          businessId,
          name: 'Hair Serum',
          sku: 'HS-100',
          stockQty: 10,
          sellingPrice: 100,
          costPrice: 60,
        },
      });
      const doc = await stage(
        'inventory_sheet',
        extraction(
          [
            row('inventory', { sku: 'hs-100', countedQty: 12 }),
            row('inventory', { name: 'Unknown Gadget', countedQty: 3 }),
          ],
          { documentKind: 'inventory_sheet' },
        ),
      );
      expect(doc.rows[0].product?.name).toBe('Hair Serum');
      expect(doc.rows[0].plan).toBe('update');
      expect(doc.rows[1].state).toBe('blocked');
      expect(
        doc.rows[1].issues.some((i) => i.code === 'unmatched_product'),
      ).toBe(true);
      expect(doc.issues.some((i) => i.code === 'unmatched_product')).toBe(true);
    });
  });

  // ───────────────────────── corrections ─────────────────────────

  describe('corrections', () => {
    it('records a typed value as the owner’s own, keeps the model’s read, and learns text corrections only', async () => {
      const doc = await stage(
        'product',
        extraction(
          [
            row(
              'product',
              { name: 'Sprte', sellingPrice: 2, sku: 'abc' },
              {
                fieldConfidence: { name: 0.4, sellingPrice: 0.9, sku: 0.9 },
                confidence: 0.9,
              },
            ),
          ],
          { documentKind: 'product_list' },
        ),
      );
      expect(doc.rows[0].state).toBe('needs_review');

      const fixed = await service.updateRow(
        businessId,
        userId,
        doc.rows[0].id,
        { data: { name: 'Sprite', sku: 'ABC-1' } },
        doc.id,
      );
      const r = fixed.rows[0];
      expect(r.corrected).toBe(true);
      expect(r.reviewed).toBe(true);
      expect(r.state).toBe('ready');
      expect(r.fields.find((f) => f.field === 'name')?.original).toBe('Sprte');
      expect(r.fields.find((f) => f.field === 'name')?.value).toBe('Sprite');
      expect(fixed.events.at(-1)?.action).toBe('corrected');

      const aliases = await prisma.digitizerAlias.findMany({
        where: { businessId },
      });
      expect(aliases.map((a) => [a.rawText, a.correctedText])).toContainEqual([
        'Sprte',
        'Sprite',
      ]);
      expect(aliases.some((a) => a.rawText.toLowerCase() === 'abc')).toBe(
        false,
      ); // a SKU is not free text
    });

    it('accepts every low-confidence row at once but never rows that have errors', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row(
            'customer',
            { name: 'Low One', phone: '0300-1110001' },
            { fieldConfidence: { name: 0.9, phone: 0.3 } },
          ),
          row(
            'customer',
            { name: 'Low Two', phone: '0300-1110002' },
            { fieldConfidence: { name: 0.9, phone: 0.3 } },
          ),
          row(
            'customer',
            { name: null, phone: '0300-1110003' },
            { fieldConfidence: { name: null, phone: 0.9 } },
          ),
        ]),
      );
      const accepted = await service.acceptAll(businessId, userId, doc.id);
      expect(accepted.rows.map((r) => r.state)).toEqual([
        'ready',
        'ready',
        'blocked',
      ]);
    });

    it('re-runs the reconciliation when the owner corrects a figure — nothing is adjusted for them', async () => {
      const doc = await stage(
        'invoice',
        extraction(
          [
            row('expense', {
              description: 'Zenith · ZB-1',
              amount: 1500,
              incurredOn: '2026-09-01',
            }),
          ],
          {
            documentKind: 'purchase_invoice',
            lineItems: [
              {
                description: 'A',
                quantity: 1,
                unitPrice: 1000,
                lineTotal: 1000,
              },
              {
                description: 'B',
                quantity: null,
                unitPrice: 500,
                lineTotal: null,
              },
            ],
            totals: {
              subtotal: null,
              tax: null,
              discount: null,
              printedTotal: 1500,
            },
          },
        ),
      );
      expect(doc.status).toBe('total_mismatch');
      expect(doc.reconciliation?.difference).toBe(500);
      expect(doc.reconciliation?.unreadableLines).toEqual([
        { index: 2, missing: ['quantity', 'line total'] },
      ]);
      expect(doc.rows[0].state).toBe('blocked');

      const fixed = await service.updateTable(businessId, userId, doc.id, {
        lineItems: [
          { description: 'A', quantity: 1, unitPrice: 1000, lineTotal: 1000 },
          { description: 'B', quantity: 1, unitPrice: 500, lineTotal: 500 },
        ],
      });
      expect(fixed.reconciliation?.ok).toBe(true);
      expect(fixed.status).toBe('ready');
      expect(fixed.events.at(-1)?.action).toBe('table_corrected');
    });

    it('will not edit a row that was already imported', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Done Person', phone: '0300-8880001' }),
        ]),
      );
      await importer.commit(businessId, userId, doc.id);
      await expect(
        service.updateRow(
          businessId,
          userId,
          doc.rows[0].id,
          { data: { name: 'Changed' } },
          doc.id,
        ),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  // ───────────────────────── import ─────────────────────────

  describe('import', () => {
    it('writes exactly the ready rows, stores the outcome on every row, and holds the rest in review', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', {
            name: 'Sarah Malik',
            phone: '0301-9876543',
            email: 'Sarah@Example.pk',
            address: 'House 4, Lahore',
            balance: 1500,
          }),
          row('customer', { name: 'Bilal Ahmed', phone: '0302-5551234' }),
          row(
            'customer',
            { name: 'Blurry', phone: '0302-0000000' },
            { fieldConfidence: { name: 0.9, phone: 0.2 } },
          ),
          row(
            'customer',
            { name: null, phone: '0302-1112222' },
            { fieldConfidence: { name: null, phone: 0.9 } },
          ),
        ]),
      );
      expect(doc.importPreview.counts).toMatchObject({
        create: 2,
        update: 0,
        skip: 0,
        blocked: 2,
        written: 0,
      });
      expect(doc.importPreview.blocked).toMatchObject({
        lowConfidence: 1,
        invalid: 1,
      });

      const { job, document } = await importer.commit(
        businessId,
        userId,
        doc.id,
      );

      expect(job.created).toBe(2);
      expect(job.blocked).toBe(2);
      expect(job.id).toMatch(/^IMP-[0-9A-F]{6}$/);
      const sarah = await prisma.customer.findFirst({
        where: { businessId, phone: '+923019876543' },
      });
      expect(sarah).toMatchObject({
        name: 'Sarah Malik',
        email: 'sarah@example.pk',
        address: 'House 4, Lahore',
        consentMarketing: false,
      });
      const credit = await prisma.creditEntry.findMany({
        where: { businessId, customerId: sarah!.id },
      });
      expect(credit).toHaveLength(1);
      expect(Number(credit[0].amount)).toBe(1500);
      expect(
        await prisma.customer.count({
          where: { businessId, name: { in: ['Blurry'] } },
        }),
      ).toBe(0); // held rows were not written

      expect(document.status).toBe('needs_review'); // not "imported": two rows still need a human
      expect(document.rows.filter((r) => r.state === 'imported')).toHaveLength(
        2,
      );
      expect(
        document.rows.filter((r) => r.result?.status === 'created'),
      ).toHaveLength(2);
      expect(document.jobs).toHaveLength(1);
    });

    it('never imports the same row twice, and completes the document once every row is resolved', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Retry One', phone: '0300-3330001' }),
          row(
            'customer',
            { name: 'Retry Two', phone: '0300-3330002' },
            { fieldConfidence: { name: 0.9, phone: 0.3 } },
          ),
        ]),
      );
      await importer.commit(businessId, userId, doc.id);
      expect(
        await prisma.customer.count({
          where: { businessId, name: { startsWith: 'Retry' } },
        }),
      ).toBe(1);

      await service.acceptAll(businessId, userId, doc.id);
      const second = await importer.commit(businessId, userId, doc.id);
      expect(second.job.created).toBe(1); // only the row that had not yet imported
      expect(
        await prisma.customer.count({
          where: { businessId, name: { startsWith: 'Retry' } },
        }),
      ).toBe(2);
      expect(second.document.status).toBe('imported');

      await expect(
        importer.commit(businessId, userId, doc.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DIGITIZER_ALREADY_COMMITTED',
        }),
      });
    });

    it('refuses to import when everything is blocked', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row(
            'customer',
            { name: null, phone: null },
            { fieldConfidence: { name: null, phone: null } },
          ),
        ]),
      );
      await expect(
        importer.commit(businessId, userId, doc.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DIGITIZER_NOTHING_TO_IMPORT',
        }),
      });
    });

    it('writes an expense with the scan as its receipt, the real date, and never defaults a missing date', async () => {
      const doc = await stage(
        'receipt',
        extraction(
          [
            row('expense', {
              description: 'Fuel',
              amount: 40,
              category: 'Transport',
              incurredOn: '2026-09-01',
            }),
            row(
              'expense',
              { description: 'Undated', amount: 10, incurredOn: null },
              { fieldConfidence: { incurredOn: null } },
            ),
          ],
          { documentKind: 'sales_receipt' },
        ),
      );
      expect(doc.rows[1].state).toBe('blocked');
      await importer.commit(businessId, userId, doc.id);
      const expense = await prisma.expense.findFirst({
        where: { businessId, description: 'Fuel' },
      });
      expect(expense?.receiptKey).toBeTruthy();
      expect(expense?.incurredOn.toISOString().slice(0, 10)).toBe('2026-09-01');
      expect(
        await prisma.expense.count({
          where: { businessId, description: 'Undated' },
        }),
      ).toBe(0);
    });

    it('updates stock from a count with an adjustment movement, and skips a count that already matches', async () => {
      const product = await prisma.product.create({
        data: {
          businessId,
          name: 'Stock Item',
          sku: 'ST-1',
          stockQty: 10,
          sellingPrice: 5,
          costPrice: 2,
        },
      });
      const same = await prisma.product.create({
        data: {
          businessId,
          name: 'Same Item',
          sku: 'ST-2',
          stockQty: 7,
          sellingPrice: 5,
          costPrice: 2,
        },
      });
      const doc = await stage(
        'inventory_sheet',
        extraction(
          [
            row('inventory', { sku: 'ST-1', countedQty: 14 }),
            row('inventory', { sku: 'ST-2', countedQty: 7 }),
          ],
          { documentKind: 'inventory_sheet' },
        ),
      );

      const { job } = await importer.commit(businessId, userId, doc.id);
      expect(job).toMatchObject({ updated: 1, skipped: 1, failed: 0 });
      expect(
        (await prisma.product.findUnique({ where: { id: product.id } }))
          ?.stockQty,
      ).toBe(14);
      expect(
        (await prisma.product.findUnique({ where: { id: same.id } }))?.stockQty,
      ).toBe(7);
      const movements = await prisma.stockMovement.findMany({
        where: { businessId, productId: product.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ kind: 'adjustment', qty: 4 });
    });

    it('imports a new product and a supplier, and a credit row attaches to an existing customer', async () => {
      const cust = await prisma.customer.create({
        data: {
          businessId,
          name: 'Credit Person',
          phone: '+923007770001',
          consentMarketing: true,
        },
      });
      const doc = await stage(
        'general',
        extraction([
          row('product', {
            name: 'New Widget',
            sku: 'nw-9',
            sellingPrice: 20,
            costPrice: 12,
            stockQty: 3,
          }),
          row('supplier', {
            name: 'Meridian Imports',
            phone: '0300-6660001',
            email: 'Buy@Meridian.com',
          }),
          row('credit_opening_balance', {
            customerName: 'Credit Person',
            phone: '0300-7770001',
            amount: 900,
          }),
        ]),
      );
      expect(doc.rows[2].plan).toBe('update'); // the customer already exists

      await importer.commit(businessId, userId, doc.id);
      expect(
        await prisma.product.findFirst({
          where: { businessId, name: 'New Widget' },
        }),
      ).toMatchObject({ sku: 'NW-9', stockQty: 3 });
      expect(
        await prisma.supplier.findFirst({
          where: { businessId, name: 'Meridian Imports' },
        }),
      ).toMatchObject({ phone: '+923006660001', email: 'buy@meridian.com' });
      const entries = await prisma.creditEntry.findMany({
        where: { businessId, customerId: cust.id },
      });
      expect(entries).toHaveLength(1);
      expect(
        await prisma.customer.count({
          where: { businessId, phone: '+923007770001' },
        }),
      ).toBe(1); // not duplicated
    });

    it('blocks every credit row while the ledger does not reconcile', async () => {
      const doc = await stage(
        'credit_ledger',
        extraction(
          [
            row('credit_opening_balance', {
              customerName: 'Ledger A',
              phone: '0300-4440001',
              amount: 100,
            }),
          ],
          {
            documentKind: 'credit_ledger',
            ledger: {
              openingBalance: 0,
              entries: [{ description: 'Sale', amount: 100, kind: 'charge' }],
              statedClosingBalance: 130,
            },
          },
        ),
      );
      expect(doc.status).toBe('unbalanced');
      expect(doc.reconciliation?.difference).toBe(30);
      expect(doc.rows[0].state).toBe('blocked');
      expect(doc.importPreview.highRisk).toBe(true);
      expect(doc.importPreview.canImport).toBe(false);
      await expect(
        importer.commit(businessId, userId, doc.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DIGITIZER_NOTHING_TO_IMPORT',
        }),
      });
    });
  });

  // ───────────────────────── lifecycle ─────────────────────────

  describe('reprocess, approve, delete', () => {
    it('reprocesses as a new version, keeping the earlier extraction and the owner’s corrections in version 1', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Version One', phone: '0300-2220001' }),
        ]),
      );
      await service.updateRow(
        businessId,
        userId,
        doc.rows[0].id,
        { data: { name: 'Version One Fixed' } },
        doc.id,
      );

      const re = await service.reprocess(businessId, userId, doc.id, 'general');
      expect(re.version).toBe(2);
      expect(re.status).toBe('queued');
      expect(re.versions).toEqual([
        expect.objectContaining({ version: 1, rows: 1, corrected: 1 }),
      ]);
      expect(re.classification.requestedScanner).toBe('general');
      const stored = await prisma.importBatch.findUnique({
        where: { id: doc.id },
      });
      const snapshot = (
        stored!.versions as unknown as { rows: DigitizerRow[] }[]
      )[0];
      expect(snapshot.rows[0].data.name).toBe('Version One Fixed');
      expect(scheduleSpy).toHaveBeenLastCalledWith(doc.id, undefined);
    });

    it('will not reprocess a document once some of its rows have been imported', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Imported Once', phone: '0300-2220002' }),
          row(
            'customer',
            { name: 'Not Yet', phone: '0300-2220003' },
            { fieldConfidence: { name: 0.9, phone: 0.2 } },
          ),
        ]),
      );
      await importer.commit(businessId, userId, doc.id);
      await expect(
        service.reprocess(businessId, userId, doc.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DIGITIZER_ROW_ALREADY_IMPORTED',
        }),
      });
    });

    it('approves only clean documents, and an edit withdraws the approval', async () => {
      const clean = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Clean Doc', phone: '0300-8880101' }),
        ]),
      );
      const dirty = await stage(
        'customer_list',
        extraction([
          row(
            'customer',
            { name: 'Dirty', phone: '0300-8880102' },
            { fieldConfidence: { name: 0.9, phone: 0.2 } },
          ),
        ]),
      );

      const result = await service.approve(businessId, userId, [
        clean.id,
        dirty.id,
        'no-such-doc',
      ]);
      expect(result.rejected).toEqual(
        expect.arrayContaining([
          { id: 'no-such-doc', reason: 'Document not found' },
        ]),
      );
      expect(result.rejected.find((r) => r.id === clean.id)).toBeUndefined();
      expect(result).toMatchObject({ approved: [clean.id] });
      expect(result.rejected.map((r) => r.id).sort()).toEqual(
        [dirty.id, 'no-such-doc'].sort(),
      );
      expect((await view.detail(businessId, clean.id)).approvedBy?.name).toBe(
        'Olivia Smith',
      );
      // Approval is not an import.
      expect(
        await prisma.customer.count({
          where: { businessId, name: 'Clean Doc' },
        }),
      ).toBe(0);

      await service.updateRow(
        businessId,
        userId,
        clean.rows[0].id,
        { data: { name: 'Clean Doc Edited' } },
        clean.id,
      );
      expect((await view.detail(businessId, clean.id)).approvedAt).toBeNull();
    });

    it('deletes the file and the extraction, and unlinks receipts of expenses already imported from it', async () => {
      const doc = await stage(
        'receipt',
        extraction(
          [
            row('expense', {
              description: 'Delete Me',
              amount: 12,
              incurredOn: '2026-09-02',
            }),
          ],
          { documentKind: 'sales_receipt' },
        ),
      );
      await importer.commit(businessId, userId, doc.id);
      const before = await prisma.expense.findFirst({
        where: { businessId, description: 'Delete Me' },
      });
      expect(before?.receiptKey).toBeTruthy();

      const out = await service.remove(businessId, userId, doc.id);
      expect(out.importedRecordsKept).toBe(1);
      expect(s3.delete).toHaveBeenCalledWith(before!.receiptKey);
      expect(
        await prisma.importBatch.findUnique({ where: { id: doc.id } }),
      ).toBeNull();
      const after = await prisma.expense.findUnique({
        where: { id: before!.id },
      });
      expect(after).not.toBeNull(); // the imported record stays
      expect(after?.receiptKey).toBeNull(); // but no longer points at a file that is gone
    });

    it('hands back a signed link to the untouched original', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Link Person', phone: '0300-1212121' }),
        ]),
        'link.png',
      );
      const out = await service.originalUrl(businessId, doc.id);
      expect(out).toEqual({
        url: 'https://files.example/original.png',
        name: 'link.png',
        mimeType: 'image/png',
      });
    });

    it('does not show one business’s documents to another', async () => {
      const doc = await stage(
        'customer_list',
        extraction([
          row('customer', { name: 'Private', phone: '0300-1313131' }),
        ]),
      );
      await expect(
        view.detail('some-other-business', doc.id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DIGITIZER_SCAN_NOT_FOUND' }),
      });
    });
  });

  // ───────────────────────── read models ─────────────────────────

  describe('read models', () => {
    it('computes the overview from the documents — every number is a count of something real', async () => {
      const o = await view.overview(businessId);
      const all = await view.documents(businessId, { limit: 200 });
      expect(o.kpis.imported).toBe(
        all.items.filter((d) => d.status === 'imported').length,
      );
      expect(o.kpis.failed).toBe(
        all.items.filter((d) => d.status === 'failed').length,
      );
      expect(o.kpis.readyToImport).toBe(
        all.items.filter((d) => d.status === 'ready').length,
      );
      expect(o.kpis.recordsWritten).toBe(
        all.items.reduce((n, d) => n + d.importedRecords, 0),
      );
      expect(
        o.kpis.highConfidence + o.kpis.mediumConfidence + o.kpis.lowConfidence,
      ).toBe(o.kpis.fieldsExtracted);
      expect(o.recent.length).toBeLessThanOrEqual(6);
      expect(o.stages.map((s) => s.key)).toEqual([
        'ready',
        'review',
        'processing',
        'imported',
        'failed',
        'queued',
      ]);
      expect(o.discrepancies.every((d) => d.message.length > 0)).toBe(true);
    });

    it('filters history by status, type, uploader and text', async () => {
      const failed = await view.documents(businessId, { status: 'failed' });
      expect(failed.items.length).toBeGreaterThan(0);
      expect(failed.items.every((d) => d.status === 'failed')).toBe(true);

      const mine = await view.documents(businessId, {
        uploaderId: userId,
        q: 'register.png',
      });
      expect(mine.items.every((d) => d.uploadedBy?.id === userId)).toBe(true);
      expect(mine.filters.uploaders).toEqual([
        { id: userId, name: 'Olivia Smith' },
      ]);

      const none = await view.documents(businessId, {
        q: 'zzz-no-such-document',
      });
      expect(none.total).toBe(0);
    });

    it('lists what is in progress with named stages and a real elapsed time', async () => {
      const file = makeFile('inflight.png');
      const up = await service.upload(businessId, userId, 'receipt', file);
      const q = await view.queue(businessId);
      const item = q.inProgress.find((d) => d.id === up.id);
      expect(item?.stageIndex).toBe(0);
      expect(item?.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(q.pipeline.map((p) => p.key)).toEqual([
        'queued',
        'quality',
        'extraction',
        'validation',
      ]);
      expect(q.kpis.queued).toBeGreaterThan(0);
    });

    it('builds the review queue from open documents: issues, duplicates, and rows that need a person', async () => {
      const r = await view.review(businessId);
      expect(r.totals.issues).toBe(r.issues.length);
      expect(r.issues.every((i) => i.documentId && i.title)).toBe(true);
      expect(r.duplicates.every((d) => d.duplicate.existing.name)).toBe(true);
    });

    it('shows original beside normalized in structured data, and filters by destination', async () => {
      const s = await view.structured(businessId, 'customer');
      expect(s.rows.every((x) => x.destination === 'customer')).toBe(true);
      const phone = s.rows.find(
        (x) => x.fieldLabel === 'Phone' && x.normalization,
      );
      expect(phone?.normalized).toMatch(/^\+92/);
      expect(phone?.original).not.toBe(phone?.normalized);
      expect(s.kpis.records).toBe(s.rows.length);
    });

    it('groups a multi-file upload into a batch with real gates', async () => {
      const groupId = `grp-${Date.now()}`;
      const results = [
        extraction([
          row('customer', { name: 'Batch Clean', phone: '0300-5050501' }),
        ]),
        extraction([
          row(
            'customer',
            { name: 'Batch Low', phone: '0300-5050502' },
            { fieldConfidence: { name: 0.9, phone: 0.2 } },
          ),
        ]),
      ];
      for (const r of results) {
        vision.extractDocument.mockResolvedValueOnce(r);
        const file = makeFile();
        const up = await service.upload(
          businessId,
          userId,
          'customer_list',
          file,
          groupId,
        );
        await pipeline.run(up.id, file.buffer);
      }
      const b = await view.batches(businessId, groupId);
      expect(b.group?.files).toBe(2);
      expect(b.group?.ready).toBe(1);
      expect(b.group?.needsReview).toBe(1);
      expect(b.group?.gates.find((g) => g.key === 'confidence')).toMatchObject({
        passing: 1,
        total: 2,
      });
      expect(b.group?.approvable.ids).toHaveLength(1);
      expect(b.group?.priority.find((p) => p.key === 'low')?.count).toBe(1);
      expect(b.groups.map((g) => g.groupId)).toContain(groupId);
    });

    it('lists real import jobs across documents', async () => {
      const i = await view.importOverview(businessId);
      expect(i.jobs.length).toBeGreaterThan(0);
      expect(i.jobs[0].id).toMatch(/^IMP-/);
      expect(
        i.jobs.every((j) =>
          ['completed', 'partial', 'failed'].includes(j.status),
        ),
      ).toBe(true);
    });
  });

  // ───────────────────────── assistant ─────────────────────────

  describe('assistant', () => {
    it('finds a gap in a supplier’s invoice numbers and a moving unit cost, from the documents alone', async () => {
      const inv = (number: string, date: string, unit: number) =>
        extraction(
          [
            row('expense', {
              description: `Gapco · ${number}`,
              amount: unit,
              incurredOn: date,
            }),
          ],
          {
            documentKind: 'purchase_invoice',
            supplier: 'Gapco',
            invoiceNumber: number,
            documentDate: date,
            lineItems: [
              {
                description: 'Hair Serum',
                quantity: 1,
                unitPrice: unit,
                lineTotal: unit,
              },
            ],
            totals: {
              subtotal: null,
              tax: null,
              discount: null,
              printedTotal: unit,
            },
          },
        );
      await stage('invoice', inv('GP-0838', '2026-07-12', 1331));
      await stage('invoice', inv('GP-0839', '2026-08-04', 1384));
      await stage('invoice', inv('GP-0842', '2026-08-28', 1440));

      const o = await insights.overview(businessId);
      const gap = o.findings.find((f) =>
        f.finding.includes('Invoice numbers skip'),
      );
      expect(gap?.kind).toBe('observed');
      expect(gap?.finding).toContain('GP-0840');
      expect(gap?.finding).toContain('GP-0841');
      expect(gap?.evidence).toContain('GP-0838, GP-0839, GP-0842');
      const cost = o.findings.find((f) =>
        f.finding.includes('Unit cost on Hair Serum'),
      );
      expect(cost?.finding).toContain('rose');
      expect(cost?.scope).toContain('3 invoices');
    });

    it('flags a stock count that jumps far above current stock, and a future-dated invoice, as anomalies', async () => {
      await prisma.product.create({
        data: {
          businessId,
          name: 'Jumpy',
          sku: 'JP-1',
          stockQty: 4,
          sellingPrice: 1,
          costPrice: 1,
        },
      });
      await stage(
        'inventory_sheet',
        extraction([row('inventory', { sku: 'JP-1', countedQty: 48 })], {
          documentKind: 'inventory_sheet',
          handwriting: 'handwritten',
        }),
      );
      await stage(
        'invoice',
        extraction(
          [
            row('expense', {
              description: 'Future Co · F-1',
              amount: 5,
              incurredOn: '2026-01-01',
            }),
          ],
          { documentKind: 'purchase_invoice', documentDate: '2099-01-01' },
        ),
      );

      const o = await insights.overview(businessId);
      const jump = o.anomalies.find((a) =>
        a.title.includes('Stock quantity up'),
      );
      expect(jump?.title).toBe('Stock quantity up 12×');
      expect(jump?.reason).toContain('handwritten');
      expect(
        o.anomalies.find((a) => a.title === 'Document dated in the future')
          ?.confidence,
      ).toBe('high');
    });

    it('answers "which rows need review" from the counts, and says so when there is nothing to answer', async () => {
      const a = await insights.ask(businessId, { key: 'review' });
      expect(a.source).toBe('data');
      expect(a.rows.some(([label]) => label === 'Ready without review')).toBe(
        true,
      );
      expect(a.primary?.href).toBe('/digitizer/review');

      const routed = await insights.ask(businessId, {
        question: 'which rows need review?',
      });
      expect(routed.title).toBe('Which rows need review?');
    });

    it('explains a mismatched total with the calculated and printed figures, unadjusted', async () => {
      await stage(
        'invoice',
        extraction(
          [
            row('expense', {
              description: 'Mismatch Co · M-1',
              amount: 2400,
              incurredOn: '2026-09-01',
            }),
          ],
          {
            documentKind: 'purchase_invoice',
            title: 'Mismatch invoice',
            lineItems: [
              {
                description: 'A',
                quantity: 2,
                unitPrice: 500,
                lineTotal: 1000,
              },
              {
                description: 'B',
                quantity: null,
                unitPrice: 1000,
                lineTotal: null,
              },
              { description: 'C', quantity: 1, unitPrice: 400, lineTotal: 400 },
            ],
            totals: { subtotal: null, tax: 0, discount: 0, printedTotal: 2400 },
          },
        ),
      );
      const a = await insights.ask(businessId, { key: 'total' });
      expect(a.title).toContain('Mismatch invoice');
      expect(a.rows).toContainEqual([
        'Figure adjusted by Noxtill',
        'None',
        'pos',
      ]);
      expect(
        a.rows.some(
          ([label, value]) => label === 'Difference' && value.includes('1,000'),
        ),
      ).toBe(true);
      expect(a.answer).toContain('#2');
    });

    it('only calls the model for a free-form question, and refuses cleanly when it is unavailable', async () => {
      aiInfra.createMessage.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '{"answer":"Two invoices are open.","bullets":["from the summary"]}',
          },
        ],
        stopReason: 'end_turn',
        inputTokens: 1,
        outputTokens: 1,
      });
      const ai = await insights.ask(businessId, {
        question: 'Who is the biggest supplier?',
      });
      expect(ai.source).toBe('ai');
      expect(ai.answer).toBe('Two invoices are open.');
      expect(ai.note).toContain('Answered by AI');

      aiInfra.createMessage.mockRejectedValueOnce(new Error('down'));
      await expect(
        insights.ask(businessId, { question: 'Who is the biggest supplier?' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DIGITIZER_ASSISTANT_UNAVAILABLE',
        }),
      });
    });
  });

  // ───────────────────────── settings ─────────────────────────

  describe('settings', () => {
    it('reports real defaults, and changing a policy changes what the pipeline does', async () => {
      const before = await settings.get(businessId);
      const threshold = before.groups
        .flatMap((g) => g.items)
        .find((i) => i.key === 'digitizer.reviewThreshold');
      expect(threshold?.number?.value).toBe(0.7);

      const after = await settings.set(
        businessId,
        'digitizer.reviewThreshold',
        0.9,
      );
      expect(
        after.groups
          .flatMap((g) => g.items)
          .find((i) => i.key === 'digitizer.reviewThreshold')?.value,
      ).toBe('90%');

      const doc = await stage(
        'customer_list',
        extraction([
          row(
            'customer',
            { name: 'Threshold Person', phone: '0300-1414141' },
            { confidence: 0.85 },
          ),
        ]),
      );
      expect(doc.reviewThreshold).toBe(0.9);
      expect(doc.rows[0].state).toBe('needs_review');
      await settings.set(businessId, 'digitizer.reviewThreshold', 0.7);
    });

    it('rejects an unknown or out-of-range setting, and non-owners', async () => {
      await expect(
        settings.set(businessId, 'sales.maxDiscountPercent', 5),
      ).rejects.toBeInstanceOf(AppException);
      await expect(
        settings.set(businessId, 'digitizer.reviewThreshold', 5),
      ).rejects.toBeInstanceOf(AppException);
      cls.set(CLS_KEY_ROLE, 'manager');
      await expect(
        settings.set(businessId, 'digitizer.matchOnPhone', false),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SETTING_OWNER_ONLY' }),
      });
      cls.set(CLS_KEY_ROLE, 'owner');
    });

    it('says plainly that enhancement is not built, and lists learned corrections', async () => {
      const s = await settings.get(businessId);
      const enhance = s.groups
        .flatMap((g) => g.items)
        .find((i) => i.key === 'enhance');
      expect(enhance).toMatchObject({
        control: 'fact',
        value: 'Not available',
      });
      expect(s.aliases.some((a) => a.rawText === 'Sprte')).toBe(true);
      expect(
        s.groups
          .flatMap((g) => g.items)
          .every((i) => i.control === 'fact' || i.policy),
      ).toBe(true);
    });
  });
});
