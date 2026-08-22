import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { suggestMapping } from './products-import.constants';
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

export interface ImportPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, unknown>;
  confidence: number;
  valid: boolean;
  error?: string;
}

export interface ImportPreview {
  headers: string[];
  suggestedMapping: Record<string, string>;
  rows: ImportPreviewRow[];
}

const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Product CSV/XLSX import (BE-024, extended UPD-FE-070 with real column-mapping + a per-row
 * confidence preview). `parse()` never writes anything — it's a pure read used to build the
 * mapping/review screen. `commit()` re-derives everything from the file + the caller's final
 * mapping/corrections/skip-list, exactly like `parse()` would, so nothing the client claims about
 * a row (confidence, "this one's valid") is ever trusted — only real, server-side validation ever
 * decides what gets written.
 */
@Injectable()
export class ProductsImportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
  ) {}

  /** Legacy one-shot path (canonical column names only) — kept for existing callers; the mapped
   * parse()/commit() pair below is the real path behind the Products Import screen. */
  async import(businessId: string, file: UploadedFile): Promise<ImportSummary> {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxSizeBytes: MAX_IMPORT_SIZE_BYTES,
    });
    const rows = await this.parseFile(file);
    return this.writeRows(businessId, rows);
  }

  async parse(file: UploadedFile): Promise<ImportPreview> {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxSizeBytes: MAX_IMPORT_SIZE_BYTES,
    });
    const rawRows = await this.parseFile(file);
    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const suggestedMapping = suggestMapping(headers);

    const rows = rawRows.map((raw, index) => {
      const mapped = this.applyMapping(raw, suggestedMapping);
      const validation = this.validateRow(mapped, suggestedMapping);
      return {
        rowNumber: index + 2,
        raw,
        mapped,
        confidence: validation.confidence,
        valid: !validation.error,
        error: validation.error,
      };
    });

    return { headers, suggestedMapping, rows };
  }

  async commit(
    businessId: string,
    file: UploadedFile,
    mapping: Record<string, string>,
    skippedRows: number[],
    corrections: { rowNumber: number; data: Record<string, string> }[],
  ): Promise<ImportSummary> {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxSizeBytes: MAX_IMPORT_SIZE_BYTES,
    });
    const rawRows = await this.parseFile(file);
    const correctionByRow = new Map(
      corrections.map((c) => [c.rowNumber, c.data]),
    );
    const skipped = new Set(skippedRows);

    const mappedRows = rawRows
      .map((raw, index) => ({ rowNumber: index + 2, raw }))
      .filter((r) => !skipped.has(r.rowNumber))
      .map((r) =>
        this.applyMapping(correctionByRow.get(r.rowNumber) ?? r.raw, mapping),
      );

    return this.writeRows(businessId, mappedRows);
  }

  private async writeRows(
    businessId: string,
    rows: Record<string, string>[],
  ): Promise<ImportSummary> {
    let created = 0;
    const errors: RowError[] = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
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

  /** Remaps a raw file row (keyed by file column name) into canonical field names via `mapping`. */
  private applyMapping(
    raw: Record<string, string>,
    mapping: Record<string, string>,
  ): Record<string, string> {
    const mapped: Record<string, string> = {};
    for (const [fileColumn, target] of Object.entries(mapping)) {
      if (target === 'ignore' || !target) continue;
      const value = raw[fileColumn];
      if (value !== undefined) mapped[target] = value;
    }
    return mapped;
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

  /** `mapping` is only used to phrase a friendlier "which file column" hint in preview mode — validation always runs against the already-mapped canonical keys either way. */
  private validateRow(
    row: Record<string, string>,
    mapping?: Record<string, string>,
  ): {
    data?: Record<string, unknown>;
    error?: string;
    confidence: number;
  } {
    const name = row.name?.trim();
    if (!name) {
      return { error: 'name is required', confidence: 0 };
    }

    const kindMapped = mapping ? Object.values(mapping).includes('kind') : true;
    const kind = (row.kind?.trim().toLowerCase() || 'product') as ProductKind;
    if (kind !== ProductKind.product && kind !== ProductKind.service) {
      return {
        error: `kind must be "product" or "service", got "${row.kind}"`,
        confidence: 0,
      };
    }

    const costPrice = Number(row.costPrice ?? row.cost_price ?? 0);
    const sellingPrice = Number(row.sellingPrice ?? row.selling_price ?? 0);
    if (Number.isNaN(costPrice) || costPrice < 0) {
      return {
        error: `costPrice must be a non-negative number, got "${row.costPrice}"`,
        confidence: 0,
      };
    }
    if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
      return {
        error: `sellingPrice must be a non-negative number, got "${row.sellingPrice}"`,
        confidence: 0,
      };
    }

    const stockQty = Number(row.stockQty ?? row.stock_qty ?? 0);
    if (Number.isNaN(stockQty) || stockQty < 0) {
      return {
        error: `stockQty must be a non-negative number, got "${row.stockQty}"`,
        confidence: 0,
      };
    }

    // A valid row still gets a reduced confidence when a real field (kind/category/sku) had no
    // mapped source column at all, since a silent default (e.g. "product") stood in for it.
    const category = row.category?.trim() || undefined;
    const sku = row.sku?.trim() || undefined;
    const usedDefault =
      !kindMapped ||
      (!category && mapping && !Object.values(mapping).includes('category'));
    const confidence = usedDefault ? 0.7 : 1;

    return {
      data: { name, kind, category, sku, costPrice, sellingPrice, stockQty },
      confidence,
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
