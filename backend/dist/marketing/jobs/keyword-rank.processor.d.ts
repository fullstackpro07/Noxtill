import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SerpRankService } from '../serp-rank.service';
export declare class KeywordRankProcessor extends WorkerHost {
    private readonly prisma;
    private readonly serpRank;
    private readonly logger;
    constructor(prisma: PrismaService, serpRank: SerpRankService);
    process(job: Job): Promise<void>;
    runCheck(): Promise<void>;
    checkOne(businessId: string, keywordId: string, keyword: string, businessNameOverride?: string): Promise<void>;
}
