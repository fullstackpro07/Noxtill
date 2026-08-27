import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import {
  CustomerImportParser,
  ImportFile,
  RawRecords,
} from './customer-import.parser';
import {
  applyMapping,
  suggestMapping,
} from './customer-import-mapping.constants';
import { DigitizerVisionService } from '../digitizer/digitizer-vision.service';
import { ALLOWED_IMAGE_MIME_TYPES } from '../digitizer/digitizer.constants';
import {
  ALLOWED_IMPORT_MIME_TYPES_WITH_PHOTO,
  CUSTOMER_IMPORT_ERROR_CODES,
  CUSTOMER_IMPORT_QUEUE,
  EXECUTE_BATCH_SIZE,
  MAX_IMPORT_SIZE_BYTES,
} from './customer-import.constants';
import {
  ImportPreview,
  RawImportRow,
  StagedImportRow,
} from './customer-import.types';
import { Customer, ImportSource, Prisma } from '@prisma/client';

function detectSource(file: ImportFile): ImportSource {
  const name = file.originalname.toLowerCase();
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype))
    return ImportSource.photo;
  if (file.mimetype.includes('sheet') || name.endsWith('.xlsx'))
    return ImportSource.xlsx;
  if (file.mimetype.includes('wordprocessingml') || name.endsWith('.docx'))
    return ImportSource.docx;
  if (file.mimetype.includes('csv') || name.endsWith('.csv'))
    return ImportSource.csv;
  return ImportSource.text;
}

/** Customer import pipeline (BE-042/043/044, extended by UPD-BE-099): parse (text, or a real
 * photo via the AI Photo Digitizer's vision pipeline) → normalize → dedupe → preview
 * (with an optional column-remap step) → confirm → queued execute. */
