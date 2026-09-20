import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import ExcelJS from 'exceljs';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { DataExportJob, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppException } from '../common/filters/app.exception';
import { ExportsService } from './exports.service';
import { DATA_EXPORTS_QUEUE, ExportKind } from './exports.constants';

/** How long a finished export's download link works. Enforced when a link is requested. */
export const DATA_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export type DataExportFormat = 'csv' | 'xlsx';
export type DataExportScope = 'everything' | 'selected';

/** Only modules Noxtill can genuinely export today are offered. `sensitive` ones are the ones the
 * design flags: credit balances, expenses and customer contact details. */
export const DATA_EXPORT_MODULES: {
  key: ExportKind;
  label: string;
  sensitive: boolean;
}[] = [
  { key: 'customers', label: 'Customers', sensitive: true },
  { key: 'sales', label: 'Sales', sensitive: false },
  { key: 'products', label: 'Products', sensitive: false },
  { key: 'stock', label: 'Inventory', sensitive: false },
  { key: 'credit', label: 'Credit', sensitive: true },
  { key: 'expenses', label: 'Expenses', sensitive: true },
];

export type DataExportState =
  | 'queued'
  | 'preparing'
  | 'ready'
  | 'failed'
  | 'expired';

export interface DataExportRequest {
  scope: DataExportScope;
  modules?: string[];
  format: DataExportFormat;
}

function buildZip(entries: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.pipe(stream);
    for (const entry of entries) {
      archive.append(entry.buffer, { name: entry.name });
    }
    void archive.finalize();
  });
}

const exportId = (id: string) => `EXP-${id.slice(0, 6).toUpperCase()}`;

/**
 * "Export Your Data": a real, queued, audited export job. The job row records who asked, what was
 * in scope, how many records and bytes it actually produced, and when its link stops working — and
 * the 24-hour expiry is enforced when a download link is requested, not just displayed.
 */
@Injectable()
export class DataExportsService {
  private readonly logger = new Logger(DataExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly exportsService: ExportsService,
    private readonly notifications: NotificationsService,
    @InjectQueue(DATA_EXPORTS_QUEUE) private readonly queue: Queue,
  ) {}

  // ------------------------------------------------------------------ helpers

  private state(job: DataExportJob, now = new Date()): DataExportState {
    if (
      job.status === 'ready' &&
      job.readyAt &&
      now.getTime() - job.readyAt.getTime() >= DATA_EXPORT_TTL_MS
    ) {
      return 'expired';
    }
    return job.status;
  }

  private resolveModules(request: DataExportRequest): ExportKind[] {
    const all = DATA_EXPORT_MODULES.map((m) => m.key);
    if (request.scope === 'everything') return all;
    const wanted = new Set(request.modules ?? []);
    const unknown = [...wanted].filter((m) => !all.includes(m as ExportKind));
    if (unknown.length > 0) {
      throw new AppException(
        'EXPORT_UNKNOWN_MODULE',
        `Noxtill cannot export: ${unknown.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const picked = all.filter((m) => wanted.has(m));
    if (picked.length === 0) {
      throw new AppException(
        'EXPORT_NO_MODULES',
        'Select at least one module to export.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return picked;
  }

  private labelOf(key: string): string {
    return DATA_EXPORT_MODULES.find((m) => m.key === key)?.label ?? key;
  }

  private scopeLabel(scope: string, modules: string[]): string {
    return scope === 'everything'
      ? 'Everything'
      : `Selected · ${modules.map((m) => this.labelOf(m)).join(', ')}`;
  }

  /** Real record counts per module, using exactly the filters the exporter applies. */
  async moduleCounts(businessId: string): Promise<Record<ExportKind, number>> {
    const [sales, customers, products, expenses, credit] = await Promise.all([
      this.prisma.order.count({ where: { businessId, isQuotation: false } }),
      this.prisma.customer.count({ where: { businessId } }),
      this.prisma.product.count({ where: { businessId } }),
      this.prisma.expense.count({ where: { businessId } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM v_credit_balances
        WHERE business_id = ${businessId} AND balance > 0
      `,
    ]);
    return {
      sales,
      customers,
      products,
      stock: products,
      expenses,
      credit: Number(credit[0]?.n ?? 0),
    };
  }

  // ------------------------------------------------------------------ overview

