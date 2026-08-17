import { WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowTriggerService } from '../workflow-trigger.service';
export declare class CreditOverdueScanProcessor extends WorkerHost {
    private readonly prisma;
    private readonly workflowTrigger;
    private readonly logger;
    constructor(prisma: PrismaService, workflowTrigger: WorkflowTriggerService);
    process(): Promise<void>;
    private scanBusiness;
    private alreadyFlaggedToday;
}
