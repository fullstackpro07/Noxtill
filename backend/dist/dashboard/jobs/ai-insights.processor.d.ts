import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AiInsightsService } from '../ai-insights.service';
export declare class AiInsightsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly aiInsightsService;
    private readonly logger;
    constructor(prisma: PrismaService, aiInsightsService: AiInsightsService);
    process(job: Job): Promise<void>;
    runGeneration(): Promise<void>;
}
