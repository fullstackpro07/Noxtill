import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { QuerySlotsDto } from './dto/query-slots.dto';
export declare class PublicBookingService {
    private readonly prisma;
    private readonly sendGate;
    constructor(prisma: PrismaService, sendGate: SendGateService);
    private resolveBusiness;
    listServices(slug: string): Promise<{
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
    }[]>;
    getSlots(slug: string, query: QuerySlotsDto): Promise<{
        slots: string[];
    }>;
    createBooking(slug: string, dto: CreatePublicBookingDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.AppointmentStatus;
        serviceId: string;
        staffUserId: string | null;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("../../generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
    reschedule(token: string, startsAt: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.AppointmentStatus;
        serviceId: string;
        staffUserId: string | null;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("../../generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
    cancel(token: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.AppointmentStatus;
        serviceId: string;
        staffUserId: string | null;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("../../generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
    private loadByToken;
}
