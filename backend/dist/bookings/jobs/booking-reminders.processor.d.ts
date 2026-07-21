import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
interface BookingRemindersJobData {
    now?: string;
}
export declare class BookingRemindersProcessor extends WorkerHost {
    private readonly prisma;
    private readonly sendGate;
    private readonly logger;
    constructor(prisma: PrismaService, sendGate: SendGateService);
    process(job: Job<BookingRemindersJobData>): Promise<void>;
    runReminders(now?: Date): Promise<void>;
}
export {};
