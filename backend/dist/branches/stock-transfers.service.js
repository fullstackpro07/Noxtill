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
exports.StockTransfersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const stock_transfers_constants_1 = require("./stock-transfers.constants");
const prisma_1 = require("../../generated/prisma");
let StockTransfersService = class StockTransfersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(sourceBusinessId, actorUserId, dto) {
        await this.assertSameBranchGroup(sourceBusinessId, dto.destBusinessId);
        const productIds = dto.items.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds }, businessId: sourceBusinessId },
        });
        if (products.length !== new Set(productIds).size) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.ITEM_NOT_FOUND, 'One or more items are not real products of the source branch', common_1.HttpStatus.BAD_REQUEST);
        }
        return this.prisma.stockTransfer.create({
            data: {
                sourceBusinessId,
                destBusinessId: dto.destBusinessId,
                note: dto.note,
                requestedByUserId: actorUserId,
                items: {
                    create: dto.items.map((i) => ({
                        sourceProductId: i.productId,
                        qty: i.qty,
                    })),
                },
            },
            include: { items: { include: { sourceProduct: true } } },
        });
    }
    list(businessId, status) {
        return this.prisma.stockTransfer.findMany({
            where: {
                OR: [{ sourceBusinessId: businessId }, { destBusinessId: businessId }],
                status,
            },
            orderBy: { createdAt: 'desc' },
            include: { items: { include: { sourceProduct: true } } },
        });
    }
    async findOne(businessId, id) {
        const transfer = await this.prisma.stockTransfer.findUnique({
            where: { id },
            include: { items: { include: { sourceProduct: true } } },
        });
        if (!transfer ||
            (transfer.sourceBusinessId !== businessId &&
                transfer.destBusinessId !== businessId)) {
            throw new common_1.NotFoundException('Stock transfer not found');
        }
        return transfer;
    }
    async approve(businessId, id, actorUserId) {
        const transfer = await this.findWithStatus(businessId, id, prisma_1.StockTransferStatus.pending);
        this.assertSourceCaller(transfer, businessId);
        for (const item of transfer.items) {
            await this.resolveDestProduct(transfer.destBusinessId, item.sourceProduct);
        }
        return this.prisma.stockTransfer.update({
            where: { id },
            data: {
                status: prisma_1.StockTransferStatus.approved,
                approvedByUserId: actorUserId,
            },
        });
    }
    async ship(businessId, id, actorUserId) {
        const transfer = await this.findWithStatus(businessId, id, prisma_1.StockTransferStatus.approved);
        this.assertSourceCaller(transfer, businessId);
        for (const item of transfer.items) {
            if (item.sourceProduct.stockQty < item.qty) {
                throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.INSUFFICIENT_STOCK, `Insufficient stock for "${item.sourceProduct.name}" (have ${item.sourceProduct.stockQty}, need ${item.qty})`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        return this.prisma.$transaction(async (tx) => {
            for (const item of transfer.items) {
                await tx.product.update({
                    where: { id: item.sourceProductId },
                    data: { stockQty: { decrement: item.qty } },
                });
                await tx.stockMovement.create({
                    data: {
                        businessId: transfer.sourceBusinessId,
                        productId: item.sourceProductId,
                        kind: prisma_1.StockMovementKind.transfer_out,
                        qty: -item.qty,
                        reason: `Stock transfer ${transfer.id} to branch ${transfer.destBusinessId}`,
                    },
                });
            }
            return tx.stockTransfer.update({
                where: { id },
                data: {
                    status: prisma_1.StockTransferStatus.shipped,
                    shippedByUserId: actorUserId,
                },
            });
        });
    }
    async receive(businessId, id, actorUserId) {
        const transfer = await this.findWithStatus(businessId, id, prisma_1.StockTransferStatus.shipped);
        this.assertDestCaller(transfer, businessId);
        return this.prisma.$transaction(async (tx) => {
            for (const item of transfer.items) {
                const destProduct = await this.resolveDestProduct(transfer.destBusinessId, item.sourceProduct, tx);
                await tx.product.update({
                    where: { id: destProduct.id },
                    data: { stockQty: { increment: item.qty } },
                });
                await tx.stockMovement.create({
                    data: {
                        businessId: transfer.destBusinessId,
                        productId: destProduct.id,
                        kind: prisma_1.StockMovementKind.transfer_in,
                        qty: item.qty,
                        reason: `Stock transfer ${transfer.id} from branch ${transfer.sourceBusinessId}`,
                    },
                });
            }
            return tx.stockTransfer.update({
                where: { id },
                data: {
                    status: prisma_1.StockTransferStatus.received,
                    receivedByUserId: actorUserId,
                },
            });
        });
    }
    async reject(businessId, id, actorUserId, reason) {
        const transfer = await this.findOne(businessId, id);
        if (transfer.status !== prisma_1.StockTransferStatus.pending &&
            transfer.status !== prisma_1.StockTransferStatus.approved) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.NOT_CANCELLABLE, `A "${transfer.status}" transfer can no longer be rejected`, common_1.HttpStatus.CONFLICT);
        }
        this.assertSourceCaller(transfer, businessId);
        return this.prisma.stockTransfer.update({
            where: { id },
            data: {
                status: prisma_1.StockTransferStatus.rejected,
                note: reason
                    ? `${transfer.note ?? ''}\n\nRejected: ${reason}`.trim()
                    : transfer.note,
                approvedByUserId: actorUserId,
            },
        });
    }
    async resolveDestProduct(destBusinessId, sourceProduct, client = this.prisma) {
        if (!sourceProduct.sku) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.NO_SKU, `"${sourceProduct.name}" has no SKU — cannot match it to a destination-branch product`, common_1.HttpStatus.CONFLICT);
        }
        const destProduct = await client.product.findFirst({
            where: { businessId: destBusinessId, sku: sourceProduct.sku },
        });
        if (!destProduct) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.NO_DEST_MATCH, `No product with SKU "${sourceProduct.sku}" exists in the destination branch — create it there first`, common_1.HttpStatus.CONFLICT);
        }
        return destProduct;
    }
    async findWithStatus(businessId, id, expectedStatus) {
        const transfer = await this.findOne(businessId, id);
        if (transfer.status !== expectedStatus) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.WRONG_STATUS, `Transfer is "${transfer.status}", expected "${expectedStatus}"`, common_1.HttpStatus.CONFLICT);
        }
        return transfer;
    }
    assertSourceCaller(transfer, businessId) {
        if (transfer.sourceBusinessId !== businessId) {
            throw new common_1.ForbiddenException('Only the source branch can perform this action');
        }
    }
    assertDestCaller(transfer, businessId) {
        if (transfer.destBusinessId !== businessId) {
            throw new common_1.ForbiddenException('Only the destination branch can perform this action');
        }
    }
    async assertSameBranchGroup(businessId, otherId) {
        if (businessId === otherId) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.SAME_BRANCH, 'Source and destination must be different branches', common_1.HttpStatus.BAD_REQUEST);
        }
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
        });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        const rootId = business.parentId ?? business.id;
        const group = await this.prisma.business.findMany({
            where: { OR: [{ id: rootId }, { parentId: rootId }] },
            select: { id: true },
        });
        if (!group.some((b) => b.id === otherId)) {
            throw new app_exception_1.AppException(stock_transfers_constants_1.STOCK_TRANSFER_ERROR_CODES.NOT_SAME_GROUP, 'Destination is not a branch of the same business group', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.StockTransfersService = StockTransfersService;
exports.StockTransfersService = StockTransfersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StockTransfersService);
//# sourceMappingURL=stock-transfers.service.js.map