  async overview(businessId: string) {
    const counts = await this.moduleCounts(businessId);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [jobs, failed] = await Promise.all([
      this.prisma.dataExportJob.findMany({
        where: { businessId, trigger: 'manual' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.dataExportJob.count({
        where: {
          businessId,
          trigger: 'manual',
          status: 'failed',
          createdAt: { gte: ninetyDaysAgo },
        },
      }),
    ]);

    const names = await this.userNames(jobs.map((j) => j.requestedByUserId));
    const now = new Date();
    const lastReady = jobs.find((j) => j.status === 'ready' && j.readyAt);
    const current = jobs.filter(
      (j) => j.status === 'queued' || j.status === 'preparing',
    );

    return {
      modules: DATA_EXPORT_MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        records: counts[m.key],
        sensitive: m.sensitive,
      })),
      totalRecords: DATA_EXPORT_MODULES.reduce((n, m) => n + counts[m.key], 0),
      formats: [
        { key: 'csv', label: 'CSV per module, in a ZIP' },
        { key: 'xlsx', label: 'Excel workbook, one sheet per module' },
      ],
      kpis: {
        lastExport: lastReady
          ? {
              at: lastReady.readyAt!.toISOString(),
              by: names.get(lastReady.requestedByUserId) ?? null,
              records: lastReady.recordsCount,
              sizeBytes: lastReady.sizeBytes,
            }
          : null,
        current: {
          count: current.length,
          state: current.some((j) => j.status === 'preparing')
            ? 'preparing'
            : current.length > 0
              ? 'queued'
              : null,
        },
        failedLast90Days: failed,
      },
      history: jobs.map((j) => this.toRow(j, names, now)),
    };
  }