@Injectable()
export class CustomerImportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly parser: CustomerImportParser,
    private readonly vision: DigitizerVisionService,
    private readonly auditService: AuditService,
    @InjectQueue(CUSTOMER_IMPORT_QUEUE) private readonly queue: Queue,
  ) {}

  async stageImport(
    businessId: string,
    file: ImportFile,
  ): Promise<ImportPreview> {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_IMPORT_MIME_TYPES_WITH_PHOTO,
      maxSizeBytes: MAX_IMPORT_SIZE_BYTES,
    });

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');

    // Idempotent: re-uploading the same file returns the existing batch instead of duplicating (BE-044).
    const existingBatch = await this.tenantPrisma.client.importBatch.findUnique(
      {
        where: { businessId_contentHash: { businessId, contentHash } },
      },
    );
    if (existingBatch) {
      return this.toPreview(existingBatch);
    }

    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const isImage = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(
      file.mimetype,
    );
    let rawRows: RawImportRow[];
    let records: RawRecords | null = null;

    if (isImage) {
      // Import Customers, photo path (UPD-BE-099) — reuses the AI Photo Digitizer's own vision
      // extraction rather than a parallel one; a "customer_list" scan is a photographed
      // Record Book/ledger page of names, phones, and opening balances.
      const mediaType = file.mimetype as
        'image/jpeg' | 'image/png' | 'image/webp';
      const scanned = await this.vision.extract(
        businessId,
        'customer_list',
        file.buffer,
        mediaType,
      );
      rawRows = scanned
        .filter(
          (row) =>
            row.destination === 'customer' ||
            row.destination === 'credit_opening_balance',
        )
        .map((row) => ({
          name: String(row.data.name ?? row.data.customerName ?? ''),
          phone: String(row.data.phone ?? ''),
          balance:
            row.data.balance != null
              ? Number(row.data.balance)
              : row.data.amount != null
                ? Number(row.data.amount)
                : undefined,
        }));
    } else {
      records = await this.parser.parseRecords(file);
      if (records) {
        rawRows = applyMapping(records.rows, suggestMapping(records.headers));
      } else {
        rawRows = await this.parser.parse(file);
      }
    }

    const existingCustomers = await this.tenantPrisma.client.customer.findMany(
      {},
    );
    const staged = this.stageRows(rawRows, business.country, existingCustomers);
    const counts = this.computeCounts(staged);

    const batch = await this.tenantPrisma.client.importBatch.create({
      data: {
        businessId,
        source: detectSource(file),
        status: 'pending',
        counts: counts as unknown as Prisma.InputJsonValue,
        rows: staged as unknown as Prisma.InputJsonValue,
        rawRows: records
          ? (records as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        contentHash,
      },
    });

    return this.toPreview(batch);
  }

  async getBatch(batchId: string): Promise<ImportPreview> {
    const batch = await this.tenantPrisma.client.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found');
    }
    return this.toPreview(batch);
  }

  /** Column-mapping (UPD-BE-099) — the raw headers plus the currently-suggested mapping, for the mapping-fix UI. */
  async getColumns(batchId: string) {
    const batch = await this.tenantPrisma.client.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || !batch.rawRows) {
      throw new AppException(
        CUSTOMER_IMPORT_ERROR_CODES.NO_COLUMN_MAPPING,
        'This import batch has no columns to map (not a CSV/XLSX upload)',
        HttpStatus.BAD_REQUEST,
      );
    }
    const records = batch.rawRows as unknown as RawRecords;
    return {
      headers: records.headers,
      mapping: suggestMapping(records.headers),
    };
  }

  /** Re-stages a csv/xlsx batch under a corrected column mapping, without re-uploading (UPD-BE-099). */
  async remap(
    businessId: string,
    batchId: string,
    mapping: Record<string, string>,
  ): Promise<ImportPreview> {
    const batch = await this.tenantPrisma.client.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || !batch.rawRows) {
      throw new AppException(
        CUSTOMER_IMPORT_ERROR_CODES.NO_COLUMN_MAPPING,
        'This import batch has no columns to map (not a CSV/XLSX upload)',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (batch.status !== 'pending') {
      throw new AppException(
        CUSTOMER_IMPORT_ERROR_CODES.ALREADY_CONFIRMED,
        'This import has already been confirmed and can no longer be remapped',
        HttpStatus.CONFLICT,
      );
    }

    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const records = batch.rawRows as unknown as RawRecords;
    const rawRows = applyMapping(records.rows, mapping);
    const existingCustomers = await this.tenantPrisma.client.customer.findMany(
      {},
    );
    const staged = this.stageRows(rawRows, business.country, existingCustomers);
    const counts = this.computeCounts(staged);

    const updated = await this.tenantPrisma.client.importBatch.update({
      where: { id: batchId },
      data: {
        counts: counts as unknown as Prisma.InputJsonValue,
        rows: staged as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toPreview(updated);
  }

  async confirm(businessId: string, batchId: string) {
    const batch = await this.tenantPrisma.client.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found');
    }
    if (batch.status === 'completed' || batch.status === 'processing') {
      return { batchId, status: batch.status };
    }

    await this.tenantPrisma.client.importBatch.update({
      where: { id: batchId },
      data: { status: 'processing' },
    });
    await this.queue.add(
      'execute',
      { businessId, batchId },
      { jobId: `customer-import-${batchId}` },
    );

    return { batchId, status: 'processing' };
  }

  /** Runs off the queue (BE-044), outside any HTTP/CLS context — scopes explicitly via the raw client. */
  async executeBatch(businessId: string, batchId: string): Promise<void> {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    const rows = batch.rows as unknown as StagedImportRow[];

    for (let i = 0; i < rows.length; i += EXECUTE_BATCH_SIZE) {
      const chunk = rows.slice(i, i + EXECUTE_BATCH_SIZE);
      await this.executeChunk(businessId, chunk);
    }

    const counts = batch.counts as unknown as ImportPreview['counts'];
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'completed' },
    });
    await this.auditService.log({
      entity: 'ImportBatch',
      entityId: batchId,
      action: 'customer_import.execute',
      after: { counts },
    });
  }

  private async executeChunk(
    businessId: string,
    chunk: StagedImportRow[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const row of chunk) {
        if (row.action === 'skip' || !row.normalizedPhone) continue;

        let customerId = row.existingCustomerId;
        if (row.action === 'create') {
          // Import Customers, marketing-consent flag (UPD-BE-099) — an imported contact never
          // opted in themselves, so this must never default to the schema's normal `true`.
          const created = await tx.customer.create({
            data: {
              businessId,
              phone: row.normalizedPhone,
              name: row.name,
              consentMarketing: false,
            },
          });
          customerId = created.id;
        } else if (row.action === 'update' && customerId) {
          const existing = await tx.customer.findUnique({
            where: { id: customerId },
          });
          if (existing && !existing.name.trim()) {
            await tx.customer.update({
              where: { id: customerId },
              data: { name: row.name },
            });
          }
        }

        if (row.balance && row.balance > 0 && customerId) {
          await tx.creditEntry.create({
            data: {
              businessId,
              customerId,
              kind: 'credit',
              amount: row.balance,
              note: 'Opening balance — imported',
            },
          });
        }
      }
    });
  }

  private stageRows(
    rawRows: RawImportRow[],
    defaultCountry: string | null,
    existingCustomers: Customer[],
  ): StagedImportRow[] {
    const existingByPhone = new Map(existingCustomers.map((c) => [c.phone, c]));
    const seenInBatch = new Set<string>();

    return rawRows.map((row, index) => {
      const rowNumber = index + 1;
      const base = {
        rowNumber,
        name: row.name,
        rawPhone: row.phone,
        balance: row.balance,
      };

      if (!row.name || !row.phone) {
        return {
          ...base,
          action: 'skip' as const,
          reason: 'Missing name or phone',
        };
      }

      const normalizedPhone = normalizePhoneE164(
        row.phone,
        defaultCountry ?? undefined,
      );
      if (!normalizedPhone) {
        return {
          ...base,
          action: 'skip' as const,
          reason: `Could not parse phone: ${row.phone}`,
        };
      }

      if (seenInBatch.has(normalizedPhone)) {
        return {
          ...base,
          normalizedPhone,
          action: 'skip' as const,
          reason: 'Duplicate phone within this import',
        };
      }
      seenInBatch.add(normalizedPhone);

      const existing = existingByPhone.get(normalizedPhone);
      if (existing) {
        return {
          ...base,
          normalizedPhone,
          action: 'update' as const,
          existingCustomerId: existing.id,
        };
      }

      return { ...base, normalizedPhone, action: 'create' as const };
    });
  }

  private computeCounts(staged: StagedImportRow[]): ImportPreview['counts'] {
    return {
      create: staged.filter((r) => r.action === 'create').length,
      update: staged.filter((r) => r.action === 'update').length,
      skip: staged.filter((r) => r.action === 'skip').length,
      totalCredit: staged.reduce(
        (sum, r) => sum + (r.action !== 'skip' ? (r.balance ?? 0) : 0),
        0,
      ),
    };
  }

  private toPreview(batch: {
    id: string;
    status: string;
    counts: unknown;
    rows: unknown;
    rawRows?: unknown;
  }): ImportPreview {
    const rows = batch.rows as StagedImportRow[];
    return {
      batchId: batch.id,
      status: batch.status,
      counts: batch.counts as ImportPreview['counts'],
      preview: rows.filter((r) => r.action !== 'skip').slice(0, 50),
      invalid: rows.filter((r) => r.action === 'skip'),
      hasColumnMapping: !!batch.rawRows,
    };
  }
}
