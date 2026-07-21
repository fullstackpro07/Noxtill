import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
export declare class GoogleSyncProcessor extends WorkerHost {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    process(job: Job): Promise<void>;
    runSync(): Promise<void>;
    private fetchReviews;
    private pushReply;
}
