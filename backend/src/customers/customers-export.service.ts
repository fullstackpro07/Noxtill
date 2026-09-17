import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { ExportCustomersDto } from './dto/export-customers.dto';

interface DebtorBalanceRow {
  customer_id: string;
  balance: number;
}

export const CUSTOMER_EXPORT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'tags', label: 'Tags' },
  { key: 'spend', label: 'Total spend' },
  { key: 'visits', label: 'Visits' },
  { key: 'lastVisit', label: 'Last visit' },
  { key: 'credit', label: 'Credit balance' },
] as const;
export type CustomerExportField = (typeof CUSTOMER_EXPORT_FIELDS)[number]['key'];

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Customer Export screen (UPD-BE-101) — a real, field-selectable bulk export, reusing the same
 * S3/Puppeteer/ExcelJS pipeline as `src/exports/exports.service.ts` (that generic exporter's fixed
 * `customers`/`credit` "kinds" don't support per-field selection, which the design requires, hence
 * a dedicated service rather than bolting a field-picker onto the generic one). Every export is
 * logged to `CustomerExportLog` — the history the Export screen shows.
 */
@Injectable()
export class CustomersExportService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly pdfRenderer: PdfRendererService,
  ) {}

  async generate(
    businessId: string,
    userId: string,
    dto: ExportCustomersDto,
    allowCreditField: boolean,
  ): Promise<{ url: string; rowCount: number }> {
    const fields = dto.fields.filter(
      (f) => (CUSTOMER_EXPORT_FIELDS as readonly { key: string }[]).some((cf) => cf.key === f) && (f !== 'credit' || allowCreditField),
    ) as CustomerExportField[];

    const customers = await this.tenantPrisma.client.customer.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });

    let balanceByCustomer = new Map<string, number>();
    if (fields.includes('credit')) {
      const rows = await this.tenantPrisma.client.$queryRaw<DebtorBalanceRow[]>`
        SELECT v.customer_id, v.balance
        FROM v_credit_balances v
        WHERE v.business_id = ${businessId}
      `;
      balanceByCustomer = new Map(rows.map((r) => [r.customer_id, Number(r.balance)]));
    }

    const columns = CUSTOMER_EXPORT_FIELDS.filter((f) => fields.includes(f.key));
    const rows = customers.map((c) => {
      const values: Record<CustomerExportField, string> = {
        name: c.name,
        phone: c.phone,
        email: c.email ?? '',
        tags: ((c.tags as string[] | null) ?? []).join('; '),
        spend: Number(c.lifetimeSpend).toString(),
        visits: String(c.visitCount),
        lastVisit: c.lastVisitAt ? c.lastVisitAt.toISOString().slice(0, 10) : '',
        credit: String(balanceByCustomer.get(c.id) ?? 0),
      };
      return columns.map((col) => values[col.key]);
    });

    const key = `customer-exports/${businessId}/${Date.now()}.${dto.format}`;
    let url: string;
    if (dto.format === 'csv') {
      const header = columns.map((c) => csvCell(c.label)).join(',');
      const body = rows.map((r) => r.map(csvCell).join(',')).join('\n');
      url = await this.s3.uploadAndSign(key, Buffer.from(`${header}\n${body}`), 'text/csv');
    } else if (dto.format === 'pdf') {
      const headerHtml = columns.map((c) => `<th style="text-align:left;padding:6px 10px;">${escapeHtml(c.label)}</th>`).join('');
      const bodyHtml = rows
        .map((r) => `<tr>${r.map((cell) => `<td style="padding:6px 10px;border-top:1px solid #E6EAF0;">${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('');
      const html = `<html><head><meta charset="utf-8"/></head><body style="font-family:sans-serif;color:#101828;">
        <h1 style="margin:0 0 16px;">Customers</h1>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:2px solid #E6EAF0;">${headerHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </body></html>`;
      const buffer = await this.pdfRenderer.renderPdf(html);
      url = await this.s3.uploadAndSign(key, buffer, 'application/pdf');
    } else {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Customers');
      sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 20 }));
      sheet.addRows(rows.map((r) => columns.reduce((acc, col, i) => ({ ...acc, [col.key]: r[i] }), {} as Record<string, string>)));
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      url = await this.s3.uploadAndSign(key, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    await this.tenantPrisma.client.customerExportLog.create({
      data: {
        businessId,
        userId,
        format: dto.format,
        rowCount: rows.length,
        fields,
        fileUrl: url,
      },
    });

    return { url, rowCount: rows.length };
  }

  history(businessId: string) {
    return this.tenantPrisma.client.customerExportLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
