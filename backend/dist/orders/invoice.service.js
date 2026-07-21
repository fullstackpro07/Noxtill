"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const locale_service_1 = require("../common/localization/locale.service");
const s3_service_1 = require("../common/storage/s3.service");
const pdf_renderer_service_1 = require("../common/pdf/pdf-renderer.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
let InvoiceService = class InvoiceService {
    tenantPrisma;
    locale;
    s3;
    sendGate;
    pdfRenderer;
    constructor(tenantPrisma, locale, s3, sendGate, pdfRenderer) {
        this.tenantPrisma = tenantPrisma;
        this.locale = locale;
        this.s3 = s3;
        this.sendGate = sendGate;
        this.pdfRenderer = pdfRenderer;
    }
    async generate(businessId, orderId, send = false) {
        const [order, business] = await Promise.all([
            this.tenantPrisma.client.order.findUniqueOrThrow({
                where: { id: orderId },
                include: { items: true, payments: true, customer: true },
            }),
            this.tenantPrisma.client.business.findUniqueOrThrow({
                where: { id: businessId },
            }),
        ]);
        const html = this.renderHtml(order, business);
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
    renderHtml(order, business) {
        const rows = order.items
            .map((item) => `
          <tr>
            <td>${item.name}</td>
            <td style="text-align:center">${item.qty}</td>
            <td style="text-align:right">${this.locale.formatCurrency(Number(item.price), business)}</td>
            <td style="text-align:right">${this.locale.formatCurrency(Number(item.price) * item.qty, business)}</td>
          </tr>`)
            .join('');
        return `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: sans-serif; color: #182420;">
          <div style="background:#0C4B3B; color:#fff; padding:24px;">
            <h1 style="margin:0;">${business.name}</h1>
          </div>
          <div style="padding:24px;">
            <p><strong>Order #${order.orderNo}</strong> — ${new Date(order.createdAt).toLocaleDateString()}</p>
            ${order.customer ? `<p>${order.customer.name} · ${order.customer.phone}</p>` : ''}
            <table style="width:100%; border-collapse:collapse; margin-top:16px;">
              <thead>
                <tr style="border-bottom:2px solid #D8D0BF;">
                  <th style="text-align:left;">Item</th>
                  <th>Qty</th>
                  <th style="text-align:right;">Price</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div style="margin-top:16px; text-align:right;">
              <p>Subtotal: ${this.locale.formatCurrency(Number(order.subtotal), business)}</p>
              <p>${business.taxLabel}: ${this.locale.formatCurrency(Number(order.tax), business)}</p>
              <p>Discount: -${this.locale.formatCurrency(Number(order.discount), business)}</p>
              <h3>Total: ${this.locale.formatCurrency(Number(order.total), business)}</h3>
            </div>
            <p style="margin-top:32px;">Thank you for your business!</p>
          </div>
        </body>
      </html>
    `;
    }
};
exports.InvoiceService = InvoiceService;
exports.InvoiceService = InvoiceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        locale_service_1.LocaleService,
        s3_service_1.S3Service,
        send_gate_service_1.SendGateService,
        pdf_renderer_service_1.PdfRendererService])
], InvoiceService);
//# sourceMappingURL=invoice.service.js.map