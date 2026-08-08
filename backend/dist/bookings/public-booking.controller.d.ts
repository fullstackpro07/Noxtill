import { PublicBookingService } from './public-booking.service';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
export declare class PublicBookingController {
    private readonly publicBookingService;
    constructor(publicBookingService: PublicBookingService);
    getBusinessInfo(biz: string): Promise<{
        businessName: string;
        branding: import("generated/prisma/runtime/library").JsonValue;
    }>;
    listServices(biz: string): Promise<{
        name: string;
        id: string;
        businessId: string;
        category: string | null;
        createdAt: Date;
        updatedAt: Date;
        kind: import("generated/prisma").$Enums.ProductKind;
        sku: string | null;
        variations: import("generated/prisma/runtime/library").JsonValue;
        costPrice: import("generated/prisma/runtime/library").Decimal;
        sellingPrice: import("generated/prisma/runtime/library").Decimal;
        stockQty: number;
        lowStockThreshold: number;
        durationMin: number | null;
        active: boolean;
    }[]>;
    getSlots(biz: string, query: QuerySlotsDto): Promise<{
        slots: string[];
    }>;
    createBooking(biz: string, dto: CreatePublicBookingDto): Promise<{
        id: string;
        businessId: string;
        customerId: string;
        status: import("generated/prisma").$Enums.AppointmentStatus;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string | null;
        serviceId: string;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
}
