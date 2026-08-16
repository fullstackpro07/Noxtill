import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { WaitlistService } from './waitlist.service';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { QuerySlotsDto } from './dto/query-slots.dto';
export declare class PublicBookingService {
    private readonly prisma;
    private readonly sendGate;
    private readonly waitlist;
    constructor(prisma: PrismaService, sendGate: SendGateService, waitlist: WaitlistService);
    private resolveBusiness;
    getBusinessInfo(slug: string): Promise<{
        businessName: string;
        branding: import("generated/prisma/runtime/library").JsonValue;
    }>;
    listServices(slug: string): Promise<{
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
    }[]>;
    getSlots(slug: string, query: QuerySlotsDto): Promise<{
        slots: string[];
    }>;
    createBooking(slug: string, dto: CreatePublicBookingDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
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
    reschedule(token: string, startsAt: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
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
    cancel(token: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
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
    private loadByToken;
}
