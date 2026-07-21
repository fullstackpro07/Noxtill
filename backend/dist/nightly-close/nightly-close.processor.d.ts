import { WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { NightlyCloseService } from './nightly-close.service';
interface NightlyCloseJobData {
    businessId?: string;
}
export declare class NightlyCloseProcessor extends WorkerHost {
    private readonly queue;
    private readonly prisma;
    private readonly locale;
    private readonly nightlyClose;
    private readonly logger;
    constructor(queue: Queue<NightlyCloseJobData>, prisma: PrismaService, locale: LocaleService, nightlyClose: NightlyCloseService);
    process(job: Job<NightlyCloseJobData>): Promise<void>;
    private handleTick;
}
export {};
