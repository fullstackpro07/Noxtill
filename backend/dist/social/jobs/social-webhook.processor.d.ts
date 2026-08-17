import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SocialInboxService } from '../social-inbox.service';
import { SocialPlatform } from '../../../generated/prisma';
interface MetaFamilyEntry {
    id?: string;
    changes?: {
        value?: {
            comment_id?: string;
            post_id?: string;
            sender_name?: string;
            message?: string;
        };
    }[];
    messaging?: {
        sender?: {
            id?: string;
        };
        message?: {
            mid?: string;
            text?: string;
        };
        timestamp?: number;
    }[];
}
interface WebhookJobData {
    platform: SocialPlatform;
    body: {
        entry?: MetaFamilyEntry[];
        externalAccountId?: string;
        externalId?: string;
        kind?: 'comment' | 'dm';
        authorName?: string;
        text?: string;
        postExternalId?: string;
        receivedAt?: string;
    };
}
export declare class SocialWebhookProcessor extends WorkerHost {
    private readonly inbox;
    private readonly logger;
    constructor(inbox: SocialInboxService);
    process(job: Job<WebhookJobData>): Promise<void>;
}
export {};
