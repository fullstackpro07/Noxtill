import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { Prisma, ProductKind } from '@prisma/client';

export interface UploadedFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errorsFileUrl?: string;
}

interface RowError {
  row: number;
  reason: string;
  data: Record<string, string>;
}

const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Product CSV/XLSX import (BE-024): parse → validate every row → create the
 * valid ones → upload an error CSV for the rest. Kept synchronous (no queue)
 * since there's no status-polling endpoint for this import — unlike the
 * full customer import pipeline (BE-M5), which is async and resumable.
 */
@Injectable()
export class ProductsImportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
  ) {}

  async import(businessId: string, file: UploadedFile): Promise<ImportSummary> {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxSizeBytes: MAX_IMPORT_SIZE_BYTES,
    });

    const rows = await this.parseFile(file);
    let created = 0;
    const errors: RowError[] = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +1 for header row, +1 for 1-based indexing
      const validation = this.validateRow(row);
      if (validation.error) {
        errors.push({ row: rowNumber, reason: validation.error, data: row });
        continue;
      }

      try {
        await this.tenantPrisma.client.product.create({
          data: {
            businessId,
            ...validation.data,
          } as Prisma.ProductUncheckedCreateInput,
        });
        created += 1;
      } catch {
        errors.push({
          row: rowNumber,
          reason: `A product with sku "${(validation.data as { sku?: string }).sku}" already exists`,
          data: row,
        });
      }
    }

    const errorsFileUrl =
      errors.length > 0
        ? await this.uploadErrorsCsv(businessId, errors)
        : undefined;

    return { created, skipped: errors.length, errorsFileUrl };
  }

  private async parseFile(
    file: UploadedFile,
  ): Promise<Record<string, string>[]> {
    const isXlsx =
      file.mimetype.includes('sheet') ||
      file.originalname.toLowerCase().endsWith('.xlsx');

    if (isXlsx) {
      const workbook = new Workbook();
      // exceljs declares its own conflicting global `Buffer` interface in its .d.ts; the real
      // Node Buffer we pass in is structurally fine at runtime, just not under strict comparison.
      await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      const [headerRow, ...dataRows] = sheet.getRows(1, sheet.rowCount) ?? [];
      if (!headerRow) return [];

      const headers = (headerRow.values as (string | undefined)[])
        .slice(1)
        .map((h) => String(h ?? '').trim());
      return dataRows.map((row) => {
        const values = (row.values as (string | number | undefined)[]).slice(1);
        return Object.fromEntries(
          headers.map((header, i) => [header, String(values[i] ?? '').trim()]),
        );
      });
    }

    return parse(file.buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  private validateRow(row: Record<string, string>): {
    data?: Record<string, unknown>;
    error?: string;
  } {
    const name = row.name?.trim();
    if (!name) {
      return { error: 'name is required' };
    }

    const kind = (row.kind?.trim().toLowerCase() || 'product') as ProductKind;
    if (kind !== ProductKind.product && kind !== ProductKind.service) {
      return {
        error: `kind must be "product" or "service", got "${row.kind}"`,
      };
    }

    const costPrice = Number(row.costPrice ?? row.cost_price ?? 0);
    const sellingPrice = Number(row.sellingPrice ?? row.selling_price ?? 0);
    if (Number.isNaN(costPrice) || costPrice < 0) {
      return {
        error: `costPrice must be a non-negative number, got "${row.costPrice}"`,
      };
    }
    if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
      return {
        error: `sellingPrice must be a non-negative number, got "${row.sellingPrice}"`,
      };
    }

    const stockQty = Number(row.stockQty ?? row.stock_qty ?? 0);
    if (Number.isNaN(stockQty) || stockQty < 0) {
      return {
        error: `stockQty must be a non-negative number, got "${row.stockQty}"`,
      };
    }

    return {
      data: {
        name,
        kind,
        category: row.category?.trim() || undefined,
        sku: row.sku?.trim() || undefined,
        costPrice,
        sellingPrice,
        stockQty,
      },
    };
  }

  private async uploadErrorsCsv(
    businessId: string,
    errors: RowError[],
  ): Promise<string> {
    const header = 'row,reason,data\n';
    const body = errors
      .map(
        (e) =>
          `${e.row},"${e.reason.replace(/"/g, '""')}","${JSON.stringify(e.data).replace(/"/g, '""')}"`,
      )
      .join('\n');

    const key = `imports/products/${businessId}/${Date.now()}-errors.csv`;
    return this.s3.uploadAndSign(key, Buffer.from(header + body), 'text/csv');
  }
}
