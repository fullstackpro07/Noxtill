import { WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GmbManagementService } from './gmb-management.service';
export declare class GmbInsightsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly gmbManagement;
    private readonly logger;
    constructor(prisma: PrismaService, gmbManagement: GmbManagementService);
    process(): Promise<void>;
}
