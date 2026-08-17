import { PublicBookingService } from './public-booking.service';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
export declare class PublicAppointmentController {
    private readonly publicBookingService;
    constructor(publicBookingService: PublicBookingService);
    reschedule(token: string, dto: RescheduleAppointmentDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        status: import("generated/prisma").$Enums.AppointmentStatus;
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
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        status: import("generated/prisma").$Enums.AppointmentStatus;
        staffUserId: string | null;
        serviceId: string;
        startsAt: Date;
        endsAt: Date;
        depositPaid: import("generated/prisma/runtime/library").Decimal;
        source: import("generated/prisma").$Enums.AppointmentSource;
        rescheduleToken: string | null;
    }>;
}
