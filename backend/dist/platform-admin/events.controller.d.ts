import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
export declare class EventsController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    record(dto: CreateEventDto): import("generated/prisma").Prisma.Prisma__EventClient<{
        name: string;
        id: string;
        createdAt: Date;
        businessId: string | null;
        userId: string | null;
        properties: import("generated/prisma/runtime/library").JsonValue;
    }, never, import("generated/prisma/runtime/library").DefaultArgs, import("generated/prisma").Prisma.PrismaClientOptions>;
}
