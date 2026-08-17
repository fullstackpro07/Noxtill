import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { JoinQueueDto } from './dto/join-queue.dto';
export declare class QueueService {
    private readonly tenantPrisma;
    private readonly sendGate;
    constructor(tenantPrisma: TenantPrismaService, sendGate: SendGateService);
    join(businessId: string, dto: JoinQueueDto): Promise<{
        number: number;
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<({
        customer: {
            name: string;
            email: string | null;
            phone: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            address: string | null;
            birthday: Date | null;
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
        } | null;
    } & {
        number: number;
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    })[]>;
    call(businessId: string, id: string): Promise<{
        number: number;
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    serve(id: string): Promise<{
        number: number;
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    skip(id: string): Promise<{
        number: number;
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.QueueTokenStatus;
        serviceId: string | null;
        customerName: string | null;
        calledAt: Date | null;
        servedAt: Date | null;
    }>;
    private findWithStatus;
}
