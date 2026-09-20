jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

// archiver ships ESM-only and breaks ts-jest's CommonJS transform (see account-zip.processor.spec.ts):
// a stream-backed fake keeps the entry contents observable; only real ZIP compression is faked.
jest.mock('archiver', () => {
  class MockZipArchive {
    private dest: import('stream').PassThrough | undefined;
    pipe(dest: import('stream').PassThrough) {
      this.dest = dest;
      return dest;
    }
    append(buffer: Buffer, meta: { name: string }) {
      this.dest?.write(`[[${meta.name}]]`);
      this.dest?.write(buffer);
      return this;
    }
    on() {
      return this;
    }
    finalize() {
      this.dest?.end();
      return Promise.resolve();
    }
  }
  return { ZipArchive: MockZipArchive };
});

import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { S3Service } from '../common/storage/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppException } from '../common/filters/app.exception';
import { ExportsService } from './exports.service';
import { DataExportsService, DATA_EXPORT_TTL_MS } from './data-exports.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DataExportsService', () => {
  let prisma: PrismaService;
  let service: DataExportsService;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  const uploaded: { key: string; body: Buffer }[] = [];
  const s3 = {
    uploadAndSign: jest.fn((key: string, body: Buffer) => {
      uploaded.push({ key, body });
      return Promise.resolve('https://signed.example/x');
    }),
    getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/fresh'),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    const exportsService = new ExportsService(
      tenantPrisma,
      s3 as unknown as S3Service,
      {} as never,
      { add: jest.fn() } as never,
    );
    service = new DataExportsService(
      prisma,
      s3 as unknown as S3Service,
      exportsService,
      notifications as unknown as NotificationsService,
      queue as never,
    );

    businessId = (await prisma.business.create({ data: { name: 'Data Export Biz', slug: `data-export-${Date.now()}` } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: 'Other Biz', slug: `data-export-other-${Date.now()}` } })).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    userId = (await prisma.user.create({ data: { name: 'Export Owner', phone: `+1416${String(Date.now()).slice(-7)}`, passwordHash: 'x' } })).id;

    await prisma.customer.createMany({
      data: [
        { businessId, name: 'Ann', phone: `+1417${String(Date.now()).slice(-7)}` },
        { businessId, name: 'Bo', phone: `+1418${String(Date.now()).slice(-7)}` },
        { businessId: otherBusinessId, name: 'Not ours', phone: `+1419${String(Date.now()).slice(-7)}` },
      ],
    });
    await prisma.expense.create({ data: { businessId, description: 'Rent', category: 'Rent', amount: 10, incurredOn: new Date() } });
  });

  afterEach(() => {
    uploaded.length = 0;
    queue.add.mockClear();
    s3.getSignedDownloadUrl.mockClear();
  });

  afterAll(async () => {
    for (const id of [businessId, otherBusinessId]) {
      await prisma.dataExportJob.deleteMany({ where: { businessId: id } });
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.expense.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
    }
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('overview counts only this business, flags sensitive modules and offers only real formats', async () => {
    const o = await service.overview(businessId);
    expect(o.modules.find((m) => m.key === 'customers')).toMatchObject({ records: 2, sensitive: true });
    expect(o.modules.find((m) => m.key === 'expenses')).toMatchObject({ records: 1, sensitive: true });
    expect(o.modules.find((m) => m.key === 'sales')).toMatchObject({ records: 0, sensitive: false });
    expect(o.formats.map((f) => f.key)).toEqual(['csv', 'xlsx']);
    expect(o.kpis.lastExport).toBeNull();
  });

  it('preview reports real counts, and nothing is generated', async () => {
    const p = await service.preview(businessId, { scope: 'selected', modules: ['customers', 'sales'], format: 'csv' });
    expect(p).toMatchObject({ records: 2, sensitive: true });
    expect(queue.add).not.toHaveBeenCalled();
    expect(await prisma.dataExportJob.count({ where: { businessId } })).toBe(0);
  });

  it('rejects unknown or empty selections instead of silently exporting something else', async () => {
    await expect(service.create(businessId, userId, { scope: 'selected', modules: ['payments'], format: 'csv' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'EXPORT_UNKNOWN_MODULE' }) });
    await expect(service.create(businessId, userId, { scope: 'selected', modules: [], format: 'csv' })).rejects.toBeInstanceOf(AppException);
  });

  it('create queues a job and audits who asked; processing records real records/size and a ZIP of CSVs', async () => {
    const row = await service.create(businessId, userId, { scope: 'selected', modules: ['customers', 'expenses'], format: 'csv' });
    expect(row).toMatchObject({ status: 'queued', moduleCount: 2, sensitive: true });
    expect(queue.add).toHaveBeenCalledWith('data-export', { jobId: row.id }, expect.anything());

    await service.process(row.id);
    const detail = await service.detail(businessId, row.id);
    expect(detail).toMatchObject({ status: 'ready', records: 3, requestedBy: 'Export Owner' });
    expect(detail.sizeBytes).toBe(uploaded[0].body.length);
    expect(uploaded[0].key).toBe(`exports/${businessId}/data-${row.id}.zip`);
    const zipped = uploaded[0].body.toString();
    expect(zipped).toContain('[[customers.csv]]');
    expect(zipped).toContain('[[expenses.csv]]');
    expect(zipped).toContain('Ann');
    expect(zipped).not.toContain('Not ours');
    expect(detail.audit.map((a) => a.action)).toEqual(['data_export.requested', 'data_export.ready']);
    expect(notifications.create).toHaveBeenCalled();
  });

  it('an Excel export is a real workbook', async () => {
    const row = await service.create(businessId, userId, { scope: 'everything', format: 'xlsx' });
    await service.process(row.id);
    expect(uploaded[0].key.endsWith('.xlsx')).toBe(true);
    expect(uploaded[0].body.subarray(0, 2).toString()).toBe('PK');
  });

  it('a failed job records the real reason and offers no download', async () => {
    const row = await service.create(businessId, userId, { scope: 'selected', modules: ['customers'], format: 'csv' });
    s3.uploadAndSign.mockRejectedValueOnce(new Error('storage down'));
    await service.process(row.id);
    const detail = await service.detail(businessId, row.id);
    expect(detail).toMatchObject({ status: 'failed', errorMessage: 'storage down' });
    await expect(service.download(businessId, userId, row.id)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'EXPORT_NOT_READY' }) });
    expect((await service.overview(businessId)).kpis.failedLast90Days).toBeGreaterThanOrEqual(1);
  });

  it('download works while ready and is audited; after 24 hours it is refused and can be regenerated', async () => {
    const row = await service.create(businessId, userId, { scope: 'selected', modules: ['customers'], format: 'csv' });
    await service.process(row.id);
    expect(await service.download(businessId, userId, row.id)).toEqual({ url: 'https://signed.example/fresh' });
    expect((await service.detail(businessId, row.id)).audit.at(-1)?.action).toBe('data_export.downloaded');

    await prisma.dataExportJob.update({ where: { id: row.id }, data: { readyAt: new Date(Date.now() - DATA_EXPORT_TTL_MS - 1000) } });
    expect((await service.detail(businessId, row.id)).status).toBe('expired');
    s3.getSignedDownloadUrl.mockClear();
    await expect(service.download(businessId, userId, row.id)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'EXPORT_EXPIRED' }) });
    expect(s3.getSignedDownloadUrl).not.toHaveBeenCalled();

    const again = await service.regenerate(businessId, userId, row.id);
    expect(again.id).not.toBe(row.id);
    expect(again).toMatchObject({ scope: 'selected', modules: ['customers'], format: 'csv', status: 'queued' });
  });

  it('another business cannot see or download this export', async () => {
    const row = await service.create(businessId, userId, { scope: 'selected', modules: ['customers'], format: 'csv' });
    await expect(service.detail(otherBusinessId, row.id)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'EXPORT_NOT_FOUND' }) });
    await expect(service.download(otherBusinessId, userId, row.id)).rejects.toBeInstanceOf(AppException);
  });
});
