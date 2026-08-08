import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { Prisma } from '../../generated/prisma';
export declare class EventsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    record(dto: CreateEventDto): Prisma.Prisma__EventClient<{
        id: string;
        name: string;
        createdAt: Date;
        businessId: string | null;
        userId: string | null;
        properties: Prisma.JsonValue;
    }, never, import("generated/prisma/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
}
