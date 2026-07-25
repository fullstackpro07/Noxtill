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
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const RESULTS_PER_GROUP = 5;
const TRIGRAM_SIMILARITY_THRESHOLD = 0.2;
let SearchService = class SearchService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    async search(query) {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const client = this.tenantPrisma.client;
        const [customers, products, orders, appointments, credit] = await Promise.all([
            client.$queryRaw `
        SELECT id, name, phone FROM customers
        WHERE business_id = ${businessId} AND (similarity(name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD} OR phone ILIKE ${'%' + query + '%'})
        ORDER BY similarity(name, ${query}) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
            client.$queryRaw `
        SELECT id, name FROM products
        WHERE business_id = ${businessId} AND similarity(name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD}
        ORDER BY similarity(name, ${query}) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
            /^\d+$/.test(query)
                ? client.$queryRaw `
            SELECT id, order_no FROM orders
            WHERE business_id = ${businessId} AND order_no = ${Number(query)}
            LIMIT ${RESULTS_PER_GROUP}
          `
                : Promise.resolve([]),
            client.$queryRaw `
        SELECT a.id, p.name AS service_name, c.name AS customer_name, a.starts_at
        FROM appointments a
        JOIN products p ON p.id = a.service_id
        JOIN customers c ON c.id = a.customer_id
        WHERE a.business_id = ${businessId} AND (similarity(c.name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD} OR similarity(p.name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD})
        ORDER BY a.starts_at DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
            client.$queryRaw `
        SELECT v.customer_id, c.name, v.balance
        FROM v_credit_balances v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.business_id = ${businessId} AND v.balance > 0 AND similarity(c.name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD}
        ORDER BY similarity(c.name, ${query}) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
        ]);
        return {
            customers: customers.map((c) => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
            })),
            products: products.map((p) => ({ id: p.id, name: p.name })),
            orders: orders.map((o) => ({ id: o.id, orderNo: o.order_no })),
            appointments: appointments.map((a) => ({
                id: a.id,
                serviceName: a.service_name,
                customerName: a.customer_name,
                startsAt: a.starts_at,
            })),
            credit: credit.map((c) => ({
                customerId: c.customer_id,
                name: c.name,
                balance: Number(c.balance),
            })),
        };
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], SearchService);
//# sourceMappingURL=search.service.js.map