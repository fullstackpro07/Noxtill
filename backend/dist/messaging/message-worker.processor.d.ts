import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRegistryService } from './templates/template-registry.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { EmailService } from './channels/email.service';
import { TerminologyService } from '../settings/terminology.service';
interface SendJobData {
    messageId: string;
}
export declare class MessageWorkerProcessor extends WorkerHost {
    private readonly prisma;
    private readonly templates;
    private readonly whatsapp;
    private readonly sms;
    private readonly email;
    private readonly terminology;
    private readonly logger;
    constructor(prisma: PrismaService, templates: TemplateRegistryService, whatsapp: WhatsappService, sms: SmsService, email: EmailService, terminology: TerminologyService);
    process(job: Job<SendJobData>): Promise<void>;
    private pickSender;
}
export {};
