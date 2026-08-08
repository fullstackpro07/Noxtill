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
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const locale_service_1 = require("../common/localization/locale.service");
const s3_service_1 = require("../common/storage/s3.service");
const pdf_renderer_service_1 = require("../common/pdf/pdf-renderer.service");
const profit_service_1 = require("../profit/profit.service");
const commissions_service_1 = require("../staff/commissions.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const app_exception_1 = require("../common/filters/app.exception");
const prisma_1 = require("../../generated/prisma");
const reports_types_1 = require("./reports.types");
let ReportsService = class ReportsService {
    tenantPrisma;
    locale;
    s3;
    pdfRenderer;
    profitService;
    commissionsService;
    sendGate;
    constructor(tenantPrisma, locale, s3, pdfRenderer, profitService, commissionsService, sendGate) {
        this.tenantPrisma = tenantPrisma;
        this.locale = locale;
        this.s3 = s3;
        this.pdfRenderer = pdfRenderer;
        this.profitService = profitService;
        this.commissionsService = commissionsService;
        this.sendGate = sendGate;
    }
    async generate(kind, month, authUser) {
        const resolvedMonth = month ?? (0, reports_types_1.currentMonth)();
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({ where: { id: authUser.businessId } });
        const businessUser = await this.tenantPrisma.client.businessUser.findUnique({
            where: {
                businessId_userId: {
                    businessId: authUser.businessId,
                    userId: authUser.sub,
                },
            },
        });
        const bodyHtml = await this.buildBody(kind, resolvedMonth, business, authUser.role, businessUser?.id);
        const html = this.renderHtml(reports_types_1.REPORT_LABELS[kind], business, bodyHtml);
        const pdf = await this.pdfRenderer.renderPdf(html);
        const key = `reports/${authUser.businessId}/${kind}-${resolvedMonth}.pdf`;
        const url = await this.s3.uploadAndSign(key, pdf, 'application/pdf');
        return { url };
    }
    async send(kind, month, authUser) {
        const { url } = await this.generate(kind, month, authUser);
        const user = await this.tenantPrisma.client.user.findUniqueOrThrow({
            where: { id: authUser.sub },
        });
        return this.sendGate.send({
            businessId: authUser.businessId,
            templateKey: 'report_ready',
            to: { phone: user.phone ?? undefined, email: user.email ?? undefined },
            variables: { reportLabel: reports_types_1.REPORT_LABELS[kind], url },
        });
    }
    async buildBody(kind, month, business, role, businessUserId) {
        switch (kind) {
            case 'monthly':
                return this.buildMonthly(month, business);
            case 'pnl':
                return this.buildPnl(month, business);
            case 'sales':
                return this.buildSales(month, business, role, businessUserId);
            case 'staff':
                if (role === prisma_1.Role.staff) {
                    throw new app_exception_1.AppException('REPORT_FORBIDDEN', 'Staff performance reports are only available to owners and managers.', common_1.HttpStatus.FORBIDDEN);
                }
                return this.buildStaff(month);
            case 'reviews':
                return this.buildReviews(month);
        }
    }
    async buildMonthly(month, business) {
        const { start, end } = (0, reports_types_1.monthBounds)(month);
        const [orderAgg, reviewAgg] = await Promise.all([
            this.tenantPrisma.client.order.aggregate({
                where: {
                    status: prisma_1.OrderStatus.completed,
                    isQuotation: false,
                    createdAt: { gte: start, lt: end },
                },
                _sum: { total: true },
                _count: true,
            }),
            this.tenantPrisma.client.externalReview.aggregate({
                where: { createdAt: { gte: start, lt: end } },
                _avg: { stars: true },
            }),
        ]);
        const revenue = (0, reports_types_1.round2)(Number(orderAgg._sum.total ?? 0));
        const orders = orderAgg._count;
        const avgRating = reviewAgg._avg.stars
            ? (0, reports_types_1.round2)(Number(reviewAgg._avg.stars))
            : null;
        return `
      <h2>${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td>Revenue</td><td style="text-align:right">${this.locale.formatCurrency(revenue, business)}</td></tr>
        <tr><td>Orders</td><td style="text-align:right">${orders}</td></tr>
        <tr><td>Average rating</td><td style="text-align:right">${avgRating ?? '—'}</td></tr>
      </table>
    `;
    }
    async buildPnl(month, business) {
        const pnl = await this.profitService.pnl(month);
        const expenseRows = pnl.expenses
            .map((row) => `
        <tr><td>${row.category}</td><td style="text-align:right">${this.locale.formatCurrency(row.amount, business)}</td></tr>`)
            .join('');
        return `
      <h2>Profit &amp; loss — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td>Revenue</td><td style="text-align:right">${this.locale.formatCurrency(pnl.revenue, business)}</td></tr>
        <tr><td>COGS</td><td style="text-align:right">-${this.locale.formatCurrency(pnl.cogs, business)}</td></tr>
        <tr><th colspan="2" style="text-align:left; padding-top:12px;">Expenses</th></tr>
        ${expenseRows}
        <tr><th style="border-top:2px solid #D8D0BF;">Net profit</th><th style="text-align:right; border-top:2px solid #D8D0BF;">${this.locale.formatCurrency(pnl.netProfit, business)}</th></tr>
      </table>
    `;
    }
    async buildSales(month, business, role, businessUserId) {
        const { start, end } = (0, reports_types_1.monthBounds)(month);
        const orders = await this.tenantPrisma.client.order.findMany({
            where: {
                status: prisma_1.OrderStatus.completed,
                isQuotation: false,
                createdAt: { gte: start, lt: end },
                ...(role === prisma_1.Role.staff ? { staffUserId: businessUserId } : {}),
            },
            include: { customer: true },
            orderBy: { createdAt: 'asc' },
        });
        const rows = orders
            .map((o) => `
        <tr>
          <td>#${o.orderNo}</td>
          <td>${this.locale.formatDate(o.createdAt, business)}</td>
          <td>${o.customer?.name ?? 'Walk-in'}</td>
          <td style="text-align:right">${this.locale.formatCurrency(Number(o.total), business)}</td>
        </tr>`)
            .join('');
        return `
      <h2>Sales — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No orders this month.</td></tr>'}</tbody>
      </table>
    `;
    }
    async buildStaff(month) {
        const report = await this.commissionsService.report(month);
        const rows = report
            .map((r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.role}</td>
          <td style="text-align:right">${r.totalSales}</td>
          <td style="text-align:right">${r.commission}</td>
        </tr>`)
            .join('');
        return `
      <h2>Staff performance — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr><th>Name</th><th>Role</th><th style="text-align:right">Sales</th><th style="text-align:right">Commission</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No staff found.</td></tr>'}</tbody>
      </table>
    `;
    }
    async buildReviews(month) {
        const { start, end } = (0, reports_types_1.monthBounds)(month);
        const [reviewAgg, requestsTotal, requestsResponded] = await Promise.all([
            this.tenantPrisma.client.externalReview.aggregate({
                where: { createdAt: { gte: start, lt: end } },
                _avg: { stars: true },
                _count: true,
            }),
            this.tenantPrisma.client.reviewRequest.count({
                where: { createdAt: { gte: start, lt: end } },
            }),
            this.tenantPrisma.client.reviewRequest.count({
                where: { createdAt: { gte: start, lt: end }, respondedAt: { not: null } },
            }),
        ]);
        const avgRating = reviewAgg._avg.stars
            ? (0, reports_types_1.round2)(Number(reviewAgg._avg.stars))
            : null;
        const responseRate = requestsTotal > 0
            ? (0, reports_types_1.round2)((requestsResponded / requestsTotal) * 100)
            : 0;
        return `
      <h2>Reviews — ${month}</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td>Reviews received</td><td style="text-align:right">${reviewAgg._count}</td></tr>
        <tr><td>Average rating</td><td style="text-align:right">${avgRating ?? '—'}</td></tr>
        <tr><td>Review requests sent</td><td style="text-align:right">${requestsTotal}</td></tr>
        <tr><td>Response rate</td><td style="text-align:right">${responseRate}%</td></tr>
      </table>
    `;
    }
    renderHtml(title, business, bodyHtml) {
        return `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: sans-serif; color: #182420;">
          <div style="background:#0C4B3B; color:#fff; padding:24px;">
            <h1 style="margin:0;">${business.name}</h1>
            <p style="margin:4px 0 0;">${title}</p>
          </div>
          <div style="padding:24px;">${bodyHtml}</div>
        </body>
      </html>
    `;
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        locale_service_1.LocaleService,
        s3_service_1.S3Service,
        pdf_renderer_service_1.PdfRendererService,
        profit_service_1.ProfitService,
        commissions_service_1.CommissionsService,
        send_gate_service_1.SendGateService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map