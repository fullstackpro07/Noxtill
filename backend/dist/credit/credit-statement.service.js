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
exports.CreditStatementService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const locale_service_1 = require("../common/localization/locale.service");
const s3_service_1 = require("../common/storage/s3.service");
const pdf_renderer_service_1 = require("../common/pdf/pdf-renderer.service");
let CreditStatementService = class CreditStatementService {
    tenantPrisma;
    locale;
    s3;
    pdfRenderer;
    constructor(tenantPrisma, locale, s3, pdfRenderer) {
        this.tenantPrisma = tenantPrisma;
        this.locale = locale;
        this.s3 = s3;
        this.pdfRenderer = pdfRenderer;
    }
    async generate(businessId, customerId) {
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
            throw new common_1.NotFoundException('Customer not found');
        }
        let running = 0;
        const rows = entries.map((entry) => {
            const amount = Number(entry.amount);
            running += entry.kind === 'credit' ? amount : -amount;
            return {
                date: entry.createdAt,
                kind: entry.kind,
                amount,
                note: entry.note,
                runningBalance: running,
            };
        });
        const html = this.renderHtml(business, customer, rows);
        const pdf = await this.pdfRenderer.renderPdf(html);
        const key = `statements/${businessId}/${customerId}-${Date.now()}.pdf`;
        const url = await this.s3.uploadAndSign(key, pdf, 'application/pdf');
        return { url };
    }
    renderHtml(business, customer, rows) {
        const lines = rows
            .map((row) => `
          <tr>
            <td>${this.locale.formatDate(row.date, business)}</td>
            <td>${row.kind === 'credit' ? 'Credit' : 'Payment'}${row.note ? ` — ${row.note}` : ''}</td>
            <td style="text-align:right">${row.kind === 'credit' ? '+' : '-'}${this.locale.formatCurrency(row.amount, business)}</td>
            <td style="text-align:right">${this.locale.formatCurrency(row.runningBalance, business)}</td>
          </tr>`)
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
};
exports.CreditStatementService = CreditStatementService;
exports.CreditStatementService = CreditStatementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        locale_service_1.LocaleService,
        s3_service_1.S3Service,
        pdf_renderer_service_1.PdfRendererService])
], CreditStatementService);
//# sourceMappingURL=credit-statement.service.js.map