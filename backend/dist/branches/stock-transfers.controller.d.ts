import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto, RejectStockTransferDto } from './dto/create-stock-transfer.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { StockTransferStatus } from '../../generated/prisma';
export declare class StockTransfersController {
    private readonly stockTransfers;
    constructor(stockTransfers: StockTransfersService);
    create(user: AuthenticatedUser, dto: CreateStockTransferDto): Promise<{
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
    list(user: AuthenticatedUser, status?: StockTransferStatus): import("../../generated/prisma").Prisma.PrismaPromise<({
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
    findOne(user: AuthenticatedUser, id: string): Promise<{
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
    approve(user: AuthenticatedUser, id: string): Promise<{
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
    ship(user: AuthenticatedUser, id: string): Promise<{
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
    receive(user: AuthenticatedUser, id: string): Promise<{
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
    reject(user: AuthenticatedUser, id: string, dto: RejectStockTransferDto): Promise<{
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
}
