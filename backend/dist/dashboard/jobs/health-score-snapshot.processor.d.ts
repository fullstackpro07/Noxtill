import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { HealthScoreService } from '../health-score.service';
export declare class HealthScoreSnapshotProcessor extends WorkerHost {
    private readonly prisma;
    private readonly tenantPrisma;
    private readonly healthScoreService;
    private readonly logger;
    constructor(prisma: PrismaService, tenantPrisma: TenantPrismaService, healthScoreService: HealthScoreService);
    process(job: Job): Promise<void>;
    runSnapshot(): Promise<void>;
    snapshotOne(businessId: string): Promise<void>;
}
