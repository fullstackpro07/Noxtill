import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { WorkflowTriggerService } from '../../marketing/automations/workflow-trigger.service';
interface CrmTickJobData {
    now?: string;
}
export declare class CrmJobsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly locale;
    private readonly sendGate;
    private readonly workflowTrigger;
    private readonly logger;
    constructor(prisma: PrismaService, locale: LocaleService, sendGate: SendGateService, workflowTrigger: WorkflowTriggerService);
    process(job: Job<CrmTickJobData>): Promise<void>;
    runTagRules(now?: Date): Promise<void>;
    runBirthdayGreetings(now?: Date): Promise<void>;
}
export {};
