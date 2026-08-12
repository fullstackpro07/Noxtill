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
exports.TablesService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const order_totals_util_1 = require("./order-totals.util");
const tables_constants_1 = require("./tables.constants");
const prisma_1 = require("../../generated/prisma");
let TablesService = class TablesService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async list(businessId) {
        const [tables, activeOrders] = await Promise.all([
            this.tenantPrisma.client.table.findMany({
                where: { businessId },
                orderBy: { number: 'asc' },
            }),
            this.tenantPrisma.client.order.findMany({
                where: {
                    businessId,
                    status: { in: [...tables_constants_1.ACTIVE_ORDER_STATUSES] },
                    tableNo: { not: null },
                },
                select: { id: true, tableNo: true, total: true, createdAt: true },
            }),
        ]);
        const orderByTableNo = new Map(activeOrders.map((o) => [o.tableNo, o]));
        return tables.map((table) => {
            const order = orderByTableNo.get(table.number);
            return {
                ...table,
                activeOrderId: order?.id ?? null,
                runningTotal: order ? Number(order.total) : 0,
                openedAt: order?.createdAt ?? null,
            };
        });
    }
    async create(businessId, dto) {
        const existing = await this.tenantPrisma.client.table.findUnique({
            where: { businessId_number: { businessId, number: dto.number } },
        });
        if (existing) {
            throw new app_exception_1.AppException(tables_constants_1.TABLE_ERROR_CODES.NUMBER_TAKEN, `Table "${dto.number}" already exists`, common_1.HttpStatus.CONFLICT);
        }
        return this.tenantPrisma.client.table.create({
            data: { businessId, ...dto },
        });
    }
    async update(businessId, id, dto) {
        const table = await this.findOwned(businessId, id);
        return this.tenantPrisma.client.table.update({
            where: { id: table.id },
            data: dto,
        });
    }
    async openTable(businessId, id) {
        const table = await this.findOwned(businessId, id);
        return this.tenantPrisma.client.table.update({
            where: { id: table.id },
            data: { status: prisma_1.TableStatus.occupied, seatedAt: new Date() },
        });
    }
    async move(businessId, id, dto) {
        const source = await this.findOwned(businessId, id);
        const destination = await this.tenantPrisma.client.table.findUnique({
            where: { businessId_number: { businessId, number: dto.toTableNumber } },
        });
        if (!destination) {
            throw new app_exception_1.AppException(tables_constants_1.TABLE_ERROR_CODES.TABLE_NOT_FOUND, `Table "${dto.toTableNumber}" not found`, common_1.HttpStatus.NOT_FOUND);
        }
        const sourceOrder = await this.activeOrderAt(businessId, source.number);
        if (!sourceOrder) {
            throw new app_exception_1.AppException(tables_constants_1.TABLE_ERROR_CODES.NO_ACTIVE_ORDER, `Table "${source.number}" has no active order to move`, common_1.HttpStatus.BAD_REQUEST);
        }
        const destinationOrder = await this.activeOrderAt(businessId, destination.number);
        if (destinationOrder) {
            throw new app_exception_1.AppException(tables_constants_1.TABLE_ERROR_CODES.DESTINATION_OCCUPIED, `Table "${destination.number}" already has an active order`, common_1.HttpStatus.CONFLICT);
        }
        await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.order.update({
                where: { id: sourceOrder.id },
                data: { tableNo: destination.number },
            }),
            this.tenantPrisma.client.table.update({
                where: { id: source.id },
                data: { status: prisma_1.TableStatus.free, seatedAt: null },
            }),
            this.tenantPrisma.client.table.update({
                where: { id: destination.id },
                data: {
                    status: prisma_1.TableStatus.occupied,
                    seatedAt: source.seatedAt ?? new Date(),
                },
            }),
        ]);
        return this.listOne(businessId, destination.id);
    }
    async merge(businessId, id, dto) {
        const source = await this.findOwned(businessId, id);
        const destination = await this.tenantPrisma.client.table.findUnique({
            where: { businessId_number: { businessId, number: dto.intoTableNumber } },
        });
        if (!destination) {
            throw new app_exception_1.AppException(tables_constants_1.TABLE_ERROR_CODES.TABLE_NOT_FOUND, `Table "${dto.intoTableNumber}" not found`, common_1.HttpStatus.NOT_FOUND);
        }
        const sourceOrder = await this.activeOrderAt(businessId, source.number);
        const destinationOrder = await this.activeOrderAt(businessId, destination.number);
        if (!sourceOrder || !destinationOrder) {
            throw new app_exception_1.AppException(tables_constants_1.TABLE_ERROR_CODES.NO_ACTIVE_ORDER, 'Both tables need an active order to merge', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.tenantPrisma.client.$transaction(async (tx) => {
            await tx.orderItem.updateMany({
                where: { orderId: sourceOrder.id },
                data: { orderId: destinationOrder.id },
            });
            const items = await tx.orderItem.findMany({
                where: { orderId: destinationOrder.id },
            });
            const business = await tx.business.findUniqueOrThrow({
                where: { id: businessId },
            });
            const { subtotal, tax, total, cogs } = (0, order_totals_util_1.computeOrderTotals)(items.map((i) => ({
                price: Number(i.price),
                cost: Number(i.cost),
                qty: i.qty,
            })), Number(destinationOrder.discount), Number(business.taxRate));
            await tx.order.update({
                where: { id: destinationOrder.id },
                data: { subtotal, tax, total, cogs },
            });
            await tx.order.update({
                where: { id: sourceOrder.id },
                data: { status: prisma_1.OrderStatus.cancelled, tableNo: null },
            });
            await tx.table.update({
                where: { id: source.id },
                data: { status: prisma_1.TableStatus.free, seatedAt: null },
            });
        });
        return this.listOne(businessId, destination.id);
    }
    async listOne(businessId, id) {
        const rows = await this.list(businessId);
        const row = rows.find((r) => r.id === id);
        if (!row) {
            throw new common_1.NotFoundException('Table not found');
        }
        return row;
    }
    async activeOrderAt(businessId, tableNo) {
        return this.tenantPrisma.client.order.findFirst({
            where: {
                businessId,
                tableNo,
                status: { in: [...tables_constants_1.ACTIVE_ORDER_STATUSES] },
            },
        });
    }
    async findOwned(businessId, id) {
        const table = await this.tenantPrisma.client.table.findUnique({
            where: { id },
        });
        if (!table || table.businessId !== businessId) {
            throw new common_1.NotFoundException('Table not found');
        }
        return table;
    }
};
exports.TablesService = TablesService;
exports.TablesService = TablesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], TablesService);
//# sourceMappingURL=tables.service.js.map