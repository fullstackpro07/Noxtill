import { PrismaService } from '../../prisma/prisma.service';
export declare class WebhookIdempotencyService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    claim(provider: string, eventId: string): Promise<boolean>;
    handle(provider: string, eventId: string, enqueue: () => Promise<void>): Promise<{
        duplicate: boolean;
    }>;
}
