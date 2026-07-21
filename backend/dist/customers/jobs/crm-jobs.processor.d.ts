import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
interface CrmTickJobData {
    now?: string;
}
export declare class CrmJobsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly locale;
    private readonly sendGate;
    private readonly logger;
    constructor(prisma: PrismaService, locale: LocaleService, sendGate: SendGateService);
    process(job: Job<CrmTickJobData>): Promise<void>;
    runTagRules(now?: Date): Promise<void>;
    runBirthdayGreetings(now?: Date): Promise<void>;
}
export {};
