import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { TemplateRegistryService } from './templates/template-registry.service';
import { Message } from '../../generated/prisma';
export interface SendGateParams {
    businessId: string;
    templateKey: string;
    variables: Record<string, string>;
    scheduledFor?: Date;
    customerId?: string;
    to?: {
        phone?: string;
        email?: string;
    };
    campaignId?: string;
}
export declare class SendGateService {
    private readonly tenantPrisma;
    private readonly templates;
    private readonly messagesQueue;
    constructor(tenantPrisma: TenantPrismaService, templates: TemplateRegistryService, messagesQueue: Queue);
    send(params: SendGateParams): Promise<Message>;
}
