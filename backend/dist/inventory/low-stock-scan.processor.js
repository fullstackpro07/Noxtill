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
var LowStockScanProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LowStockScanProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const low_stock_scan_constants_1 = require("./low-stock-scan.constants");
const prisma_1 = require("../../generated/prisma");
const ALERT_TEMPLATE_KEY = 'owner_alert';
let LowStockScanProcessor = LowStockScanProcessor_1 = class LowStockScanProcessor extends bullmq_1.WorkerHost {
    prisma;
    sendGate;
    logger = new common_1.Logger(LowStockScanProcessor_1.name);
    constructor(prisma, sendGate) {
        super();
        this.prisma = prisma;
        this.sendGate = sendGate;
    }
    async process() {
        const businesses = await this.prisma.business.findMany({
            select: { id: true },
        });
        for (const business of businesses) {
            await this.scanBusiness(business.id).catch((error) => this.logger.error(`Low-stock scan failed for business ${business.id}: ${error.message}`));
        }
    }
    async scanBusiness(businessId) {
        const lowStockProducts = await this.prisma.$queryRaw `
      SELECT id, name, stock_qty, low_stock_threshold FROM products
      WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold
    `;
        if (lowStockProducts.length === 0)
            return;
        if (await this.alreadyAlertedToday(businessId))
            return;
        const owner = await this.prisma.businessUser.findFirst({
            where: { businessId, role: prisma_1.Role.owner },
            include: { user: true },
        });
        if (!owner)
            return;
        const itemList = lowStockProducts
            .slice(0, 3)
            .map((p) => `${p.name} (${p.stock_qty} left)`)
            .join(', ');
        const more = lowStockProducts.length > 3
            ? ` and ${lowStockProducts.length - 3} more`
            : '';
        await this.sendGate.send({
            businessId,
            templateKey: ALERT_TEMPLATE_KEY,
            to: {
                phone: owner.user.phone ?? undefined,
                email: owner.user.email ?? undefined,
            },
            variables: {
                alertTitle: 'Low stock alert',
                alertBody: `${lowStockProducts.length} item(s) running low: ${itemList}${more}.`,
            },
        });
    }
    async alreadyAlertedToday(businessId) {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const count = await this.prisma.message.count({
            where: {
                businessId,
                templateKey: ALERT_TEMPLATE_KEY,
                createdAt: { gte: startOfDay },
            },
        });
        return count > 0;
    }
};
exports.LowStockScanProcessor = LowStockScanProcessor;
exports.LowStockScanProcessor = LowStockScanProcessor = LowStockScanProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(low_stock_scan_constants_1.LOW_STOCK_SCAN_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        send_gate_service_1.SendGateService])
], LowStockScanProcessor);
//# sourceMappingURL=low-stock-scan.processor.js.map