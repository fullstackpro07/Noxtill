import { WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { WorkflowTriggerService } from '../marketing/automations/workflow-trigger.service';
export declare class LowStockScanProcessor extends WorkerHost {
    private readonly prisma;
    private readonly sendGate;
    private readonly workflowTrigger;
    private readonly logger;
    constructor(prisma: PrismaService, sendGate: SendGateService, workflowTrigger: WorkflowTriggerService);
    process(): Promise<void>;
    private scanBusiness;
    private alreadyAlertedToday;
}
