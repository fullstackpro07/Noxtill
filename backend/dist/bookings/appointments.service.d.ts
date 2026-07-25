import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { AppointmentStatus } from '../../generated/prisma';
export declare class AppointmentsService {
    private readonly tenantPrisma;
    private readonly reviewRequests;
    constructor(tenantPrisma: TenantPrismaService, reviewRequests: ReviewRequestsService);
    findAll(query: QueryAppointmentsDto): import("generated/prisma/runtime/library").PrismaPromise<({
        customer: {
            name: string;
            email: string | null;
            phone: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
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
        };
        service: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            kind: import("../../generated/prisma").$Enums.ProductKind;
            category: string | null;
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
        updatedAt: Date;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.AppointmentStatus;
        staffUserId: string | null;
        serviceId: string;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("../../generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    })[]>;
    updateStatus(businessId: string, id: string, nextStatus: AppointmentStatus): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.AppointmentStatus;
        staffUserId: string | null;
        serviceId: string;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("../../generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
}
