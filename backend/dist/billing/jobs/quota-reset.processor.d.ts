import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
interface QuotaResetJobData {
    now?: string;
}
export declare class QuotaResetProcessor extends WorkerHost {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    process(job: Job<QuotaResetJobData>): Promise<void>;
    runReset(now?: Date): Promise<void>;
}
export {};
