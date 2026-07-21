import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhookIdempotencyService } from '../common/webhooks/webhook-idempotency.service';
export declare class WebhooksController {
    private readonly idempotency;
    private readonly config;
    private readonly webhookQueue;
    constructor(idempotency: WebhookIdempotencyService, config: ConfigService, webhookQueue: Queue);
    verifyMeta(query: Record<string, string>, res: Response): void;
    meta(req: RawBodyRequest<Request>, signature?: string): Promise<{
        received: boolean;
    }>;
    twilio(req: Request, signature?: string): Promise<{
        received: boolean;
    }>;
    email(req: Request, token?: string): Promise<{
        received: boolean;
    }>;
}
