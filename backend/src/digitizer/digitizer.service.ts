import { createHash } from 'crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import { DigitizerVisionService } from './digitizer-vision.service';
import { DigitizerAliasService } from './digitizer-alias.service';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  DIGITIZER_ERROR_CODES,
  MAX_IMAGE_SIZE_BYTES,
} from './digitizer.constants';
import {
  DigitizerDestination,
  DigitizerRow,
  DigitizerScanPreview,
  ScannerType,
} from './digitizer.types';
import { ImportSource, ImportStatus, Prisma } from '@prisma/client';

export interface DigitizerUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function emptyCounts(): Record<DigitizerDestination, number> {
  return {
    customer: 0,
    product: 0,
    expense: 0,
    supplier: 0,
    credit_opening_balance: 0,
  };
}

/**
 * AI Photo Digitizer orchestration (UPD-BE-060/061/062/063) — same stage → review → commit shape
 * as `CustomerImportService`, sharing its `ImportBatch` model (`source: 'photo'`) rather than a
 * parallel one. Unlike the customer importer, commit isn't queued: digitizer batches are small
 * (one photo's worth of rows), so a synchronous transactional commit is enough — same reasoning
 * `ProductsImportService` used to skip a queue.
 */
@Injectable()
export class DigitizerService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly vision: DigitizerVisionService,
    private readonly aliases: DigitizerAliasService,
  ) {}

  async upload(
    businessId: string,
    scannerType: ScannerType,
    file: DigitizerUploadFile,
  ): Promise<DigitizerScanPreview> {
    await validateUploadedFile(file, {
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
      maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
    });

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.tenantPrisma.client.importBatch.findUnique({
      where: { businessId_contentHash: { businessId, contentHash } },
    });
    if (existing) {
      return this.toPreview(existing);
    }

    const mediaType = file.mimetype as
      'image/jpeg' | 'image/png' | 'image/webp';
    const rows = await this.vision.extract(
      businessId,
      scannerType,
      file.buffer,
      mediaType,
    );

    const imageKey = `digitizer/${businessId}/${Date.now()}-${file.originalname}`;
    await this.s3.upload(imageKey, file.buffer, file.mimetype);

    const batch = await this.tenantPrisma.client.importBatch.create({
      data: {
        businessId,
        source: ImportSource.photo,
        status: ImportStatus.pending,
        scannerType,
        imageKey,
        counts: this.computeCounts(rows) as unknown as Prisma.InputJsonValue,
        rows: rows as unknown as Prisma.InputJsonValue,
        contentHash,
      },
    });

    return this.toPreview(batch);
  }

  async getRows(
    businessId: string,
    batchId: string,
  ): Promise<DigitizerScanPreview> {
    const batch = await this.findPhotoBatch(businessId, batchId);
    return this.toPreview(batch);
  }

  history(businessId: string) {
    return this.tenantPrisma.client.importBatch.findMany({
      where: { businessId, source: ImportSource.photo },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Finds the batch containing a given row id, then applies the correction and learns the alias (UPD-BE-063). */
  async updateRow(
    businessId: string,
    rowId: string,
    patch: Partial<Pick<DigitizerRow, 'data' | 'destination' | 'action'>>,
  ): Promise<DigitizerRow> {
    const batches = await this.tenantPrisma.client.importBatch.findMany({
      where: { businessId, source: ImportSource.photo },
    });

    for (const batch of batches) {
      const rows = batch.rows as unknown as DigitizerRow[];
      const index = rows.findIndex((r) => r.id === rowId);
      if (index === -1) continue;

      const before = rows[index];
      await this.learnFromCorrection(businessId, before, patch);

      const after: DigitizerRow = {
        ...before,
        ...patch,
        data: patch.data ? { ...before.data, ...patch.data } : before.data,
        corrected: true,
      };
      rows[index] = after;

      await this.tenantPrisma.client.importBatch.update({
        where: { id: batch.id },
        data: {
          rows: rows as unknown as Prisma.InputJsonValue,
          counts: this.computeCounts(rows) as unknown as Prisma.InputJsonValue,
        },
      });
      return after;
    }

    throw new NotFoundException('Digitizer row not found');
  }

  /** `POST /imports/:id/commit` (UPD-BE-062) — routes every reviewed, non-skipped row to its real destination table. */
  async commit(businessId: string, batchId: string) {
    const batch = await this.findPhotoBatch(businessId, batchId);
    if (batch.status === ImportStatus.completed) {
      throw new AppException(
        DIGITIZER_ERROR_CODES.ALREADY_COMMITTED,
        'This scan has already been imported',
        HttpStatus.CONFLICT,
      );
    }

    const rows = batch.rows as unknown as DigitizerRow[];
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const created: Record<DigitizerDestination, number> = emptyCounts();
    const skipped: { rowId: string; reason: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (row.action === 'skip') continue;
        try {
          await this.commitRow(tx, businessId, business.country, row);
          created[row.destination] += 1;
        } catch (error) {
          skipped.push({ rowId: row.id, reason: (error as Error).message });
        }
      }
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: ImportStatus.completed },
      });
    });

    return { batchId: batch.id, created, skipped };
  }

  private async commitRow(
    tx: Prisma.TransactionClient,
    businessId: string,
    defaultCountry: string | null,
    row: DigitizerRow,
  ): Promise<void> {
    const data = row.data;
    switch (row.destination) {
      case 'customer': {
        const phone = this.requirePhone(data.name, data.phone, defaultCountry);
        // Import Customers, marketing-consent flag (UPD-BE-099) — a scanned contact never opted
        // in themselves, so this must never default to the schema's normal `true`.
        await tx.customer.upsert({
          where: { businessId_phone: { businessId, phone } },
          create: {
            businessId,
            phone,
            name: String(data.name ?? ''),
            consentMarketing: false,
          },
          update: {},
        });
        const balance = Number(data.balance ?? 0);
        if (balance > 0) {
          const customer = await tx.customer.findUniqueOrThrow({
            where: { businessId_phone: { businessId, phone } },
          });
          await tx.creditEntry.create({
            data: {
              businessId,
              customerId: customer.id,
              kind: 'credit',
              amount: balance,
              note: 'Opening balance — imported via AI Photo Digitizer',
            },
          });
        }
        return;
      }
      case 'credit_opening_balance': {
        const phone = this.requirePhone(
          data.customerName,
          data.phone,
          defaultCountry,
        );
        const customer = await tx.customer.upsert({
          where: { businessId_phone: { businessId, phone } },
          create: {
            businessId,
            phone,
            name: String(data.customerName ?? ''),
            consentMarketing: false,
          },
          update: {},
        });
        const amount = Number(data.amount ?? 0);
        if (!(amount > 0)) throw new Error('Missing or invalid amount');
        await tx.creditEntry.create({
          data: {
            businessId,
            customerId: customer.id,
            kind: 'credit',
            amount,
            note: 'Opening balance — imported via AI Photo Digitizer',
          },
        });
        return;
      }
      case 'product': {
        const name = String(data.name ?? '').trim();
        if (!name) throw new Error('Missing product name');
        await tx.product.create({
          data: {
            businessId,
            kind: 'product',
            name,
            costPrice: Number(data.costPrice ?? 0),
            sellingPrice: Number(data.sellingPrice ?? 0),
            stockQty: Number(data.stockQty ?? 0),
            sku: data.sku ? String(data.sku) : undefined,
          },
        });
        return;
      }
      case 'expense': {
        const description = String(data.description ?? '').trim();
        const amount = Number(data.amount ?? 0);
        if (!description || !(amount > 0)) {
          throw new Error('Missing description or amount');
        }
        await tx.expense.create({
          data: {
            businessId,
            description,
            amount,
            category: data.category ? String(data.category) : 'Uncategorized',
            incurredOn: data.incurredOn
              ? new Date(String(data.incurredOn))
              : new Date(),
          },
        });
        return;
      }
      case 'supplier': {
        const name = String(data.name ?? '').trim();
        if (!name) throw new Error('Missing supplier name');
        await tx.supplier.create({
          data: {
            businessId,
            name,
            phone: data.phone ? String(data.phone) : undefined,
            email: data.email ? String(data.email) : undefined,
          },
        });
        return;
      }
    }
  }

  private requirePhone(
    name: string | number | undefined,
    phone: string | number | undefined,
    defaultCountry: string | null,
  ): string {
    const normalized = normalizePhoneE164(
      String(phone ?? ''),
      defaultCountry ?? undefined,
    );
    if (!name || !normalized) {
      throw new Error(`Missing or unparseable name/phone`);
    }
    return normalized;
  }

  /**
   * Learns from every string field that actually changed, not just a name-shaped field — a
   * misread lives wherever the destination happens to put its text (`description` for an
   * expense, `name` for a product/customer/supplier, `customerName` for a credit opening
   * balance), so the alias map has to generalize across all of them.
   */
  private async learnFromCorrection(
    businessId: string,
    before: DigitizerRow,
    patch: Partial<Pick<DigitizerRow, 'data'>>,
  ): Promise<void> {
    if (!patch.data) return;
    for (const [field, correctedValue] of Object.entries(patch.data)) {
      const rawValue = before.data[field];
      if (typeof rawValue === 'string' && typeof correctedValue === 'string') {
        await this.aliases.learn(businessId, rawValue, correctedValue);
      }
    }
  }

  private async findPhotoBatch(businessId: string, batchId: string) {
    const batch = await this.tenantPrisma.client.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.businessId !== businessId || batch.source !== 'photo') {
      throw new NotFoundException('Digitizer scan not found');
    }
    return batch;
  }

  private computeCounts(
    rows: DigitizerRow[],
  ): Record<DigitizerDestination, number> {
    const counts = emptyCounts();
    for (const row of rows) {
      if (row.action === 'commit') counts[row.destination] += 1;
    }
    return counts;
  }

  private toPreview(batch: {
    id: string;
    status: string;
    scannerType: string | null;
    rows: unknown;
  }): DigitizerScanPreview {
    const rows = batch.rows as DigitizerRow[];
    return {
      batchId: batch.id,
      status: batch.status,
      scannerType: batch.scannerType,
      counts: this.computeCounts(rows),
      rows,
    };
  }
}
