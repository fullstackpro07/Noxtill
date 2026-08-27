import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { SendGateService } from '../messaging/send-gate.service';
import { buildLedgerRows } from './credit.types';

/** Record Book-style credit statement PDF (BE-032): dated entries + running balance. */
@Injectable()
export class CreditStatementService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly s3: S3Service,
    private readonly pdfRenderer: PdfRendererService,
    private readonly sendGate: SendGateService,
  ) {}

  async generate(
    businessId: string,
    customerId: string,
  ): Promise<{ url: string }> {
    const [business, customer, entries] = await Promise.all([
      this.tenantPrisma.client.business.findUniqueOrThrow({
        where: { id: businessId },
      }),
      this.tenantPrisma.client.customer.findUnique({
        where: { id: customerId },
      }),
      this.tenantPrisma.client.creditEntry.findMany({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const rows = buildLedgerRows(entries);

    const html = this.renderHtml(business, customer, rows);
    const pdf = await this.pdfRenderer.renderPdf(html);

    const key = `statements/${businessId}/${customerId}-${Date.now()}.pdf`;
    const url = await this.s3.uploadAndSign(key, pdf, 'application/pdf');

    return { url };
  }

  /** Statements screen's "send on WhatsApp" (UPD-FE-078) — generates the real PDF, then sends the link to the customer via the send gate (their own channel preference, not necessarily WhatsApp specifically). */
  async send(businessId: string, customerId: string): Promise<unknown> {
    const [customer, { url }] = await Promise.all([
      this.tenantPrisma.client.customer.findUnique({
        where: { id: customerId },
      }),
      this.generate(businessId, customerId),
    ]);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.sendGate.send({
      businessId,
      customerId,
      templateKey: 'credit_statement_ready',
      variables: { customerName: customer.name, url },
    });
  }

  /** Statements screen's "bulk generate" (UPD-FE-078) — real per-customer PDFs, generated sequentially so a failure on one customer doesn't lose the others already generated. */
  async bulkGenerate(
    businessId: string,
    customerIds: string[],
  ): Promise<{ customerId: string; url: string | null }[]> {
    const results: { customerId: string; url: string | null }[] = [];
    for (const customerId of customerIds) {
      try {
        const { url } = await this.generate(businessId, customerId);
        results.push({ customerId, url });
      } catch {
        results.push({ customerId, url: null });
      }
    }
    return results;
  }

  private renderHtml(
    business: {
      name: string;
      currency: string;
      locale: string;
      timezone: string;
    },
    customer: { name: string; phone: string },
    rows: {
      date: Date;
      kind: string;
      amount: number;
      note: string | null;
      runningBalance: number;
    }[],
  ): string {
    const lines = rows
      .map(
        (row) => `
          <tr>
            <td>${this.locale.formatDate(row.date, business)}</td>
            <td>${row.kind === 'credit' ? 'Credit' : 'Payment'}${row.note ? ` — ${row.note}` : ''}</td>
            <td style="text-align:right">${row.kind === 'credit' ? '+' : '-'}${this.locale.formatCurrency(row.amount, business)}</td>
            <td style="text-align:right">${this.locale.formatCurrency(row.runningBalance, business)}</td>
          </tr>`,
      )
      .join('');

    const finalBalance = rows.length ? rows[rows.length - 1].runningBalance : 0;

    return `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: sans-serif; color: #182420;">
          <div style="background:#0C4B3B; color:#fff; padding:24px;">
            <h1 style="margin:0;">${business.name}</h1>
            <p style="margin:4px 0 0;">Credit Statement</p>
          </div>
          <div style="padding:24px;">
            <p><strong>${customer.name}</strong> · ${customer.phone}</p>
            <table style="width:100%; border-collapse:collapse; margin-top:16px;">
              <thead>
                <tr style="border-bottom:2px solid #D8D0BF;">
                  <th style="text-align:left;">Date</th>
                  <th style="text-align:left;">Entry</th>
                  <th style="text-align:right;">Amount</th>
                  <th style="text-align:right;">Balance</th>
                </tr>
              </thead>
              <tbody>${lines}</tbody>
            </table>
            <h3 style="text-align:right; margin-top:16px;">
              Outstanding balance: ${this.locale.formatCurrency(finalBalance, business)}
            </h3>
          </div>
        </body>
      </html>
    `;
  }
}
