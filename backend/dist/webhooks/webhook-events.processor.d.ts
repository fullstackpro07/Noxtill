import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
export declare class WebhookEventsProcessor extends WorkerHost {
    private readonly prisma;
    private readonly whatsappWindow;
    private readonly logger;
    constructor(prisma: PrismaService, whatsappWindow: WhatsappWindowService);
    process(job: Job): Promise<void>;
    private handleMetaStatus;
    private handleMetaInbound;
    private handleTwilioStatus;
    private handleEmailEvent;
}
