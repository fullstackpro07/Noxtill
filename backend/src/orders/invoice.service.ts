import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { SendGateService } from '../messaging/send-gate.service';
import { TerminologyService } from '../settings/terminology.service';

/** Renders the A4 invoice HTML (spec §4.10) into a PDF via Puppeteer, uploads it, and optionally sends the receipt. */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly s3: S3Service,
    private readonly sendGate: SendGateService,
    private readonly pdfRenderer: PdfRendererService,
    private readonly terminology: TerminologyService,
  ) {}

  async generate(
    businessId: string,
    orderId: string,
    send = false,
  ): Promise<{ url: string }> {
    const [order, business] = await Promise.all([
      this.tenantPrisma.client.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, payments: true, customer: true },
      }),
      this.tenantPrisma.client.business.findUniqueOrThrow({
        where: { id: businessId },
      }),
    ]);

    // Terminology Engine (UPD-BE-038) — `getArea` already merges real defaults with any real
    // override, so behavior is byte-for-byte unchanged unless a business has configured one.
    const terms = await this.terminology.getArea(businessId, 'pdf');
    const html = this.renderHtml(order, business, terms);
    const pdfBuffer = await this.pdfRenderer.renderPdf(html);

    const key = `invoices/${businessId}/${order.id}.pdf`;
    const url = await this.s3.uploadAndSign(key, pdfBuffer, 'application/pdf');

    if (send && order.customerId) {
      await this.sendGate
        .send({
          businessId,
          customerId: order.customerId,
          templateKey: 'receipt',
          variables: {
            orderNo: String(order.orderNo),
            total: this.locale.formatCurrency(Number(order.total), business),
            receiptUrl: url,
          },
        })
        .catch(() => undefined);
    }

    return { url };
  }

  private renderHtml(
    order: Awaited<
      ReturnType<typeof this.tenantPrisma.client.order.findUniqueOrThrow>
    > & {
      items: { name: string; price: unknown; qty: number }[];
      customer: { name: string; phone: string } | null;
    },
    business: {
      name: string;
      currency: string;
      locale: string;
      taxLabel: string;
    },
    terms: Record<string, string>,
  ): string {
    const rows = order.items
      .map(
        (item) => `
          <tr>
            <td>${item.name}</td>
            <td style="text-align:center">${item.qty}</td>
            <td style="text-align:right">${this.locale.formatCurrency(Number(item.price), business)}</td>
            <td style="text-align:right">${this.locale.formatCurrency(Number(item.price) * item.qty, business)}</td>
          </tr>`,
      )
      .join('');

    return `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: sans-serif; color: #182420;">
          <div style="background:#0C4B3B; color:#fff; padding:24px;">
            <h1 style="margin:0;">${business.name}</h1>
          </div>
          <div style="padding:24px;">
            <p><strong>${terms.orderNumber}${order.orderNo}</strong> — ${new Date(order.createdAt).toLocaleDateString()}</p>
            ${order.customer ? `<p>${order.customer.name} · ${order.customer.phone}</p>` : ''}
            <table style="width:100%; border-collapse:collapse; margin-top:16px;">
              <thead>
                <tr style="border-bottom:2px solid #D8D0BF;">
                  <th style="text-align:left;">${terms.item}</th>
                  <th>${terms.qty}</th>
                  <th style="text-align:right;">${terms.price}</th>
                  <th style="text-align:right;">${terms.total}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div style="margin-top:16px; text-align:right;">
              <p>${terms.subtotal}: ${this.locale.formatCurrency(Number(order.subtotal), business)}</p>
              <p>${business.taxLabel}: ${this.locale.formatCurrency(Number(order.tax), business)}</p>
              <p>${terms.discount}: -${this.locale.formatCurrency(Number(order.discount), business)}</p>
              <h3>${terms.total}: ${this.locale.formatCurrency(Number(order.total), business)}</h3>
            </div>
            <p style="margin-top:32px;">Thank you for your business!</p>
          </div>
        </body>
      </html>
    `;
  }
}
