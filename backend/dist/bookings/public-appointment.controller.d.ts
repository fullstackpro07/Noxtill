import { PublicBookingService } from './public-booking.service';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
export declare class PublicAppointmentController {
    private readonly publicBookingService;
    constructor(publicBookingService: PublicBookingService);
    reschedule(token: string, dto: RescheduleAppointmentDto): Promise<{
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
    cancel(token: string): Promise<{
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
