import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import ExcelJS from 'exceljs';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { ExportFormat, ExportKind, EXPORTS_QUEUE } from './exports.constants';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string;
  balance: number;
  last_entry_at: Date;
  days_outstanding: number;
}

const SHEET_COLUMNS: Record<
  ExportKind,
  { header: string; key: string; width: number }[]
> = {
  sales: [
    { header: 'Order #', key: 'orderNo', width: 10 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'Tax', key: 'tax', width: 10 },
    { header: 'Discount', key: 'discount', width: 10 },
    { header: 'Total', key: 'total', width: 12 },
  ],
  customers: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Lifetime spend', key: 'lifetimeSpend', width: 14 },
    { header: 'Visits', key: 'visitCount', width: 10 },
    { header: 'Last visit', key: 'lastVisitAt', width: 14 },
    { header: 'Opted out', key: 'optedOut', width: 10 },
  ],
  credit: [
    { header: 'Customer', key: 'name', width: 24 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Balance', key: 'balance', width: 12 },
    { header: 'Days outstanding', key: 'daysOutstanding', width: 16 },
    { header: 'Last entry', key: 'lastEntryAt', width: 14 },
  ],
  stock: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Stock qty', key: 'stockQty', width: 10 },
    { header: 'Low-stock threshold', key: 'lowStockThreshold', width: 16 },
    { header: 'Cost price', key: 'costPrice', width: 12 },
    { header: 'Selling price', key: 'sellingPrice', width: 12 },
  ],
  expenses: [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Recurring', key: 'recurring', width: 10 },
  ],
  products: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Kind', key: 'kind', width: 10 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Stock qty', key: 'stockQty', width: 10 },
    { header: 'Cost price', key: 'costPrice', width: 12 },
    { header: 'Selling price', key: 'sellingPrice', width: 12 },
    { header: 'Active', key: 'active', width: 8 },
  ],
};

const SHEET_TITLE: Record<ExportKind, string> = {
  sales: 'Sales',
  customers: 'Customers',
  credit: 'Credit',
  stock: 'Stock',
  expenses: 'Expenses',
  products: 'Products',
};

