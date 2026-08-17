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
exports.StockCountService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const activity_service_1 = require("../activity/activity.service");
const inventory_constants_1 = require("./inventory.constants");
const prisma_1 = require("../../generated/prisma");
let StockCountService = class StockCountService {
    tenantPrisma;
    activity;
    constructor(tenantPrisma, activity) {
        this.tenantPrisma = tenantPrisma;
        this.activity = activity;
    }
    async create(businessId, actorUserId, dto) {
        const productIds = dto.lines.map((l) => l.productId);
        const products = await this.tenantPrisma.client.product.findMany({
            where: { id: { in: productIds }, kind: prisma_1.ProductKind.product },
        });
        if (products.length !== new Set(productIds).size) {
            throw new app_exception_1.AppException(inventory_constants_1.STOCK_COUNT_ERROR_CODES.ITEM_NOT_FOUND, 'One or more items are not real physical products of this business', common_1.HttpStatus.BAD_REQUEST);
        }
        const productMap = new Map(products.map((p) => [p.id, p]));
        return this.tenantPrisma.client.stockCount.create({
            data: {
                businessId,
                note: dto.note,
                createdByUserId: actorUserId,
                lines: {
                    create: dto.lines.map((line) => {
                        const product = productMap.get(line.productId);
                        return {
                            productId: line.productId,
                            expectedQty: product.stockQty,
                            countedQty: line.countedQty,
                            variance: line.countedQty - product.stockQty,
                        };
                    }),
                },
            },
            include: { lines: { include: { product: true } } },
        });
    }
    list(status) {
        return this.tenantPrisma.client.stockCount.findMany({
            where: { status },
            orderBy: { createdAt: 'desc' },
            include: { lines: { include: { product: true } } },
        });
    }
    async findOne(id) {
        const count = await this.tenantPrisma.client.stockCount.findUnique({
            where: { id },
            include: { lines: { include: { product: true } } },
        });
        if (!count) {
            throw new common_1.NotFoundException('Stock count not found');
        }
        return count;
    }
    async apply(businessId, id, actorUserId) {
        const count = await this.findOne(id);
        if (count.status !== prisma_1.StockCountStatus.draft) {
            throw new app_exception_1.AppException(inventory_constants_1.STOCK_COUNT_ERROR_CODES.ALREADY_APPLIED, `Stock count is already "${count.status}"`, common_1.HttpStatus.CONFLICT);
        }
        let adjustedLines = 0;
        const applied = await this.tenantPrisma.client.$transaction(async (tx) => {
            for (const line of count.lines) {
                const liveProduct = await tx.product.findUniqueOrThrow({
                    where: { id: line.productId },
                });
                const liveVariance = line.countedQty - liveProduct.stockQty;
                if (liveVariance === 0)
                    continue;
                adjustedLines += 1;
                await tx.product.update({
                    where: { id: line.productId },
                    data: { stockQty: line.countedQty },
                });
                await tx.stockMovement.create({
                    data: {
                        businessId,
                        productId: line.productId,
                        kind: prisma_1.StockMovementKind.adjustment,
                        qty: liveVariance,
                        reason: `Stock count ${id}: ${liveProduct.stockQty} -> ${line.countedQty}`,
                    },
                });
            }
            return tx.stockCount.update({
                where: { id },
                data: {
                    status: prisma_1.StockCountStatus.applied,
                    appliedByUserId: actorUserId,
                    appliedAt: new Date(),
                },
            });
        });
        await this.activity.record(businessId, {
            type: 'stock',
            description: `Stock count applied — ${adjustedLines} item(s) adjusted`,
            entityType: 'StockCount',
            entityId: id,
            actorUserId,
        });
        return applied;
    }
};
exports.StockCountService = StockCountService;
exports.StockCountService = StockCountService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        activity_service_1.ActivityService])
], StockCountService);
//# sourceMappingURL=stock-count.service.js.map