  private toRow(
    job: DataExportJob,
    names: Map<string, string>,
    now: Date,
  ) {
    const modules = (job.modules as unknown as string[]) ?? [];
    const state = this.state(job, now);
    const expiresAt =
      job.readyAt && job.status === 'ready'
        ? new Date(job.readyAt.getTime() + DATA_EXPORT_TTL_MS)
        : null;
    return {
      id: job.id,
      displayId: exportId(job.id),
      requestedBy: names.get(job.requestedByUserId) ?? null,
      createdAt: job.createdAt.toISOString(),
      scope: job.scope,
      scopeLabel: this.scopeLabel(job.scope, modules),
      modules,
      moduleCount: modules.length,
      format: job.format,
      records: job.recordsCount,
      sizeBytes: job.sizeBytes,
      status: state,
      readyAt: job.readyAt ? job.readyAt.toISOString() : null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      errorMessage: job.errorMessage,
      sensitive: job.sensitive,
    };
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async detail(businessId: string, id: string) {
    const job = await this.findJob(businessId, id);
    const names = await this.userNames([job.requestedByUserId]);
    const audit = await this.prisma.auditLog.findMany({
      where: { businessId, entity: 'data_export', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    const actorNames = await this.userNames(
      audit.map((a) => a.actorUserId).filter((a): a is string => !!a),
    );
    return {
      ...this.toRow(job, names, new Date()),
      audit: audit.map((a) => ({
        action: a.action,
        at: a.createdAt.toISOString(),
        actorName: a.actorUserId ? (actorNames.get(a.actorUserId) ?? null) : null,
      })),
    };
  }

  // ------------------------------------------------------------------ preview / create

  /** What an export would contain, computed now. Nothing is generated. */
  async preview(businessId: string, request: DataExportRequest) {
    const modules = this.resolveModules(request);
    const counts = await this.moduleCounts(businessId);
    return {
      scope: request.scope,
      format: request.format,
      modules: modules.map((m) => ({
        key: m,
        label: this.labelOf(m),
        records: counts[m],
        sensitive: !!DATA_EXPORT_MODULES.find((x) => x.key === m)?.sensitive,
      })),
      records: modules.reduce((n, m) => n + counts[m], 0),
      sensitive: this.isSensitive(modules),
    };
  }

  private isSensitive(modules: ExportKind[]): boolean {
    return modules.some(
      (m) => DATA_EXPORT_MODULES.find((x) => x.key === m)?.sensitive,
    );
  }

  async create(
    businessId: string,
    userId: string,
    request: DataExportRequest,
    trigger: 'manual' | 'backup' = 'manual',
  ) {
    const modules = this.resolveModules(request);
    const job = await this.prisma.dataExportJob.create({
      data: {
        businessId,
        requestedByUserId: userId,
        scope: request.scope,
        modules: modules as unknown as Prisma.InputJsonValue,
        format: request.format,
        sensitive: this.isSensitive(modules),
        trigger,
      },
    });
    await this.audit(businessId, userId, 'data_export.requested', job.id, {
      trigger,
      scope: request.scope,
      modules,
      format: request.format,
      sensitive: job.sensitive,
    });
    await this.queue.add(
      'data-export',
      { jobId: job.id },
      { attempts: 1, removeOnComplete: true },
    );
    return this.toRow(job, await this.userNames([userId]), new Date());
  }

  /** Same scope and format as an earlier export, run again — e.g. after it expired. */
  async regenerate(businessId: string, userId: string, id: string) {
    const source = await this.findJob(businessId, id);
    return this.create(businessId, userId, {
      scope: source.scope as DataExportScope,
      modules: (source.modules as unknown as string[]) ?? [],
      format: source.format as DataExportFormat,
    });
  }

  // ------------------------------------------------------------------ processing

  /** Runs one queued job: builds the files, uploads, and records the real counts and size. */
  async process(jobId: string): Promise<void> {
    const job = await this.prisma.dataExportJob.findUnique({
      where: { id: jobId },
    });
    if (!job || job.status !== 'queued') return;
    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: 'preparing' },
    });

    try {
      const modules = (job.modules as unknown as ExportKind[]) ?? [];
      const rowsByModule = new Map<ExportKind, Record<string, unknown>[]>();
      for (const kind of modules) {
        rowsByModule.set(
          kind,
          await this.exportsService.fetchRows(job.businessId, kind),
        );
      }
      const records = [...rowsByModule.values()].reduce(
        (n, rows) => n + rows.length,
        0,
      );

      let buffer: Buffer;
      let extension: string;
      let contentType: string;
      if (job.format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        for (const [kind, rows] of rowsByModule) {
          this.exportsService.addSheet(workbook, kind, rows);
        }
        buffer = Buffer.from(await workbook.xlsx.writeBuffer());
        extension = 'xlsx';
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        const entries: { name: string; buffer: Buffer }[] = [];
        for (const [kind, rows] of rowsByModule) {
          entries.push({
            name: `${kind}.csv`,
            buffer: await this.exportsService.buildCsvBuffer(kind, rows),
          });
        }
        buffer = await buildZip(entries);
        extension = 'zip';
        contentType = 'application/zip';
      }

      const key = `exports/${job.businessId}/data-${job.id}.${extension}`;
      await this.s3.uploadAndSign(key, buffer, contentType);
      await this.prisma.dataExportJob.update({
        where: { id: jobId },
        data: {
          status: 'ready',
          fileKey: key,
          recordsCount: records,
          sizeBytes: buffer.length,
          readyAt: new Date(),
          errorMessage: null,
        },
      });
      await this.audit(job.businessId, job.requestedByUserId, 'data_export.ready', jobId, {
        records,
        sizeBytes: buffer.length,
      });
      try {
        // A scheduled backup is not something anyone is waiting on, so it does not ring the bell.
        if (job.trigger === 'manual') await this.notifications.create(
          job.businessId,
          job.requestedByUserId,
          {
            title: 'Export ready',
            body: `${exportId(job.id)} is ready. The download link works for 24 hours.`,
            link: '/reports/export',
          },
          'export_ready',
        );
      } catch (error) {
        this.logger.warn(
          `Export ${job.id} ready but notification failed: ${(error as Error).message}`,
        );
      }
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Data export ${jobId} failed: ${message}`);
      await this.prisma.dataExportJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorMessage: message.slice(0, 1000) },
      });
      await this.audit(job.businessId, job.requestedByUserId, 'data_export.failed', jobId, {
        error: message,
      });
    }
  }

  // ------------------------------------------------------------------ download

  async download(businessId: string, userId: string, id: string) {
    const job = await this.findJob(businessId, id);
    const state = this.state(job);
    if (state === 'expired') {
      throw new AppException(
        'EXPORT_EXPIRED',
        'This export has expired. Regenerate it to get a new link.',
        HttpStatus.GONE,
      );
    }
    if (state !== 'ready' || !job.fileKey) {
      throw new AppException(
        'EXPORT_NOT_READY',
        'This export is not ready to download.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const remaining = Math.max(
      60,
      Math.floor(
        (job.readyAt!.getTime() + DATA_EXPORT_TTL_MS - Date.now()) / 1000,
      ),
    );
    const url = await this.s3.getSignedDownloadUrl(job.fileKey, remaining);
    await this.audit(businessId, userId, 'data_export.downloaded', id, {
      sensitive: job.sensitive,
    });
    return { url };
  }

  private async findJob(businessId: string, id: string) {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { id, businessId },
    });
    if (!job) {
      throw new AppException(
        'EXPORT_NOT_FOUND',
        'Export not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return job;
  }

  private async audit(
    businessId: string,
    actorUserId: string,
    action: string,
    id: string,
    after?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action,
          entity: 'data_export',
          entityId: id,
          after: (after ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(`Audit write failed: ${(error as Error).message}`);
    }
  }
}
