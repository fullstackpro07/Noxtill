import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { TriggerEvent } from './workflow-context.util';
import { ActivityEventType } from '../../../generated/prisma';
export declare class WorkflowTriggerService {
    private readonly prisma;
    private readonly sendGate;
    private readonly logger;
    constructor(prisma: PrismaService, sendGate: SendGateService);
    dispatch(businessId: string, type: ActivityEventType, event: TriggerEvent): Promise<void>;
    private runWorkflow;
    private executeActions;
}
