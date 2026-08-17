import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhookIdempotencyService } from '../common/webhooks/webhook-idempotency.service';
export declare class SocialWebhookController {
    private readonly idempotency;
    private readonly config;
    private readonly queue;
    constructor(idempotency: WebhookIdempotencyService, config: ConfigService, queue: Queue);
    verify(platform: string, query: Record<string, string>, res: Response): void;
    receive(platform: string, req: RawBodyRequest<Request>, sharedToken?: string): Promise<{
        received: boolean;
    }>;
}
