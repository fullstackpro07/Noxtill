import { WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SocialAnalyticsService } from '../social-analytics.service';
export declare class SocialAnalyticsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly analytics;
    private readonly logger;
    constructor(prisma: PrismaService, analytics: SocialAnalyticsService);
    process(): Promise<void>;
}
