import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityPubSubService } from './activity-pubsub.service';
import { ActivityEventType } from '../../generated/prisma';
export interface RecordActivityEventInput {
    type: ActivityEventType;
    description: string;
    amount?: number;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
}
interface ActivityEventPayload {
    id: string;
    type: ActivityEventType;
    description: string;
    amount: number | null;
    entityType: string | null;
    entityId: string | null;
    actorUserId: string | null;
    createdAt: string;
}
export declare class ActivityService {
    private readonly tenantPrisma;
    private readonly pubsub;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, pubsub: ActivityPubSubService);
    record(businessId: string, input: RecordActivityEventInput): Promise<void>;
    getRecentHistory(businessId: string, limit?: number): Promise<ActivityEventPayload[]>;
    stream(businessId: string): Observable<MessageEvent>;
    private toPayload;
}
export {};
