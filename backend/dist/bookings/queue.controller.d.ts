import { QueueService } from './queue.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class QueueController {
    private readonly queueService;
    constructor(queueService: QueueService);
    join(user: AuthenticatedUser, dto: JoinQueueDto): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<({
        customer: {
            id: string;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            birthday: Date | null;
            address: string | null;
            notes: string | null;
            tags: string[];
            consentMarketing: boolean;
            optedOut: boolean;
            lifetimeSpend: import("generated/prisma/runtime/library").Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
        } | null;
        service: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            active: boolean;
            category: string | null;
            kind: import("generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: import("generated/prisma/runtime/library").JsonValue;
            costPrice: import("generated/prisma/runtime/library").Decimal;
            sellingPrice: import("generated/prisma/runtime/library").Decimal;
            stockQty: number;
            lowStockThreshold: number;
            durationMin: number | null;
        } | null;
    } & {
        number: number;
        id: string;
        createdAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    })[]>;
    call(user: AuthenticatedUser, id: string): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    serve(id: string): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    skip(id: string): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
}