/** First real usage of the `exceljs` dependency in this codebase (previously installed but unused). */
@Injectable()
export class ExportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly pdfRenderer: PdfRendererService,
    @InjectQueue(EXPORTS_QUEUE) private readonly exportsQueue: Queue,
  ) {}

  async enqueueAccountZip(
    businessId: string,
    userId: string,
  ): Promise<{ queued: true }> {
    await this.exportsQueue.add(
      'account-zip',
      { businessId, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
    return { queued: true };
  }

  async generateXlsx(
    businessId: string,
    kind: ExportKind,
  ): Promise<{ url: string }> {
    return this.generate(businessId, kind, 'xlsx');
  }

  /** Products Export (UPD-BE-089) adds `csv`/`pdf` alongside the pre-existing `xlsx` format —
   * every other export kind keeps working unchanged via the `xlsx` default. */
  async generate(
    businessId: string,
    kind: ExportKind,
    format: ExportFormat = 'xlsx',
  ): Promise<{ url: string }> {
    const rows = await this.fetchRows(businessId, kind);
    const key = `exports/${businessId}/${kind}-${Date.now()}.${format}`;

    if (format === 'csv') {
      const buffer = await this.buildCsvBuffer(kind, rows);
      const url = await this.s3.uploadAndSign(key, buffer, 'text/csv');
      return { url };
    }
    if (format === 'pdf') {
      const buffer = await this.buildPdfBuffer(kind, rows);
      const url = await this.s3.uploadAndSign(key, buffer, 'application/pdf');
      return { url };
    }
    const buffer = await this.buildXlsxBuffer(businessId, kind, rows);
    const url = await this.s3.uploadAndSign(
      key,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return { url };
  }

  async buildXlsxBuffer(
    businessId: string,
    kind: ExportKind,
    preFetchedRows?: Record<string, unknown>[],
  ): Promise<Buffer> {
    const rows = preFetchedRows ?? (await this.fetchRows(businessId, kind));
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_TITLE[kind]);
    sheet.columns = SHEET_COLUMNS[kind];
    sheet.addRows(rows);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async buildCsvBuffer(
    kind: ExportKind,
    rows: Record<string, unknown>[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_TITLE[kind]);
    sheet.columns = SHEET_COLUMNS[kind];
    sheet.addRows(rows);
    const buffer = await workbook.csv.writeBuffer();
    return Buffer.from(buffer);
  }

  private async buildPdfBuffer(
    kind: ExportKind,
    rows: Record<string, unknown>[],
  ): Promise<Buffer> {
    const columns = SHEET_COLUMNS[kind];
    const headerCells = columns
      .map(
        (c) =>
          `<th style="text-align:left;padding:6px 10px;">${escapeHtml(c.header)}</th>`,
      )
      .join('');
    const bodyRows = rows
      .map(
        (row) =>
          `<tr>${columns
            .map(
              (c) =>
                `<td style="padding:6px 10px;border-top:1px solid #D8D0BF;">${escapeHtml(cellText(row[c.key]))}</td>`,
            )
            .join('')}</tr>`,
      )
      .join('');
    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: sans-serif; color: #182420;">
          <h1 style="margin:0 0 16px;">${SHEET_TITLE[kind]}</h1>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead><tr style="border-bottom:2px solid #D8D0BF;">${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `;
    return this.pdfRenderer.renderPdf(html);
  }

  private async fetchRows(
    businessId: string,
    kind: ExportKind,
  ): Promise<Record<string, unknown>[]> {
    switch (kind) {
      case 'sales':
        return this.fetchSalesRows();
      case 'customers':
        return this.fetchCustomerRows();
      case 'credit':
        return this.fetchCreditRows(businessId);
      case 'stock':
        return this.fetchStockRows();
      case 'expenses':
        return this.fetchExpenseRows();
      case 'products':
        return this.fetchProductRows();
    }
  }

  private async fetchSalesRows(): Promise<Record<string, unknown>[]> {
    const orders = await this.tenantPrisma.client.order.findMany({
      where: { isQuotation: false },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => ({
      orderNo: o.orderNo,
      date: o.createdAt.toISOString().slice(0, 10),
      customer: o.customer?.name ?? 'Walk-in',
      status: o.status,
      subtotal: Number(o.subtotal),
      tax: Number(o.tax),
      discount: Number(o.discount),
      total: Number(o.total),
    }));
  }

  private async fetchCustomerRows(): Promise<Record<string, unknown>[]> {
    const customers = await this.tenantPrisma.client.customer.findMany({
      orderBy: { name: 'asc' },
    });
    return customers.map((c) => ({
      name: c.name,
      phone: c.phone,
      email: c.email ?? '',
      // MySQL migration: `tags` is a JSON column now (Prisma's MySQL connector has no native
      // array column type), hence the explicit `string[]` read.
      tags: ((c.tags as string[] | null) ?? []).join(', '),
      lifetimeSpend: Number(c.lifetimeSpend),
      visitCount: c.visitCount,
      lastVisitAt: c.lastVisitAt
        ? c.lastVisitAt.toISOString().slice(0, 10)
        : '',
      optedOut: c.optedOut ? 'Yes' : 'No',
    }));
  }

  private async fetchCreditRows(
    businessId: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.tenantPrisma.client.$queryRaw<DebtorRow[]>`
      SELECT v.customer_id, c.name, c.phone, v.balance, v.last_entry_at, v.days_outstanding
      FROM v_credit_balances v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id = ${businessId} AND v.balance > 0
      ORDER BY v.balance DESC
    `;
    return rows.map((r) => ({
      name: r.name,
      phone: r.phone,
      balance: Number(r.balance),
      daysOutstanding: r.days_outstanding,
      lastEntryAt: r.last_entry_at
        ? new Date(r.last_entry_at).toISOString().slice(0, 10)
        : '',
    }));
  }

  private async fetchStockRows(): Promise<Record<string, unknown>[]> {
    const products = await this.tenantPrisma.client.product.findMany({
      orderBy: { name: 'asc' },
    });
    return products.map((p) => ({
      name: p.name,
      sku: p.sku ?? '',
      category: p.category ?? '',
      stockQty: p.stockQty,
      lowStockThreshold: p.lowStockThreshold,
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.sellingPrice),
    }));
  }

  /** Owner-only end to end — `ExportsController` gates the whole controller on `EXPORTS_GENERATE`
   * (owner-only, see capabilities), so cost price never reaches a manager through this export. */
  private async fetchProductRows(): Promise<Record<string, unknown>[]> {
    const products = await this.tenantPrisma.client.product.findMany({
      include: { categoryRef: true },
      orderBy: { name: 'asc' },
    });
    return products.map((p) => ({
      name: p.name,
      kind: p.kind,
      sku: p.sku ?? '',
      category: p.categoryRef?.name ?? p.category ?? '',
      stockQty: p.kind === 'product' ? p.stockQty : '',
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.sellingPrice),
      active: p.active ? 'Yes' : 'No',
    }));
  }

  private async fetchExpenseRows(): Promise<Record<string, unknown>[]> {
    const expenses = await this.tenantPrisma.client.expense.findMany({
      orderBy: { incurredOn: 'desc' },
    });
    return expenses.map((e) => ({
      date: e.incurredOn.toISOString().slice(0, 10),
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      recurring: e.recurring ? 'Yes' : 'No',
    }));
  }
}
