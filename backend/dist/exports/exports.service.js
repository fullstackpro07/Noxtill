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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportsService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const exceljs_1 = __importDefault(require("exceljs"));
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const s3_service_1 = require("../common/storage/s3.service");
const exports_constants_1 = require("./exports.constants");
const SHEET_COLUMNS = {
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
};
const SHEET_TITLE = {
    sales: 'Sales',
    customers: 'Customers',
    credit: 'Credit',
    stock: 'Stock',
    expenses: 'Expenses',
};
let ExportsService = class ExportsService {
    tenantPrisma;
    s3;
    exportsQueue;
    constructor(tenantPrisma, s3, exportsQueue) {
        this.tenantPrisma = tenantPrisma;
        this.s3 = s3;
        this.exportsQueue = exportsQueue;
    }
    async enqueueAccountZip(businessId, userId) {
        await this.exportsQueue.add('account-zip', { businessId, userId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
        return { queued: true };
    }
    async generateXlsx(businessId, kind) {
        const buffer = await this.buildXlsxBuffer(businessId, kind);
        const key = `exports/${businessId}/${kind}-${Date.now()}.xlsx`;
        const url = await this.s3.uploadAndSign(key, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { url };
    }
    async buildXlsxBuffer(businessId, kind) {
        const rows = await this.fetchRows(businessId, kind);
        const workbook = new exceljs_1.default.Workbook();
        const sheet = workbook.addWorksheet(SHEET_TITLE[kind]);
        sheet.columns = SHEET_COLUMNS[kind];
        sheet.addRows(rows);
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
    async fetchRows(businessId, kind) {
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
        }
    }
    async fetchSalesRows() {
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
    async fetchCustomerRows() {
        const customers = await this.tenantPrisma.client.customer.findMany({
            orderBy: { name: 'asc' },
        });
        return customers.map((c) => ({
            name: c.name,
            phone: c.phone,
            email: c.email ?? '',
            tags: c.tags.join(', '),
            lifetimeSpend: Number(c.lifetimeSpend),
            visitCount: c.visitCount,
            lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString().slice(0, 10) : '',
            optedOut: c.optedOut ? 'Yes' : 'No',
        }));
    }
    async fetchCreditRows(businessId) {
        const rows = await this.tenantPrisma.client.$queryRaw `
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
            lastEntryAt: r.last_entry_at ? new Date(r.last_entry_at).toISOString().slice(0, 10) : '',
        }));
    }
    async fetchStockRows() {
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
    async fetchExpenseRows() {
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
};
exports.ExportsService = ExportsService;
exports.ExportsService = ExportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_1.InjectQueue)(exports_constants_1.EXPORTS_QUEUE)),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        s3_service_1.S3Service,
        bullmq_2.Queue])
], ExportsService);
//# sourceMappingURL=exports.service.js.map