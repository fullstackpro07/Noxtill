import { AppointmentsService } from './appointments.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
export declare class AppointmentsController {
    private readonly appointmentsService;
    constructor(appointmentsService: AppointmentsService);
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
        };
        service: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            kind: import("generated/prisma").$Enums.ProductKind;
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
        status: import("generated/prisma").$Enums.AppointmentStatus;
        serviceId: string;
        staffUserId: string | null;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    })[]>;
    updateStatus(user: AuthenticatedUser, id: string, dto: UpdateAppointmentStatusDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        status: import("generated/prisma").$Enums.AppointmentStatus;
        serviceId: string;
        staffUserId: string | null;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
}
