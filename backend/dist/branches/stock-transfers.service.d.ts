import { PrismaService } from '../prisma/prisma.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { StockTransferStatus } from '../../generated/prisma';
export declare class StockTransfersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(sourceBusinessId: string, actorUserId: string, dto: CreateStockTransferDto): Promise<{
        items: ({
            sourceProduct: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
                active: boolean;
            };
        } & {
            id: string;
            createdAt: Date;
            qty: number;
            transferId: string;
            sourceProductId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    }>;
    list(businessId: string, status?: StockTransferStatus): import("../../generated/prisma").Prisma.PrismaPromise<({
        items: ({
            sourceProduct: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
                active: boolean;
            };
        } & {
            id: string;
            createdAt: Date;
            qty: number;
            transferId: string;
            sourceProductId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    })[]>;
    findOne(businessId: string, id: string): Promise<{
        items: ({
            sourceProduct: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
                active: boolean;
            };
        } & {
            id: string;
            createdAt: Date;
            qty: number;
            transferId: string;
            sourceProductId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    }>;
    approve(businessId: string, id: string, actorUserId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    }>;
    ship(businessId: string, id: string, actorUserId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    }>;
    receive(businessId: string, id: string, actorUserId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    }>;
    reject(businessId: string, id: string, actorUserId: string, reason?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockTransferStatus;
        note: string | null;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
        sourceBusinessId: string;
        destBusinessId: string;
        shippedByUserId: string | null;
        receivedByUserId: string | null;
    }>;
    private resolveDestProduct;
    private findWithStatus;
    private assertSourceCaller;
    private assertDestCaller;
    private assertSameBranchGroup;
}
